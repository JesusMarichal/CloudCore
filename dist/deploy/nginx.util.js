"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fallbackHostname = fallbackHostname;
exports.buildBaseNginxScript = buildBaseNginxScript;
exports.buildNginxScript = buildNginxScript;
const PHP_SOCK_PLACEHOLDER = '__CLOUDCORE_PHP_FPM_SOCK__';
function locationBlock(serve) {
    switch (serve.kind) {
        case 'proxy':
            return `    location / {
        proxy_pass http://127.0.0.1:${serve.port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }`;
        case 'static':
            return `    root ${serve.docroot};
    index index.html;
    location / {
        try_files $uri $uri/ =404;
    }`;
        case 'php':
            return `    root ${serve.docroot};
    index index.php index.html;

    client_max_body_size ${serve.clientMaxBodySize || '64M'};

    # Nada de servir ficheros ocultos ni copias de configuracion. Se exceptua
    # /.well-known, que es por donde Certbot valida el dominio.
    # (Sin apostrofes: el vhost se escribe desde un echo entre comillas simples.)
    location ~ /\\.(?!well-known).* { deny all; }
    location ~* wp-config\\.php { deny all; }
    location ~* \\.(sql|bak|log|ini|conf|sh)$ { deny all; }

${serve.extraConfig ? serve.extraConfig + '\n' : ''}
    # Estáticos: caché larga y sin pasar por PHP.
    location ~* \\.(jpg|jpeg|png|gif|webp|avif|svg|ico|css|js|woff2?|ttf|eot|mp4|webm)$ {
        expires 30d;
        access_log off;
        try_files $uri =404;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:${PHP_SOCK_PLACEHOLDER};
        fastcgi_read_timeout 300;
    }

    location / {
        try_files $uri $uri/ /index.php?$args;
    }`;
    }
}
function phpSocketFixup(safeName) {
    return `
            # El socket de PHP-FPM depende de la versión instalada: resolverlo aquí
            # evita fijar una ruta que no exista en esta distro.
            PHP_FPM_SOCK=$(ls -1 /run/php/php*-fpm.sock /var/run/php/php*-fpm.sock 2>/dev/null | sort -V | tail -1)
            if [ -z "$PHP_FPM_SOCK" ]; then
                echo "❌ No se encontró ningún socket de PHP-FPM. ¿Está php-fpm instalado y corriendo?"
                sudo systemctl list-units 'php*-fpm*' --no-pager 2>/dev/null || true
            else
                echo "🐘 PHP-FPM detectado en $PHP_FPM_SOCK"
                sudo sed -i "s|${PHP_SOCK_PLACEHOLDER}|$PHP_FPM_SOCK|g" /etc/nginx/sites-available/${safeName}
            fi
`;
}
function fallbackHostname(safeName, ip) {
    return `${safeName}.${ip.replace(/\./g, '-')}.sslip.io`;
}
function buildBaseNginxScript() {
    return `
        if command -v nginx > /dev/null; then
            echo "🛡️  Asegurando vhost por defecto (evita que un host desconocido cargue otro sitio)..."

            echo 'server {
    listen 80 default_server;
    server_name _;
    access_log off;
    return 444;
}' | sudo tee /etc/nginx/sites-available/00-default > /dev/null
            sudo ln -sf /etc/nginx/sites-available/00-default /etc/nginx/sites-enabled/00-default

            # El vhost "default" de la distro también es default_server: lo sustituye
            # el centinela de arriba. Este es el UNICO punto del panel que lo borra.
            sudo rm -f /etc/nginx/sites-enabled/default

            # Centinela equivalente para HTTPS. ssl_reject_handshake rechaza un SNI
            # desconocido sin necesitar certificado, pero existe desde Nginx 1.19.4;
            # en versiones anteriores se omite (Ubuntu 22.04 trae 1.18).
            NGINX_VER=$(nginx -v 2>&1 | tr '/' ' ' | awk '{print $NF}')
            NGINX_MIN=$( { echo "$NGINX_VER"; echo 1.19.4; } | sort -V | head -1 )
            if [ -n "$NGINX_VER" ] && [ "$NGINX_MIN" = "1.19.4" ]; then
                echo 'server {
    listen 443 ssl default_server;
    ssl_reject_handshake on;
}' | sudo tee /etc/nginx/sites-available/00-default-ssl > /dev/null
                sudo ln -sf /etc/nginx/sites-available/00-default-ssl /etc/nginx/sites-enabled/00-default-ssl
                # Si por lo que sea no valida, se retira sin dejar Nginx roto.
                sudo nginx -t >/dev/null 2>&1 || sudo rm -f /etc/nginx/sites-enabled/00-default-ssl
            fi

            sudo nginx -t && sudo systemctl reload nginx
        fi
        `;
}
function buildNginxScript(ctx, serve) {
    const { safeName, server, data } = ctx;
    const rawDomain = data.domain?.trim();
    const hasDomain = !!rawDomain && rawDomain !== '_';
    const primaryHost = hasDomain ? rawDomain : fallbackHostname(safeName, server.ip);
    const serverNames = hasDomain
        ? (data.setupWwwAlias ? `${primaryHost} www.${primaryHost}` : primaryHost)
        : `${primaryHost} ${server.ip}`;
    const useSSL = !!data.useLetsEncrypt && hasDomain;
    const certbotDomains = (hasDomain && data.setupWwwAlias)
        ? `-d ${primaryHost} -d www.${primaryHost}`
        : `-d ${primaryHost}`;
    return `
${buildBaseNginxScript()}

        # Configuración de Nginx (Estilo Cleavr)
        if command -v nginx > /dev/null; then
            echo "⚙️ Configurando Nginx para ${serverNames}..."

            # 1. Configuración temporal para validación HTTP (para que Certbot pueda validar)
            echo 'server {
    listen 80;
    server_name ${serverNames};

    # Logs propios: un despliegue no debe mezclar ni borrar los de otros sitios.
    access_log /var/log/nginx/${safeName}.access.log;
    error_log  /var/log/nginx/${safeName}.error.log;

${locationBlock(serve)}
}' | sudo tee /etc/nginx/sites-available/${safeName} > /dev/null
${serve.kind === 'php' ? phpSocketFixup(safeName) : ''}
            sudo ln -sf /etc/nginx/sites-available/${safeName} /etc/nginx/sites-enabled/${safeName}

            sudo nginx -t && sudo systemctl reload nginx

            # 2. Generar SSL si se solicitó
            if [ "${useSSL ? 'true' : 'false'}" = "true" ]; then
                if ! command -v certbot > /dev/null; then
                    echo "📦 Certbot no detectado, instalando..."
                    sudo apt update && sudo DEBIAN_FRONTEND=noninteractive apt install -y certbot python3-certbot-nginx
                fi
                echo "🔐 Solicitando certificado SSL con Let's Encrypt para ${serverNames}..."
                # Intentar obtener el certificado. --redirect forzará la redirección automática en Nginx
                if sudo certbot --nginx ${certbotDomains} --non-interactive --agree-tos --email ${data.userEmail || 'admin@' + (hasDomain ? primaryHost : 'example.com')} --redirect; then
                    echo "✅ Certificado SSL instalado y redirección HTTPS activa."
                else
                    echo "❌ ERROR: No se pudo obtener el certificado. Verifica que el dominio apunte a la IP de este servidor."
                    echo "🔔 El sitio seguirá funcionando por HTTP (puerto 80)."
                fi
            else
                echo "ℹ️ SSL no solicitado. El sitio está disponible en http://${primaryHost}${hasDomain ? '' : ` y en http://${server.ip}`}"
            fi

            sudo nginx -t && sudo systemctl reload nginx
            echo "✅ Configuración final de Nginx completada."
        else
            echo "⚠️ ADVERTENCIA: Nginx no instalado. El sitio solo será accesible internamente o por IP:puerto."
        fi
        `;
}
//# sourceMappingURL=nginx.util.js.map