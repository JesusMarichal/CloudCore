import { Injectable } from '@nestjs/common';
import { DeployContext, DeployStack, ServeMode, StackLogCommands, WebsiteRow } from './stack.interface';

/**
 * Stack Node.js / PM2. Es la lógica que antes vivía embebida en
 * SshService.deployWebsite (clonar → .env → install/build → PM2 →
 * auto-detección de entrypoint), extraída sin cambios de comportamiento.
 */
@Injectable()
export class NodeStack implements DeployStack {
    id = 'node';
    label = 'Node.js / PM2';
    usesGit = true;
    needsPort = true;

    /** El stack de Node no deriva credenciales ni rutas: todo viene del DTO. */
    prepare(_ctx: DeployContext): Record<string, any> {
        return {};
    }

    serve(ctx: DeployContext): ServeMode {
        return { kind: 'proxy', port: ctx.data.port };
    }

    /** La app de Node no guarda su URL en ningún sitio: nada que ajustar. */
    postNginxScript(_ctx: DeployContext): string {
        return '';
    }

    buildAppScript(ctx: DeployContext): string {
        const { safeName, projectPath, data } = ctx;

        // Si hay entryPoint, lo usamos directamente. Si no, usamos startCommand.
        const pm2Exec = data.entryPoint && data.entryPoint.trim() !== ''
            ? data.entryPoint
            : (data.startCommand || 'npm start');

        return `
        sudo mkdir -p /var/www
        sudo chown -R $USER:$USER /var/www
        cd /var/www

        # Eliminar si ya existe
        if [ -d "${projectPath}" ]; then
            rm -rf "${projectPath}"
        fi

        # Clonar e instalar
        echo "⬇️ Clonando repositorio ${data.repo}..."
        git clone ${data.repo} ${projectPath}
        cd ${projectPath}

        # Crear archivo .env si se pasaron variables + inyectar PORT
        node -e "const fs = require('fs'); fs.writeFileSync('.env', Buffer.from('${Buffer.from(`PORT=${data.port}\nNODE_ENV=production\n${data.envVars ? data.envVars.replace(/\r/g, '') : ''}`).toString('base64')}', 'base64'));"
        echo "✅ Variables .env inyectadas (inc. PORT=${data.port})."

        # Instalar dependencias
        if [ -f "package.json" ]; then
            echo "📦 Instalando dependencias..."
            ${data.installCommand && data.installCommand.trim() !== '' ? data.installCommand : 'npm install'}

            # Asegurar permisos de ejecución en binarios (evita errores como "tsc: Permission denied")
            chmod -R +x node_modules/.bin 2>/dev/null || true
            chmod -R +x */node_modules/.bin 2>/dev/null || true

            # Ejecutar comando de construcción si existe
            ${data.buildCommand && data.buildCommand.trim() !== '' ? `echo "🏗️  Ejecutando build: ${data.buildCommand}"\n${data.buildCommand}` : ''}
        fi

        # Iniciar/Reiniciar la aplicación con PM2
        echo "🧹 Limpiando logs anteriores..."
        pm2 flush ${safeName} >/dev/null 2>&1 || true
        rm -f /home/$USER/.pm2/logs/${safeName}-*.log 2>/dev/null || true
        sudo truncate -s 0 /var/log/nginx/${safeName}.access.log 2>/dev/null || true
        sudo truncate -s 0 /var/log/nginx/${safeName}.error.log 2>/dev/null || true

        echo "🚀 Iniciando aplicación con PM2..."
        pm2 delete ${safeName} >/dev/null 2>&1 || true

        cd ${projectPath}

        # El puerto lo asigna el panel y es único en la base de datos, pero puede
        # haber algo ajeno escuchando en él (un PM2 resucitado tras un reinicio,
        # algo instalado a mano). Mejor fallar aquí que dejar dos sitios peleándose
        # por el mismo puerto.
        sleep 1
        if ss -ltn 2>/dev/null | grep -q ":${data.port} "; then
            echo "❌ El puerto ${data.port} ya está ocupado en este servidor por otro proceso."
            echo "   Identifícalo con: sudo ss -ltnp | grep :${data.port}"
            exit 1
        fi

        # Auto-detectar el punto de entrada correcto
        ENTRY_POINT=""

        # 1. Si existe dist/main.js (NestJS compilado)
        if [ -f "dist/main.js" ]; then
            ENTRY_POINT="dist/main.js"
            echo "📌 Detectado proyecto NestJS (dist/main.js)"
        # 2. Si existe el entryPoint del usuario
        elif [ -f "${pm2Exec}" ]; then
            ENTRY_POINT="${pm2Exec}"
            echo "📌 Usando entry point: ${pm2Exec}"
        # 3. Si existe index.js en la raíz
        elif [ -f "index.js" ]; then
            ENTRY_POINT="index.js"
            echo "📌 Usando index.js"
        # 4. Si existe server.js
        elif [ -f "server.js" ]; then
            ENTRY_POINT="server.js"
            echo "📌 Usando server.js"
        # 5. Si existe app.js
        elif [ -f "app.js" ]; then
            ENTRY_POINT="app.js"
            echo "📌 Usando app.js"
        fi

        if [ -n "$ENTRY_POINT" ]; then
            pm2 start "$ENTRY_POINT" --name "${safeName}" --cwd "${projectPath}" --max-memory-restart 200M
        else
            # Fallback: usar npm start vía PM2
            echo "📌 No se encontró archivo de entrada, usando npm start..."
            pm2 start npm --name "${safeName}" --cwd "${projectPath}" --max-memory-restart 200M -- run start
        fi

        pm2 save

        # Esperar unos segundos para que la app enlace el puerto
        echo "⏳ Esperando 8 segundos para que la app inicie..."
        sleep 8

        # Verificar que la app esté corriendo
        if pm2 show ${safeName} | grep -q "online"; then
            echo "✅ Aplicación corriendo correctamente en PM2."
        else
            echo "⚠️ La aplicación puede haber fallado al iniciar. Revisa los logs con: pm2 logs ${safeName}"
            pm2 logs ${safeName} --lines 15 --nostream 2>/dev/null || true
        fi
`;
    }

    /**
     * Edición de un sitio Node ya desplegado: reescribe el .env, reconstruye si
     * hay comando de build (necesario para las variables VITE_) y reinicia PM2.
     * El identificador y el puerto SIEMPRE salen de la fila guardada.
     */
    updateAppScript(ctx: DeployContext, site: WebsiteRow): string {
        const { safeName, projectPath, data } = ctx;
        const port = String(site.port ?? '');
        const envB64 = Buffer.from(
            `PORT=${port}\nNODE_ENV=production\n${data.envVars ? data.envVars.replace(/\r/g, '') : ''}`,
        ).toString('base64');

        return `
            cd ${projectPath}
            node -e "const fs = require('fs'); fs.writeFileSync('.env', Buffer.from('${envB64}', 'base64'));"
            echo "✅ Archivo .env actualizado con sus credenciales."

            # Re-detectar el punto de entrada para el reinicio
            ENTRY_POINT="${data.entryPoint || 'index.js'}"
            if [ -f "dist/main.js" ]; then
                ENTRY_POINT="dist/main.js"
                echo "📌 Detectado NestJS (dist/main.js)"
            fi

            # Reiniciar con PM2 asegurando que cargue el nuevo .env
            echo "🔄 Reiniciando aplicación ${safeName}..."

            # Ejecutar build si existe el comando (necesario para variables VITE_)
            ${data.buildCommand && data.buildCommand.trim() !== '' ? `echo "🏗️  Re-ejecutando build para aplicar cambios: ${data.buildCommand}"\n${data.buildCommand}` : ''}

            pm2 restart ${safeName} --update-env || pm2 start "$ENTRY_POINT" --name "${safeName}" --update-env --max-memory-restart 200M || pm2 start npm --name "${safeName}" --max-memory-restart 200M -- run start
`;
    }

    /** Node no guarda datos derivados: editar el sitio no cambia nada aquí. */
    reconfigure(ctx: DeployContext, _site: WebsiteRow): Record<string, any> {
        return ctx.stackConfig ?? {};
    }

    /** Al eliminar el sitio: baja el proceso de PM2 y borra el código. */
    cleanupScript(ctx: DeployContext, _site: WebsiteRow): string {
        const { safeName, projectPath } = ctx;
        return `
            pm2 delete ${safeName} || true
            pm2 save --force || true
            sudo rm -rf ${projectPath}
`;
    }

    /** Logs de PM2 (stdout/stderr del proceso) + el error log de Nginx. */
    logCommands(ctx: DeployContext, _site: WebsiteRow): StackLogCommands {
        const { safeName, server } = ctx;
        // PM2 sustituye los guiones bajos por guiones en el nombre del fichero
        // según la versión, así que se prueban las dos formas.
        const pm2LogName = safeName.replace(/_/g, '-');
        const pmDir = `/home/${server.sshUser}/.pm2/logs`;

        return {
            out: `tail -n 100 ${pmDir}/${safeName}-out.log 2>/dev/null || tail -n 100 ${pmDir}/${pm2LogName}-out.log 2>/dev/null || pm2 logs ${safeName} --out --lines 50 --nostream 2>/dev/null || echo "Sin logs de salida disponibles."`,
            error: `tail -n 100 ${pmDir}/${safeName}-error.log 2>/dev/null || tail -n 100 ${pmDir}/${pm2LogName}-error.log 2>/dev/null || pm2 logs ${safeName} --err --lines 50 --nostream 2>/dev/null || echo "Sin logs de errores disponibles."`,
            nginx: `sudo tail -n 100 /var/log/nginx/${safeName}.error.log 2>/dev/null || sudo tail -n 100 /var/log/nginx/error.log 2>/dev/null || echo "Sin logs de nginx."`,
        };
    }
}
