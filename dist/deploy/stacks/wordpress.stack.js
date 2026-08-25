"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordpressStack = exports.WP_UPLOAD_PREFIX = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const nginx_util_1 = require("../nginx.util");
exports.WP_UPLOAD_PREFIX = '/tmp/cloudcore-wp-';
function sq(value) {
    return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}
function sqlIdent(value, max) {
    return value.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, max);
}
let WordpressStack = class WordpressStack {
    constructor() {
        this.id = 'wordpress';
        this.label = 'WordPress / PHP-FPM';
        this.usesGit = false;
        this.needsPort = false;
    }
    prepare(ctx) {
        const { data, safeName, projectPath, server } = ctx;
        const mode = data.wpMode === 'migrate' ? 'migrate' : 'fresh';
        const directory = (data.wpDirectory || '')
            .trim()
            .replace(/^\/+|\/+$/g, '')
            .replace(/[^a-zA-Z0-9_\-/]/g, '');
        const installPath = directory ? `${projectPath}/${directory}` : projectPath;
        const rawDomain = data.domain?.trim();
        const hasDomain = !!rawDomain && rawDomain !== '_';
        const host = hasDomain ? rawDomain : (0, nginx_util_1.fallbackHostname)(safeName, server.ip);
        const scheme = data.useLetsEncrypt && hasDomain ? 'https' : 'http';
        const path = directory ? '/' + directory : '';
        const siteUrl = `${scheme}://${host}${path}`;
        const installUrl = `http://${host}${path}`;
        const externalDb = !!(data.wpDbHost && data.wpDbName && data.wpDbUser);
        const suffix = (0, crypto_1.createHash)('sha1').update(`${server.id}:${safeName}`).digest('hex').slice(0, 4);
        const dbName = externalDb
            ? sqlIdent(data.wpDbName, 64)
            : sqlIdent(`wp_${safeName}_${suffix}`, 60);
        const dbUser = externalDb
            ? sqlIdent(data.wpDbUser, 32)
            : sqlIdent(`wp_${safeName.slice(0, 20)}_${suffix}`, 30);
        const dbPassword = externalDb
            ? (data.wpDbPassword || '')
            : (0, crypto_1.randomBytes)(18).toString('base64url');
        return {
            mode,
            directory,
            installPath,
            docroot: projectPath,
            host,
            siteUrl,
            installUrl,
            adminUrl: `${siteUrl}/wp-admin`,
            externalDb,
            dbHost: externalDb ? data.wpDbHost : 'localhost',
            dbName,
            dbUser,
            dbPassword,
            tablePrefix: (data.wpTablePrefix || 'wp_').replace(/[^a-zA-Z0-9_]/g, '') || 'wp_',
            adminUser: data.wpAdminUser,
            adminEmail: data.wpAdminEmail,
            locale: data.wpLocale || 'es_ES',
        };
    }
    configOf(ctx) {
        const stored = ctx.stackConfig;
        if (stored && stored.installPath && stored.dbName)
            return stored;
        return this.prepare(ctx);
    }
    serve(ctx) {
        const cfg = this.configOf(ctx);
        const subdir = cfg.directory
            ? `    location /${cfg.directory}/ {
        try_files $uri $uri/ /${cfg.directory}/index.php?$args;
    }
`
            : '';
        const hardening = `    location = /xmlrpc.php { deny all; access_log off; }
    location ~* /wp-content/uploads/.*\\.(php|phtml|php[0-9])$ { deny all; }
    location ~* /wp-content/(debug\\.log|upgrade/|uploads/.*\\.sql)$ { deny all; }
    location = /wp-config-sample.php { deny all; }
    location = /readme.html { deny all; access_log off; }
    location = /robots.txt { access_log off; log_not_found off; }
    location = /favicon.ico { access_log off; log_not_found off; }`;
        return {
            kind: 'php',
            docroot: cfg.docroot,
            clientMaxBodySize: '128M',
            extraConfig: `${subdir}${hardening}`,
        };
    }
    postNginxScript(ctx) {
        const cfg = this.configOf(ctx);
        return `
        WP_PATH=${sq(cfg.installPath)}
        WP="sudo -E wp --allow-root"

        if [ -f "$WP_PATH/wp-settings.php" ]; then
            TARGET_URL=${sq(cfg.installUrl)}
            if sudo test -d /etc/letsencrypt/live/${cfg.host}; then
                TARGET_URL=${sq(cfg.siteUrl.replace(/^http:/, 'https:'))}
            fi

            CURRENT_URL=$($WP option get siteurl --path="$WP_PATH" --skip-plugins --skip-themes 2>/dev/null)
            if [ -n "$CURRENT_URL" ] && [ "$CURRENT_URL" != "$TARGET_URL" ]; then
                echo "🔁 Fijando la URL definitiva del sitio: $TARGET_URL"
                $WP search-replace "$CURRENT_URL" "$TARGET_URL" --path="$WP_PATH" \\
                    --all-tables-with-prefix --precise --skip-columns=guid \\
                    --report-changed-only --skip-plugins --skip-themes 2>/dev/null || true
                $WP option update home    "$TARGET_URL" --path="$WP_PATH" --skip-plugins --skip-themes > /dev/null 2>&1 || true
                $WP option update siteurl "$TARGET_URL" --path="$WP_PATH" --skip-plugins --skip-themes > /dev/null 2>&1 || true
            fi

            $WP rewrite flush --hard --path="$WP_PATH" > /dev/null 2>&1 || true
            $WP cache flush --path="$WP_PATH" > /dev/null 2>&1 || true
            sudo chown -R www-data:www-data ${cfg.docroot}
            echo "🌐 El sitio está publicado en $TARGET_URL"
            echo "🔐 Escritorio: $TARGET_URL/wp-admin"
        fi
`;
    }
    buildAppScript(ctx) {
        const cfg = this.configOf(ctx);
        const { projectPath, data } = ctx;
        return `
${this.helpersScript()}
${this.prepareServerScript(cfg)}

        echo ""
        echo "🧹 Preparando carpeta del sitio..."
        sudo rm -rf ${projectPath}
        sudo mkdir -p ${cfg.installPath}
        sudo chown -R $USER:$USER ${projectPath}
        WP_PATH=${sq(cfg.installPath)}

${cfg.externalDb ? this.externalDbNoticeScript(cfg) : this.createDatabaseScript(cfg)}

${cfg.mode === 'migrate' ? this.migrateScript(ctx, cfg) : this.freshInstallScript(ctx, cfg)}

${this.finalizeScript(ctx, cfg)}

        echo ""
        echo "══════════════════════════════════════════════════════════"
        echo "  WordPress listo"
        echo "══════════════════════════════════════════════════════════"
${cfg.mode === 'fresh' && data.wpAdminUser ? `        echo "  👤 Usuario     : ${cfg.adminUser}"` : ''}
        echo "  🗄️  Base datos  : ${cfg.dbName}"
        echo "  👥 Usuario BD  : ${cfg.dbUser}"
${cfg.externalDb ? '' : `        echo "  🔑 Clave BD    : ${cfg.dbPassword}"
        echo "     (guardada en el panel; anótala si vas a usar phpMyAdmin)"`}
        echo "══════════════════════════════════════════════════════════"
`;
    }
    helpersScript() {
        return `
        # Trae un archivo que puede venir de una subida del panel (ya está en el
        # servidor) o de una URL pública indicada por el cliente.
        cc_fetch() {
            src="$1"; dest="$2"
            case "$src" in
                ${exports.WP_UPLOAD_PREFIX}*)
                    [ -f "$src" ] || { echo "❌ El archivo subido ya no está en el servidor: $src"; return 1; }
                    cp "$src" "$dest" || return 1
                    ;;
                http://*|https://*)
                    echo "⬇️  Descargando $(basename "$src")..."
                    curl -fsSL --retry 3 --max-time 900 -o "$dest" "$src" || { echo "❌ No se pudo descargar: $src"; return 1; }
                    ;;
                *)
                    echo "❌ Origen no soportado (usa una URL http(s) o sube el archivo desde el panel): $src"
                    return 1
                    ;;
            esac
            [ -s "$dest" ] || { echo "❌ El archivo llegó vacío: $src"; return 1; }
        }

        # Extrae un .zip / .tar.gz / .tgz / .tar en el directorio indicado.
        cc_extract() {
            file="$1"; target="$2"
            mkdir -p "$target"
            case "$file" in
                *.zip)            unzip -q -o "$file" -d "$target" ;;
                *.tar.gz|*.tgz)   tar -xzf "$file" -C "$target" ;;
                *.tar)            tar -xf  "$file" -C "$target" ;;
                *.gz)             gunzip -c "$file" > "$target/dump.sql" ;;
                *)
                    # Sin extensión fiable: se prueba por contenido real.
                    if file "$file" 2>/dev/null | grep -qi zip; then
                        unzip -q -o "$file" -d "$target"
                    elif file "$file" 2>/dev/null | grep -qi gzip; then
                        tar -xzf "$file" -C "$target" 2>/dev/null || gunzip -c "$file" > "$target/dump.sql"
                    else
                        echo "❌ Formato de archivo no reconocido: $file"; return 1
                    fi
                    ;;
            esac
        }
`;
    }
    prepareServerScript(cfg) {
        return `
        export DEBIAN_FRONTEND=noninteractive
        echo "🔧 Preparando el servidor para WordPress..."

        # --- PHP-FPM y extensiones requeridas por WordPress ---
        if ! command -v php > /dev/null 2>&1; then
            echo "📦 Instalando PHP y sus extensiones..."
            sudo apt-get update -qq
            sudo apt-get install -y -qq php-fpm php-mysql php-curl php-gd php-mbstring \\
                php-xml php-zip php-intl php-bcmath php-imagick > /dev/null 2>&1 \\
                || { echo "❌ No se pudo instalar PHP."; exit 1; }
        fi
        sudo apt-get install -y -qq unzip curl file > /dev/null 2>&1 || true

        PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null)
        echo "🐘 PHP $PHP_VER"

        # Los valores por defecto de PHP (2M de subida) impiden instalar temas o
        # plugins desde el escritorio de WordPress.
        FPM_INI="/etc/php/$PHP_VER/fpm/php.ini"
        if [ -f "$FPM_INI" ]; then
            sudo sed -i 's/^\\s*upload_max_filesize\\s*=.*/upload_max_filesize = 128M/' "$FPM_INI"
            sudo sed -i 's/^\\s*post_max_size\\s*=.*/post_max_size = 128M/'             "$FPM_INI"
            sudo sed -i 's/^\\s*memory_limit\\s*=.*/memory_limit = 256M/'               "$FPM_INI"
            sudo sed -i 's/^\\s*max_execution_time\\s*=.*/max_execution_time = 300/'    "$FPM_INI"
            sudo sed -i 's/^\\s*max_input_vars\\s*=.*/max_input_vars = 3000/'           "$FPM_INI"
        fi
        sudo systemctl enable --now "php$PHP_VER-fpm" > /dev/null 2>&1 || true
        sudo systemctl restart "php$PHP_VER-fpm" > /dev/null 2>&1 || true

        # --- WP-CLI: es lo que hace de "instalador automático" ---
        if ! command -v wp > /dev/null 2>&1; then
            echo "📦 Instalando WP-CLI..."
            curl -fsSL -o /tmp/wp-cli.phar https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \\
                || { echo "❌ No se pudo descargar WP-CLI."; exit 1; }
            sudo mv /tmp/wp-cli.phar /usr/local/bin/wp
            sudo chmod +x /usr/local/bin/wp
        fi
        WP="sudo -E wp --allow-root"

        # Restos de subidas anteriores que nunca llegaron a desplegarse.
        find /tmp -maxdepth 1 -name "$(basename ${exports.WP_UPLOAD_PREFIX})*" -mtime +1 -delete 2>/dev/null || true
${cfg.externalDb ? '' : this.prepareMariadbScript()}
`;
    }
    prepareMariadbScript() {
        return `
        # --- MariaDB local (equivalente a "Bases de datos MySQL" del cPanel) ---
        if ! command -v mysql > /dev/null 2>&1 && ! command -v mariadb > /dev/null 2>&1; then
            echo "📦 Instalando MariaDB..."
            sudo apt-get update -qq
            sudo apt-get install -y -qq mariadb-server > /dev/null 2>&1 \\
                || { echo "❌ No se pudo instalar MariaDB."; exit 1; }
        fi

        sudo systemctl enable --now mariadb > /dev/null 2>&1 \\
            || sudo systemctl enable --now mysql > /dev/null 2>&1 || true

        # Si el panel ya tenía un MySQL en Docker publicado en el 3306, MariaDB no
        # arranca. WordPress se conecta por socket Unix, así que basta con moverla
        # a otro puerto TCP en lugar de pelear por el 3306.
        if ! sudo mysqladmin ping --silent > /dev/null 2>&1; then
            if sudo ss -ltn 2>/dev/null | grep -q ':3306 '; then
                echo "ℹ️  El puerto 3306 ya está ocupado: MariaDB pasa al 3307 (WordPress usa el socket local)."
                echo '[mysqld]
port = 3307
bind-address = 127.0.0.1' | sudo tee /etc/mysql/mariadb.conf.d/99-cloudcore.cnf > /dev/null
                sudo systemctl restart mariadb > /dev/null 2>&1 || true
            fi
        fi

        sudo mysqladmin ping --silent > /dev/null 2>&1 \\
            || { echo "❌ MariaDB no responde. Revisa: sudo systemctl status mariadb"; exit 1; }
        echo "🗄️  MariaDB operativa."
`;
    }
    createDatabaseScript(cfg) {
        return `
        echo ""
        echo "🗄️  Creando base de datos ${cfg.dbName} y usuario ${cfg.dbUser}..."
        sudo mysql -e "CREATE DATABASE IF NOT EXISTS \\\`${cfg.dbName}\\\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" \\
            || { echo "❌ No se pudo crear la base de datos."; exit 1; }
        sudo mysql -e "CREATE USER IF NOT EXISTS '${cfg.dbUser}'@'localhost' IDENTIFIED BY '${cfg.dbPassword}';" \\
            || { echo "❌ No se pudo crear el usuario de base de datos."; exit 1; }
        sudo mysql -e "ALTER USER '${cfg.dbUser}'@'localhost' IDENTIFIED BY '${cfg.dbPassword}';"
        sudo mysql -e "GRANT ALL PRIVILEGES ON \\\`${cfg.dbName}\\\`.* TO '${cfg.dbUser}'@'localhost'; FLUSH PRIVILEGES;" \\
            || { echo "❌ No se pudieron asignar los privilegios."; exit 1; }
        echo "✅ Base de datos lista (todos los privilegios para ${cfg.dbUser})."
`;
    }
    externalDbNoticeScript(cfg) {
        return `
        echo ""
        echo "🗄️  Usando la base de datos externa indicada: ${cfg.dbUser}@${cfg.dbHost}/${cfg.dbName}"
        echo "    El panel no creará ni modificará ninguna base de datos local."
`;
    }
    freshInstallScript(ctx, cfg) {
        const { data } = ctx;
        const adminUser = data.wpAdminUser || 'admin';
        const adminPass = data.wpAdminPassword || '';
        const adminEmail = data.wpAdminEmail || data.userEmail || `admin@${cfg.host}`;
        const title = data.wpTitle || ctx.data.name;
        return `
        echo ""
        echo "⬇️  Descargando WordPress (${cfg.locale})..."
        $WP core download --path="$WP_PATH" --locale=${sq(cfg.locale)} --force \\
            || { echo "❌ No se pudo descargar el núcleo de WordPress."; exit 1; }

        echo "⚙️  Escribiendo wp-config.php..."
        $WP config create --path="$WP_PATH" \\
            --dbname=${sq(cfg.dbName)} \\
            --dbuser=${sq(cfg.dbUser)} \\
            --dbpass=${sq(cfg.dbPassword)} \\
            --dbhost=${sq(cfg.dbHost)} \\
            --dbprefix=${sq(cfg.tablePrefix)} \\
            --locale=${sq(cfg.locale)} \\
            --skip-check --force \\
            || { echo "❌ No se pudo escribir wp-config.php."; exit 1; }

        echo "🚀 Instalando WordPress en ${cfg.installUrl}..."
        $WP core install --path="$WP_PATH" \\
            --url=${sq(cfg.installUrl)} \\
            --title=${sq(title)} \\
            --admin_user=${sq(adminUser)} \\
            --admin_password=${sq(adminPass)} \\
            --admin_email=${sq(adminEmail)} \\
            --skip-email \\
            || { echo "❌ Falló la instalación de WordPress."; exit 1; }

        # Enlaces permanentes legibles y ajustes de seguridad habituales.
        $WP rewrite structure '/%postname%/' --path="$WP_PATH" > /dev/null 2>&1 || true
        $WP config set DISALLOW_FILE_EDIT true --raw --path="$WP_PATH" > /dev/null 2>&1 || true
        $WP config set FS_METHOD direct --path="$WP_PATH" > /dev/null 2>&1 || true
        $WP config set WP_AUTO_UPDATE_CORE minor --path="$WP_PATH" > /dev/null 2>&1 || true

        echo "✅ WordPress instalado."
`;
    }
    migrateScript(ctx, cfg) {
        const { data, safeName } = ctx;
        const archive = data.wpArchiveUrl || '';
        const dump = data.wpDbDumpUrl || '';
        const doReplace = data.wpSearchReplace !== false;
        if (!archive) {
            return `
        echo "❌ Para migrar un WordPress existente hace falta el archivo con los ficheros del sitio (.zip o .tar.gz)."
        exit 1
`;
        }
        return `
        WORK=/tmp/ccwp_${safeName}
        rm -rf "$WORK"; mkdir -p "$WORK/files"
        DETECTED_PREFIX=""

        # ── Paso 1: archivos del WordPress existente ──
        echo ""
        echo "📦 Obteniendo los archivos del sitio..."
        cc_fetch ${sq(archive)} "$WORK/site_archive" || exit 1
        # El nombre original importa para elegir el descompresor.
        ARCHIVE_NAME=$(basename ${sq(archive)} | sed 's/[?#].*$//')
        cp "$WORK/site_archive" "$WORK/$ARCHIVE_NAME" 2>/dev/null || ARCHIVE_NAME="site_archive"
        cc_extract "$WORK/$ARCHIVE_NAME" "$WORK/files" || exit 1

        # La raíz real de WordPress puede estar envuelta en una carpeta
        # (public_html/, backup/, el nombre del dominio…). Se busca wp-includes.
        WP_SRC=$(find "$WORK/files" -maxdepth 4 -type d -name wp-includes 2>/dev/null | head -1)
        if [ -z "$WP_SRC" ]; then
            echo "❌ En el archivo no se encontró una instalación de WordPress (falta wp-includes)."
            echo "   Comprime la carpeta que contiene wp-admin, wp-content y wp-includes."
            exit 1
        fi
        WP_SRC=$(dirname "$WP_SRC")
        echo "📂 WordPress encontrado en $(basename "$WP_SRC")"

        mkdir -p "$WP_PATH"
        # Se mueven también los ocultos (.htaccess es imprescindible para las URLs).
        (shopt -s dotglob 2>/dev/null || true; mv "$WP_SRC"/* "$WP_PATH"/ 2>/dev/null) \\
            || { cp -a "$WP_SRC"/. "$WP_PATH"/ || { echo "❌ No se pudieron copiar los archivos."; exit 1; }; }
        [ -f "$WP_PATH/wp-settings.php" ] || { echo "❌ La copia quedó incompleta (falta wp-settings.php)."; exit 1; }
        echo "✅ Archivos colocados en $WP_PATH"

${dump ? this.importDumpScript(cfg, dump) : `
        echo "ℹ️  No se indicó volcado .sql: se conservará la base de datos a la que ya apunte wp-config.php."`}

        # ── Paso 4: conectar los archivos con la base de datos ──
        echo ""
        echo "⚙️  Ajustando wp-config.php a la base de datos de este servidor..."
        if [ -f "$WP_PATH/wp-config.php" ]; then
            $WP config set DB_NAME     ${sq(cfg.dbName)}     --path="$WP_PATH" --type=constant > /dev/null
            $WP config set DB_USER     ${sq(cfg.dbUser)}     --path="$WP_PATH" --type=constant > /dev/null
            $WP config set DB_PASSWORD ${sq(cfg.dbPassword)} --path="$WP_PATH" --type=constant > /dev/null
            $WP config set DB_HOST     ${sq(cfg.dbHost)}     --path="$WP_PATH" --type=constant > /dev/null
            [ -n "$DETECTED_PREFIX" ] && $WP config set table_prefix "$DETECTED_PREFIX" --path="$WP_PATH" --type=variable > /dev/null
            echo "✅ wp-config.php actualizado (DB_NAME, DB_USER, DB_PASSWORD, DB_HOST)."
        else
            echo "ℹ️  El archivo no traía wp-config.php: se genera uno nuevo."
            $WP config create --path="$WP_PATH" \\
                --dbname=${sq(cfg.dbName)} --dbuser=${sq(cfg.dbUser)} \\
                --dbpass=${sq(cfg.dbPassword)} --dbhost=${sq(cfg.dbHost)} \\
                --dbprefix="\${DETECTED_PREFIX:-${cfg.tablePrefix}}" --skip-check --force \\
                || { echo "❌ No se pudo escribir wp-config.php."; exit 1; }
        fi

        $WP config set FS_METHOD direct --path="$WP_PATH" > /dev/null 2>&1 || true

        # Comprobar que WordPress conecta antes de tocar nada más.
        if ! $WP db check --path="$WP_PATH" --skip-plugins --skip-themes > /dev/null 2>&1; then
            echo "⚠️  WordPress todavía no conecta con la base de datos. Revisa el volcado y el prefijo de tablas."
        fi
${doReplace ? this.searchReplaceScript(ctx, cfg) : `
        echo "ℹ️  Reemplazo de dominio desactivado: el sitio conservará las URLs del volcado."`}

        $WP core update-db --path="$WP_PATH" > /dev/null 2>&1 || true
        $WP rewrite flush --hard --path="$WP_PATH" > /dev/null 2>&1 || true
        $WP cache flush --path="$WP_PATH" > /dev/null 2>&1 || true

        # Los archivos que subió el cliente por el panel ya no hacen falta.
        rm -rf "$WORK"
${archive.startsWith(exports.WP_UPLOAD_PREFIX) ? `        rm -f ${sq(archive)}` : ''}
${dump.startsWith(exports.WP_UPLOAD_PREFIX) ? `        rm -f ${sq(dump)}` : ''}
        echo "✅ Migración completada."
`;
    }
    importDumpScript(cfg, dump) {
        return `
        # ── Pasos 2 y 3: importar el volcado en la base de datos ──
        echo ""
        echo "📥 Importando el volcado de la base de datos..."
        mkdir -p "$WORK/db"
        cc_fetch ${sq(dump)} "$WORK/db/dump.raw" || exit 1
        DUMP_NAME=$(basename ${sq(dump)} | sed 's/[?#].*$//')
        case "$DUMP_NAME" in
            *.sql) cp "$WORK/db/dump.raw" "$WORK/db/dump.sql" ;;
            *)     cp "$WORK/db/dump.raw" "$WORK/db/$DUMP_NAME"
                   cc_extract "$WORK/db/$DUMP_NAME" "$WORK/db" || exit 1 ;;
        esac

        DUMP_SQL=$(find "$WORK/db" -maxdepth 3 -type f -name '*.sql' 2>/dev/null | head -1)
        [ -z "$DUMP_SQL" ] && [ -f "$WORK/db/dump.raw" ] && head -c 200 "$WORK/db/dump.raw" | grep -qi 'sql\\|CREATE TABLE\\|INSERT INTO' && DUMP_SQL="$WORK/db/dump.raw"
        [ -n "$DUMP_SQL" ] || { echo "❌ No se encontró ningún .sql dentro del archivo indicado."; exit 1; }

        echo "📄 Volcado: $(basename "$DUMP_SQL") ($(du -h "$DUMP_SQL" | cut -f1))"

        # Un export completo puede traer CREATE DATABASE / USE del nombre antiguo:
        # si se dejan, las tablas acaban en otra base y el sitio sigue vacío.
        sed -E 's/^[[:space:]]*(CREATE DATABASE|USE )/-- \\1/I' "$DUMP_SQL" > "$DUMP_SQL.cc" 2>/dev/null \\
            && DUMP_SQL="$DUMP_SQL.cc"

        sudo mysql ${cfg.dbName} < "$DUMP_SQL" \\
            || { echo "❌ Falló la importación del volcado. Revisa que sea un export válido de MySQL/MariaDB."; exit 1; }
        echo "✅ Volcado importado en ${cfg.dbName}."

        # El prefijo de tablas del sitio original manda sobre el del formulario:
        # si no coincide, WordPress arranca como si fuera una instalación nueva.
        DETECTED_PREFIX=$(sudo mysql -N -B -e "SELECT SUBSTRING(table_name, 1, LENGTH(table_name) - 7) FROM information_schema.tables WHERE table_schema = '${cfg.dbName}' AND table_name LIKE '%options' ORDER BY LENGTH(table_name) ASC LIMIT 1;" 2>/dev/null)
        if [ -n "$DETECTED_PREFIX" ]; then
            echo "🔎 Prefijo de tablas detectado: $DETECTED_PREFIX"
        else
            DETECTED_PREFIX=${sq(cfg.tablePrefix)}
            echo "ℹ️  No se pudo detectar el prefijo; se usa ${cfg.tablePrefix}"
        fi
`;
    }
    searchReplaceScript(ctx, cfg) {
        const declared = ctx.data.wpOldDomain?.trim();
        return `
        # ── Dominio: un sitio migrado sigue enlazando al dominio viejo ──
        echo ""
        OLD_URL=${declared ? sq(declared) : `$($WP option get siteurl --path="$WP_PATH" --skip-plugins --skip-themes 2>/dev/null)`}
        NEW_URL=${sq(cfg.installUrl)}

        if [ -n "$OLD_URL" ] && [ "$OLD_URL" != "$NEW_URL" ]; then
            echo "🔁 Reemplazando $OLD_URL → $NEW_URL en toda la base de datos..."
            $WP search-replace "$OLD_URL" "$NEW_URL" --path="$WP_PATH" \\
                --all-tables-with-prefix --precise --skip-columns=guid \\
                --report-changed-only --skip-plugins --skip-themes 2>/dev/null || true

            # También sin protocolo: muchos temas guardan //dominio o dominio a secas.
            OLD_HOST=$(echo "$OLD_URL" | sed -E 's#^https?://##; s#/.*$##')
            NEW_HOST=${sq(cfg.host)}
            if [ -n "$OLD_HOST" ] && [ "$OLD_HOST" != "$NEW_HOST" ]; then
                $WP search-replace "$OLD_HOST" "$NEW_HOST" --path="$WP_PATH" \\
                    --all-tables-with-prefix --precise --skip-columns=guid \\
                    --report-changed-only --skip-plugins --skip-themes 2>/dev/null || true
            fi

            $WP option update home    "$NEW_URL" --path="$WP_PATH" --skip-plugins --skip-themes > /dev/null 2>&1 || true
            $WP option update siteurl "$NEW_URL" --path="$WP_PATH" --skip-plugins --skip-themes > /dev/null 2>&1 || true
            echo "✅ Dominio actualizado."
        else
            echo "ℹ️  El sitio ya apunta a $NEW_URL: no hace falta reemplazar el dominio."
        fi
`;
    }
    finalizeScript(ctx, cfg) {
        return `
        echo ""
        echo "🔒 Aplicando permisos de archivos..."
        sudo chown -R www-data:www-data ${cfg.docroot}
        sudo find ${cfg.docroot} -type d -exec chmod 755 {} \\; 2>/dev/null || true
        sudo find ${cfg.docroot} -type f -exec chmod 644 {} \\; 2>/dev/null || true
        [ -f "$WP_PATH/wp-config.php" ] && sudo chmod 640 "$WP_PATH/wp-config.php"
        sudo mkdir -p "$WP_PATH/wp-content/uploads"
        sudo chown -R www-data:www-data "$WP_PATH/wp-content"
        echo "✅ Permisos aplicados (www-data)."

        # Logs propios del sitio, igual que en el resto de stacks del panel.
        sudo touch /var/log/nginx/${ctx.safeName}.access.log /var/log/nginx/${ctx.safeName}.error.log 2>/dev/null || true
`;
    }
    reconfigure(ctx, _site) {
        const cfg = this.configOf(ctx);
        const rawDomain = ctx.data.domain?.trim();
        const hasDomain = !!rawDomain && rawDomain !== '_';
        const host = hasDomain ? rawDomain : (0, nginx_util_1.fallbackHostname)(ctx.safeName, ctx.server.ip);
        const scheme = ctx.data.useLetsEncrypt && hasDomain ? 'https' : 'http';
        const path = cfg.directory ? '/' + cfg.directory : '';
        const siteUrl = `${scheme}://${host}${path}`;
        return {
            ...cfg,
            host,
            siteUrl,
            installUrl: `http://${host}${path}`,
            adminUrl: `${siteUrl}/wp-admin`,
        };
    }
    updateAppScript(ctx, _site) {
        const cfg = this.configOf(ctx);
        return `
        WP_PATH=${sq(cfg.installPath)}

        if [ ! -f "$WP_PATH/wp-settings.php" ]; then
            echo "⚠️  No se encontró una instalación de WordPress en $WP_PATH."
        fi

        PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null)
        [ -n "$PHP_VER" ] && sudo systemctl reload "php$PHP_VER-fpm" > /dev/null 2>&1 || true
`;
    }
    cleanupScript(ctx, _site) {
        const cfg = this.configOf(ctx);
        const dropDb = cfg.externalDb
            ? `            echo "ℹ️  La base de datos es externa: el panel no la elimina."`
            : `            echo "🗄️  Eliminando la base de datos ${cfg.dbName} y el usuario ${cfg.dbUser}..."
            sudo mysql -e "DROP DATABASE IF EXISTS \\\`${cfg.dbName}\\\`;" 2>/dev/null || true
            sudo mysql -e "DROP USER IF EXISTS '${cfg.dbUser}'@'localhost';" 2>/dev/null || true
            sudo mysql -e "FLUSH PRIVILEGES;" 2>/dev/null || true`;
        return `
${dropDb}
            sudo rm -rf ${cfg.docroot}
            sudo rm -f /var/log/nginx/${ctx.safeName}.access.log /var/log/nginx/${ctx.safeName}.error.log
`;
    }
    logCommands(ctx, _site) {
        const cfg = this.configOf(ctx);
        const { safeName } = ctx;
        return {
            out: `sudo tail -n 100 /var/log/nginx/${safeName}.access.log 2>/dev/null || echo "Sin accesos registrados todavía."`,
            error: `echo "=== WordPress (debug.log) ==="; sudo tail -n 60 ${cfg.installPath}/wp-content/debug.log 2>/dev/null || echo "WP_DEBUG_LOG no está activado."; echo ""; echo "=== PHP-FPM ==="; sudo tail -n 60 /var/log/php*-fpm.log 2>/dev/null || echo "Sin logs de PHP-FPM."`,
            nginx: `sudo tail -n 100 /var/log/nginx/${safeName}.error.log 2>/dev/null || sudo tail -n 100 /var/log/nginx/error.log 2>/dev/null || echo "Sin logs de nginx."`,
        };
    }
};
exports.WordpressStack = WordpressStack;
exports.WordpressStack = WordpressStack = __decorate([
    (0, common_1.Injectable)()
], WordpressStack);
//# sourceMappingURL=wordpress.stack.js.map