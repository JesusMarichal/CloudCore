"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNginxScript = buildNginxScript;
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
    location / {
        try_files $uri $uri/ /index.php?$args;
    }
    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php-fpm.sock;
    }`;
    }
}
function buildNginxScript(ctx, serve) {
    const { safeName, data } = ctx;
    const finalDomain = data.domain && data.domain.trim() !== '' ? data.domain : '_';
    const hasDomain = finalDomain !== '_';
    const serverNames = (hasDomain && data.setupWwwAlias)
        ? `${finalDomain} www.${finalDomain}`
        : finalDomain;
    const useSSL = data.useLetsEncrypt && hasDomain;
    const certbotDomains = (hasDomain && data.setupWwwAlias)
        ? `-d ${finalDomain} -d www.${finalDomain}`
        : `-d ${finalDomain}`;
    return `
        # Configuración de Nginx (Estilo Cleavr)
        if command -v nginx > /dev/null; then
            echo "⚙️ Configurando Nginx para ${serverNames}..."

            # 1. Configuración temporal para validación HTTP (para que Certbot pueda validar)
            echo 'server {
    listen 80;
    server_name ${serverNames};

${locationBlock(serve)}
}' | sudo tee /etc/nginx/sites-available/${safeName} > /dev/null

            sudo ln -sf /etc/nginx/sites-available/${safeName} /etc/nginx/sites-enabled/

            if [ "${finalDomain}" = "_" ]; then
                sudo rm -f /etc/nginx/sites-enabled/default
            fi

            sudo nginx -t && sudo systemctl reload nginx

            # 2. Generar SSL si se solicitó
            if [ "${useSSL ? 'true' : 'false'}" = "true" ]; then
                if ! command -v certbot > /dev/null; then
                    echo "📦 Certbot no detectado, instalando..."
                    sudo apt update && sudo DEBIAN_FRONTEND=noninteractive apt install -y certbot python3-certbot-nginx
                fi
                echo "🔐 Solicitando certificado SSL con Let's Encrypt para ${serverNames}..."
                # Intentar obtener el certificado. --redirect forzará la redirección automática en Nginx
                if sudo certbot --nginx ${certbotDomains} --non-interactive --agree-tos --email ${data.userEmail || 'admin@' + (finalDomain !== '_' ? finalDomain : 'example.com')} --redirect; then
                    echo "✅ Certificado SSL instalado y redirección HTTPS activa."
                else
                    echo "❌ ERROR: No se pudo obtener el certificado. Verifica que el dominio apunte a la IP de este servidor."
                    echo "🔔 El sitio seguirá funcionando por HTTP (puerto 80)."
                fi
            else
                echo "ℹ️ SSL no solicitado. El sitio estará disponible por HTTP."
            fi

            sudo nginx -t && sudo systemctl reload nginx
            echo "✅ Configuración final de Nginx completada."
        else
            echo "⚠️ ADVERTENCIA: Nginx no instalado. El sitio solo será accesible internamente o por IP:puerto."
        fi
        `;
}
//# sourceMappingURL=nginx.util.js.map