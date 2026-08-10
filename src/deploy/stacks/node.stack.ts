import { Injectable } from '@nestjs/common';
import { DeployContext, DeployStack, ServeMode } from './stack.interface';

/**
 * Stack Node.js / PM2. Es la lógica que antes vivía embebida en
 * SshService.deployWebsite (clonar → .env → install/build → PM2 →
 * auto-detección de entrypoint), extraída sin cambios de comportamiento.
 */
@Injectable()
export class NodeStack implements DeployStack {
    id = 'node';
    label = 'Node.js / PM2';

    serve(ctx: DeployContext): ServeMode {
        return { kind: 'proxy', port: ctx.data.port };
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
        node -e "const fs = require('fs'); fs.writeFileSync('.env', Buffer.from('${Buffer.from(`PORT=${data.port}\n${data.envVars ? data.envVars.replace(/\r/g, '') : ''}`).toString('base64')}', 'base64'));"
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
        sudo truncate -s 0 /var/log/nginx/error.log 2>/dev/null || true
        sudo truncate -s 0 /var/log/nginx/access.log 2>/dev/null || true

        echo "🚀 Iniciando aplicación con PM2..."
        pm2 delete ${safeName} >/dev/null 2>&1 || true

        cd ${projectPath}

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
            pm2 start "$ENTRY_POINT" --name "${safeName}" --cwd "${projectPath}"
        else
            # Fallback: usar npm start vía PM2
            echo "📌 No se encontró archivo de entrada, usando npm start..."
            pm2 start npm --name "${safeName}" --cwd "${projectPath}" -- run start
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
}
