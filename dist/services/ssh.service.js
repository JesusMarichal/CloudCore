"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var SshService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SshService = void 0;
const common_1 = require("@nestjs/common");
const ssh2_1 = require("ssh2");
const encryption_util_1 = require("../common/utils/encryption.util");
let SshService = SshService_1 = class SshService {
    constructor() {
        this.logger = new common_1.Logger(SshService_1.name);
    }
    async executeCommand(server, command, onData, timeoutMs = 300_000) {
        return new Promise((resolve, reject) => {
            const conn = new ssh2_1.Client();
            let output = '';
            let settled = false;
            const done = (err) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                try {
                    conn.end();
                }
                catch (_) { }
                if (err)
                    reject(err);
                else
                    resolve(output);
            };
            const timer = setTimeout(() => {
                this.logger.error(`SSH timeout (${timeoutMs / 1000}s) en ${server.ip}`);
                if (onData)
                    onData('\n❌ Tiempo de espera agotado. El comando tardó demasiado.\n');
                done(new Error(`Timeout SSH después de ${timeoutMs / 1000} segundos`));
            }, timeoutMs);
            const connectionConfig = {
                host: server.ip,
                port: server.sshPort || 22,
                username: server.sshUser || 'root',
                readyTimeout: 30000,
                keepaliveInterval: 15000,
                keepaliveCountMax: 8,
            };
            if (server.authType === 'key' && server.privateKey) {
                connectionConfig.privateKey = (0, encryption_util_1.decrypt)(server.privateKey);
            }
            else if (server.authType === 'password' && server.password) {
                connectionConfig.password = (0, encryption_util_1.decrypt)(server.password);
            }
            conn.on('ready', () => {
                if (!command.includes('STATS_START')) {
                    this.logger.log(`SSH Exec: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''} en ${server.ip}`);
                }
                conn.exec(command, (err, stream) => {
                    if (err) {
                        this.logger.error(`Error exec SSH: ${err.message}`);
                        return done(err);
                    }
                    stream.on('close', () => done())
                        .on('data', (data) => {
                        const chunk = data.toString();
                        output += chunk;
                        if (onData)
                            onData(chunk);
                    });
                    stream.stderr.on('data', (data) => {
                        const chunk = data.toString();
                        output += chunk;
                        if (onData)
                            onData(chunk);
                    });
                });
            })
                .on('error', (err) => done(err))
                .connect(connectionConfig);
        });
    }
    async provision(server, onProgress) {
        this.logger.log(`Iniciando aprovisionamiento completo para ${server.name} (${server.ip})...`);
        const steps = [
            { name: 'Actualizando sistema', cmd: 'sudo DEBIAN_FRONTEND=noninteractive apt update && sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y' },
            { name: 'Instalando Nginx', cmd: 'sudo DEBIAN_FRONTEND=noninteractive apt install -y nginx python3-certbot-nginx' },
            { name: 'Instalando Node.js', cmd: 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo DEBIAN_FRONTEND=noninteractive apt install -y nodejs' },
            { name: 'Instalando PM2', cmd: 'sudo npm install -y -g pm2' },
            { name: 'Instalando dependencias de Docker', cmd: 'sudo DEBIAN_FRONTEND=noninteractive apt install -y ca-certificates curl gnupg lsb-release' },
            { name: 'Configurando repositorio Docker', cmd: 'sudo mkdir -p /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null' },
            { name: 'Instalando Docker', cmd: 'sudo DEBIAN_FRONTEND=noninteractive apt update && sudo DEBIAN_FRONTEND=noninteractive apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin' },
            { name: 'Habilitando servicios', cmd: 'sudo systemctl enable docker && sudo systemctl start docker' },
            { name: 'Abriendo puertos Firewall (80, 443)', cmd: 'sudo ufw allow "Nginx Full" || (sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT && sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT)' }
        ];
        try {
            for (const step of steps) {
                this.logger.log(`SSH [${server.ip}]: ${step.name}...`);
                if (onProgress)
                    await onProgress(step.name);
                await this.executeCommand(server, step.cmd);
            }
            this.logger.log(`Aprovisionamiento completado con éxito para ${server.name}`);
        }
        catch (error) {
            this.logger.error(`Error crítico de aprovisionamiento en ${server.name}: ${error.message}`);
            throw error;
        }
    }
    async discoverWebsites(server) {
        const cmd = `
for dir in /var/www/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    [ "$name" = "html" ] && continue

    repo=$(git -C "$dir" remote get-url origin 2>/dev/null | sed -E 's#https://[^@]*@#https://#')

    conf="/etc/nginx/sites-available/$name"
    domain=""; port=""; ssl="false"; www="false"
    if [ -f "$conf" ]; then
        domain=$(grep -m1 -E 'server_name' "$conf" | sed -E 's/.*server_name[[:space:]]+//; s/;.*//' | awk '{print $1}')
        port=$(grep -m1 -oE 'proxy_pass http://(127\\.0\\.0\\.1|localhost):[0-9]+' "$conf" | grep -oE '[0-9]+$')
        grep -q 'listen 443' "$conf" && ssl="true"
        grep -E 'server_name' "$conf" | grep -q 'www\\.' && www="true"
    fi
    [ "$domain" = "_" ] && domain=""

    envb64=""
    if [ -f "$dir/.env" ]; then
        [ -z "$port" ] && port=$(grep -m1 -E '^PORT=' "$dir/.env" | cut -d= -f2 | tr -d '[:space:]')
        envb64=$(grep -v '^PORT=' "$dir/.env" | base64 -w0 2>/dev/null || true)
    fi

    entry=""
    for f in dist/main.js index.js server.js app.js; do
        if [ -f "$dir$f" ]; then entry="$f"; break; fi
    done

    echo "@@SITE@@|$name|$repo|$domain|$port|$ssl|$www|$entry|$envb64"
done
echo "@@SCAN_DONE@@"
`;
        const output = await this.executeCommand(server, cmd, undefined, 60_000);
        const sites = [];
        for (const line of output.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('@@SITE@@|'))
                continue;
            const parts = trimmed.split('|');
            const [, name, repo, domain, port, ssl, www, entry, envb64] = parts;
            if (!name)
                continue;
            let envVars = '';
            if (envb64) {
                try {
                    envVars = Buffer.from(envb64, 'base64').toString('utf8').trim();
                }
                catch (_) { }
            }
            sites.push({
                name,
                repoUrl: repo || '',
                domain: domain || '',
                port: port || '',
                useLetsEncrypt: ssl === 'true',
                setupWwwAlias: www === 'true',
                entryPoint: entry || '',
                envVars,
            });
        }
        this.logger.log(`Detectados ${sites.length} sitios existentes en ${server.ip}`);
        return sites;
    }
    async discoverDatabases(server) {
        const cmd = `
if ! command -v docker >/dev/null 2>&1; then
    echo "@@NO_DOCKER@@"
    echo "@@DB_SCAN_DONE@@"
    exit 0
fi
sudo docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}' | while IFS='|' read -r cname image status; do
    engine=""
    case "$image" in
        *phpmyadmin*) continue ;;
        *mysql*|*mariadb*) engine="mysql" ;;
        *postgres*) engine="postgres" ;;
        *) continue ;;
    esac
    state="stopped"
    case "$status" in Up*) state="running" ;; esac
    envs=$(sudo docker inspect "$cname" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | base64 -w0)
    ports=$(sudo docker port "$cname" 2>/dev/null | base64 -w0)
    echo "@@DB@@|$cname|$engine|$state|$ports|$envs"
done
sudo docker ps -a --format '{{.Names}}|{{.Image}}' | while IFS='|' read -r cname image; do
    case "$image" in
        *phpmyadmin*)
            p=$(sudo docker port "$cname" 2>/dev/null | grep -m1 '80/tcp' | sed 's/.*://')
            echo "@@PMA@@|$cname|$p"
            ;;
    esac
done
echo "@@DB_SCAN_DONE@@"
`;
        const output = await this.executeCommand(server, cmd, undefined, 60_000);
        const pmaContainers = [];
        const databases = [];
        for (const line of output.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('@@PMA@@|')) {
                const [, name, port] = trimmed.split('|');
                if (name)
                    pmaContainers.push({ name, port: (port || '').trim() });
                continue;
            }
            if (!trimmed.startsWith('@@DB@@|'))
                continue;
            const [, containerName, engine, status, portsB64, envsB64] = trimmed.split('|');
            if (!containerName)
                continue;
            let envText = '';
            let portsText = '';
            try {
                envText = Buffer.from(envsB64 || '', 'base64').toString('utf8');
            }
            catch (_) { }
            try {
                portsText = Buffer.from(portsB64 || '', 'base64').toString('utf8');
            }
            catch (_) { }
            const envMap = {};
            for (const envLine of envText.split('\n')) {
                const eq = envLine.indexOf('=');
                if (eq > 0)
                    envMap[envLine.slice(0, eq)] = envLine.slice(eq + 1).trim();
            }
            const portMatch = portsText.match(/(?:3306|5432)\/tcp -> [^:]*:(\d+)/) || portsText.match(/-> [^:]*:(\d+)/);
            const hostPort = portMatch ? portMatch[1] : (engine === 'mysql' ? '3306' : '5432');
            databases.push({
                containerName,
                name: containerName.replace(/^cloudcore_db_/, ''),
                engine,
                status,
                port: hostPort,
                dbName: envMap['MYSQL_DATABASE'] || envMap['POSTGRES_DB'] || '',
                dbUser: envMap['MYSQL_USER'] || envMap['POSTGRES_USER'] || (engine === 'postgres' ? 'postgres' : 'root'),
                dbPassword: envMap['MYSQL_PASSWORD'] || envMap['POSTGRES_PASSWORD'] || envMap['MYSQL_ROOT_PASSWORD'] || '',
                adminPort: '',
                adminContainerName: '',
            });
        }
        for (const db of databases) {
            if (db.engine !== 'mysql')
                continue;
            const pma = pmaContainers.find(p => p.name === `cloudcore_pma_${db.name}`)
                || (pmaContainers.length === 1 ? pmaContainers[0] : undefined);
            if (pma) {
                db.adminPort = pma.port;
                db.adminContainerName = pma.name;
            }
        }
        this.logger.log(`Detectadas ${databases.length} bases de datos existentes en ${server.ip}`);
        return databases;
    }
    async getHealth(server) {
        const cmd = `
            # CPU Usage (Calculado desde /proc/stat para mayor precisión)
            cpu=$(grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {printf "%.2f", usage}')
            
            # RAM Usage
            ram=$(free -m | awk 'NR==2{printf "%.2f", $3*100/$2 }')
            
            # Disk Usage
            disk=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//')
            
            # Busqueda inteligente de temperatura de CPU
            temp=0
            for zone in /sys/class/thermal/thermal_zone*; do
                if [ -f "$zone/temp" ]; then
                    type=$(cat "$zone/type" 2>/dev/null)
                    case "$type" in
                        *cpu*|*x86*|*pkg*|*soc*) 
                            temp=$(cat "$zone/temp")
                            break
                            ;;
                    esac
                fi
            done
            if [ "$temp" -eq 0 ]; then
                temp=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo 0)
            fi
            
            echo "---STATS_START---"
            echo "$cpu|$ram|$disk|$temp"
            echo "---STATS_END---"
        `;
        try {
            const output = await this.executeCommand(server, cmd);
            const match = output.match(/---STATS_START---([\s\S]*?)---STATS_END---/);
            if (!match) {
                this.logger.warn(`No se pudieron parsear las métricas de SSH para ${server.ip}. Salida: ${output}`);
                return { status: 'online' };
            }
            const cleanOutput = match[1].trim();
            const parts = cleanOutput.split('|');
            const cpu = parts[0]?.trim() || "0";
            const ram = parts[1]?.trim() || "0";
            const disk = parts[2]?.trim() || "0";
            const temp = parts[3]?.trim() || "0";
            let finalTemp = parseFloat(temp) || 0;
            if (finalTemp > 200)
                finalTemp = finalTemp / 1000;
            this.logger.log(`Métricas [${server.ip}]: CPU ${cpu}% | RAM ${ram}% | Disco ${disk}% | Temp ${finalTemp.toFixed(1)}°C`);
            return {
                cpuUsage: parseFloat(cpu) || 0,
                ramUsage: parseFloat(ram) || 0,
                diskUsage: parseFloat(disk) || 0,
                temp: finalTemp,
                status: 'online',
                lastHealthCheck: new Date()
            };
        }
        catch (error) {
            this.logger.error(`Error de salud en ${server.ip}: ${error.message}`);
            return { status: 'offline' };
        }
    }
    async listServices(server) {
        const cmd = `
            echo "---SERVICES_START---"
            # Listar solo servicios relevantes en systemd
            systemctl list-units --type=service --all --no-pager | grep -iE "^\\s*(nginx|docker|mysql|mariadb|redis|apache2|php|mongodb)" | awk '{print $1"|"$4"|"$3}'
            
            # Chequear Node.js vía comando
            if command -v node >/dev/null 2>&1; then
                echo "nodejs|active|loaded"
            fi
            
            # Chequear PM2 vía comando
            if command -v pm2 >/dev/null 2>&1; then
                echo "pm2|active|loaded"
            fi
            
            # Chequear contenedores Docker (ej. MySQL, PostgreSQL desplegados por CloudCore)
            if command -v docker >/dev/null 2>&1; then
                # Si existe algún contenedor con imagen "mysql"
                if sudo docker ps -a --format '{{.Image}}' | grep -qi 'mysql'; then
                    echo "mysql|active|loaded"
                fi
                # Si existe algún contenedor con imagen "postgres"
                if sudo docker ps -a --format '{{.Image}}' | grep -qi 'postgres'; then
                    echo "postgresql|active|loaded"
                fi
            fi
            
            echo "---SERVICES_END---"
        `;
        try {
            const output = await this.executeCommand(server, cmd);
            const match = output.match(/---SERVICES_START---([\s\S]*?)---SERVICES_END---/);
            if (!match)
                return [];
            const lines = match[1].trim().split('\n').filter(l => l.includes('|'));
            const uniqueServices = new Map();
            for (const line of lines) {
                const [unit, state, active] = line.split('|');
                const name = unit.split('.')[0];
                const status = state === 'running' ? 'active' : (state === 'exited' ? 'stopped' : state);
                if (!uniqueServices.has(name) || (status === 'active' && uniqueServices.get(name).status !== 'active')) {
                    uniqueServices.set(name, { name, status, active: active === 'loaded' });
                }
            }
            return Array.from(uniqueServices.values());
        }
        catch (error) {
            this.logger.error(`Error listando servicios en ${server.ip}: ${error.message}`);
            return [];
        }
    }
    async manageService(server, serviceName, action) {
        const validActions = ['start', 'stop', 'restart', 'enable', 'disable'];
        if (!validActions.includes(action))
            throw new Error('Acción no permitida');
        const cmd = `sudo systemctl daemon-reload && sudo systemctl ${action} ${serviceName}`;
        try {
            await this.executeCommand(server, cmd);
            return true;
        }
        catch (error) {
            this.logger.error(`Error ejecutando ${action} en ${serviceName} (${server.ip}): ${error.message}`);
            return false;
        }
    }
    async installService(server, serviceName, onData) {
        const installMap = {
            'nginx': 'sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nginx',
            'docker': 'sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io',
            'pm2': 'sudo npm install -g pm2',
            'mysql': 'sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server',
            'postgresql': 'sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib',
            'redis': 'sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y redis-server',
            'nodejs': 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs',
            'php': 'sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y php',
            'mongodb': 'sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mongodb',
        };
        const cmd = installMap[serviceName.toLowerCase()];
        if (!cmd)
            throw new Error('Servicio no soportado para instalación automática');
        try {
            await this.executeCommand(server, cmd, onData);
            return true;
        }
        catch (error) {
            this.logger.error(`Error instalando ${serviceName} en ${server.ip}: ${error.message}`);
            return false;
        }
    }
    async uninstallService(server, serviceName, onData) {
        const uninstallMap = {
            'nginx': 'sudo systemctl stop nginx && sudo DEBIAN_FRONTEND=noninteractive apt-get remove --purge -y nginx nginx-common && sudo apt-get autoremove -y',
            'docker': 'sudo systemctl stop docker && sudo DEBIAN_FRONTEND=noninteractive apt-get remove --purge -y docker-ce docker-ce-cli containerd.io && sudo apt-get autoremove -y',
            'pm2': 'sudo npm uninstall -g pm2',
            'mysql': 'sudo systemctl stop mysql && sudo DEBIAN_FRONTEND=noninteractive apt-get remove --purge -y mysql-server mysql-client mysql-common && sudo apt-get autoremove -y',
            'redis': 'sudo systemctl stop redis-server && sudo DEBIAN_FRONTEND=noninteractive apt-get remove --purge -y redis-server redis-tools && sudo apt-get autoremove -y',
            'nodejs': 'sudo DEBIAN_FRONTEND=noninteractive apt-get remove --purge -y nodejs && sudo apt-get autoremove -y',
            'php': 'sudo DEBIAN_FRONTEND=noninteractive apt-get remove --purge -y "php*" && sudo apt-get autoremove -y',
            'mongodb': 'sudo systemctl stop mongod && sudo DEBIAN_FRONTEND=noninteractive apt-get remove --purge -y mongodb-org* && sudo apt-get autoremove -y',
        };
        const cmd = uninstallMap[serviceName.toLowerCase()];
        if (!cmd)
            throw new Error('Servicio no soportado para desinstalación automática');
        try {
            await this.executeCommand(server, cmd, onData);
            return true;
        }
        catch (error) {
            this.logger.error(`Error desinstalando ${serviceName} en ${server.ip}: ${error.message}`);
            return false;
        }
    }
    async updateServer(server, onData) {
        const cmd = 'sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y';
        try {
            await this.executeCommand(server, cmd, onData);
            return true;
        }
        catch (error) {
            this.logger.error(`Error actualizando paquetes en ${server.ip}: ${error.message}`);
            return false;
        }
    }
    async deployWebsite(server, data, onData) {
        const safeName = data.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const projectPath = `/var/www/${safeName}`;
        let finalDomain = data.domain && data.domain.trim() !== '' ? data.domain : '_';
        const hasDomain = finalDomain !== '_';
        const serverNames = (hasDomain && data.setupWwwAlias)
            ? `${finalDomain} www.${finalDomain}`
            : finalDomain;
        const useSSL = data.useLetsEncrypt && hasDomain;
        const certbotDomains = (hasDomain && data.setupWwwAlias)
            ? `-d ${finalDomain} -d www.${finalDomain}`
            : `-d ${finalDomain}`;
        const pm2Exec = data.entryPoint && data.entryPoint.trim() !== ''
            ? data.entryPoint
            : (data.startCommand || 'npm start');
        let bashScript = `
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

        # Configuración de Nginx Reverse Proxy (Estilo Cleavr)
        if command -v nginx > /dev/null; then
            echo "⚙️ Configurando Nginx Reverse Proxy para ${serverNames}..."
            
            # 1. Configuración temporal para validación HTTP (para que Certbot pueda validar)
            echo 'server {
    listen 80;
    server_name ${serverNames};

    location / {
        proxy_pass http://127.0.0.1:${data.port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
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
        try {
            await this.executeCommand(server, bashScript, onData);
            if (onData)
                onData("\n\n---DONE---\n");
            return true;
        }
        catch (error) {
            this.logger.error(`Error desplegando sitio web ${safeName} en ${server.ip}: ${error.message}`);
            if (onData)
                onData(`\n❌ Error de despliegue: ${error.message}\n`);
            return false;
        }
    }
};
exports.SshService = SshService;
exports.SshService = SshService = SshService_1 = __decorate([
    (0, common_1.Injectable)()
], SshService);
//# sourceMappingURL=ssh.service.js.map