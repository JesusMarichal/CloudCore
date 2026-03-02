"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerController = void 0;
const common_1 = require("@nestjs/common");
const express_1 = require("express");
const ssh_service_1 = require("../services/ssh.service");
const create_server_dto_1 = require("../dto/create-server.dto");
const database_service_1 = require("../database/database.service");
const encryption_util_1 = require("../common/utils/encryption.util");
const crypto = require("crypto");
let ServerController = class ServerController {
    constructor(sshService, dbService) {
        this.sshService = sshService;
        this.dbService = dbService;
    }
    async findAll(userId) {
        try {
            const result = await this.dbService.query(`SELECT id, user_id as "userId", name, ip, ssh_port as "sshPort", 
                ssh_user as "sshUser", auth_type as "authType", status, 
                provisioning_step as "provisioningStep",
                cpu_usage as "cpuUsage", ram_usage as "ramUsage", 
                disk_usage as "diskUsage", temp, 
                last_health_check as "lastHealthCheck" 
                FROM servers WHERE user_id = $1`, [userId]);
            return result.rows;
        }
        catch (error) {
            console.error('Error listando servidores:', error);
            return [];
        }
    }
    async create(serverDto) {
        const encryptedPrivateKey = serverDto.privateKey ? (0, encryption_util_1.encrypt)(serverDto.privateKey) : undefined;
        const encryptedPassword = serverDto.password ? (0, encryption_util_1.encrypt)(serverDto.password) : undefined;
        const serverId = crypto.randomUUID();
        const newServer = {
            id: serverId,
            userId: serverDto.userId,
            name: serverDto.name,
            ip: serverDto.ip,
            sshPort: serverDto.sshPort,
            sshUser: serverDto.sshUser,
            authType: serverDto.authType,
            privateKey: encryptedPrivateKey,
            password: encryptedPassword,
            status: 'provisioning',
            lastHealthCheck: new Date(),
        };
        try {
            await this.dbService.query(`INSERT INTO servers (id, user_id, name, ip, ssh_port, ssh_user, auth_type, private_key, password, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
                newServer.id,
                newServer.userId,
                newServer.name,
                newServer.ip,
                newServer.sshPort,
                newServer.sshUser,
                newServer.authType,
                newServer.privateKey,
                newServer.password,
                newServer.status
            ]);
        }
        catch (error) {
            console.error('Error guardando servidor en BD:', error);
            throw new common_1.InternalServerErrorException('No se pudo guardar el servidor');
        }
        this.sshService.provision(newServer, async (step) => {
            await this.dbService.query('UPDATE servers SET provisioning_step = $1 WHERE id = $2', [step, serverId]);
        })
            .then(async () => {
            await this.dbService.query('UPDATE servers SET status = $1, provisioning_step = $2 WHERE id = $3', ['online', 'Completado', serverId]);
        })
            .catch(async (err) => {
            console.error(`Error de aprovisionamiento para ${newServer.ip}:`, err);
            await this.dbService.query('UPDATE servers SET status = $1, provisioning_step = $2 WHERE id = $3', ['offline', 'Error: ' + err.message, serverId]);
        });
        const { privateKey, password, ...safeServer } = newServer;
        return safeServer;
    }
    async deleteServer(id) {
        try {
            const serverResult = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
            const serverData = serverResult.rows[0];
            if (!serverData)
                return { success: false, message: 'Servidor no encontrado' };
            const server = this.getServerFromData(serverData);
            try {
                const dbInstances = await this.dbService.query('SELECT * FROM database_instances WHERE server_id = $1::text', [id]);
                for (const dbInst of dbInstances.rows) {
                    const safeName = dbInst.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
                    let cleanCmd = `sudo docker rm -f ${dbInst.container_name} 2>/dev/null || true; sudo docker volume rm ${dbInst.container_name}_data 2>/dev/null || true`;
                    if (dbInst.engine === 'mysql' && dbInst.admin_container_name) {
                        cleanCmd += `; sudo docker rm -f ${dbInst.admin_container_name} 2>/dev/null || true; sudo docker network rm cloudcore_${safeName}_net 2>/dev/null || true`;
                    }
                    try {
                        await this.sshService.executeCommand(server, cleanCmd);
                    }
                    catch (e) { }
                }
            }
            catch (e) { }
            try {
                const websites = await this.dbService.query('SELECT * FROM websites WHERE server_id = $1', [id]);
                for (const site of websites.rows) {
                    const safeName = site.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
                    const cleanCmd = `pm2 delete ${safeName} 2>/dev/null || true; sudo rm -f /etc/nginx/sites-enabled/${safeName} 2>/dev/null || true; sudo rm -f /etc/nginx/sites-available/${safeName} 2>/dev/null || true; sudo rm -rf /var/www/${safeName} 2>/dev/null || true`;
                    try {
                        await this.sshService.executeCommand(server, cleanCmd);
                    }
                    catch (e) { }
                }
                try {
                    await this.sshService.executeCommand(server, 'sudo nginx -t && sudo systemctl reload nginx');
                }
                catch (e) { }
            }
            catch (e) { }
            try {
                await this.dbService.query('DELETE FROM database_instances WHERE server_id = $1::text', [id]);
            }
            catch (e) { }
            try {
                await this.dbService.query('DELETE FROM websites WHERE server_id = $1', [id]);
            }
            catch (e) { }
            await this.dbService.query('DELETE FROM servers WHERE id = $1', [id]);
            return { success: true, message: 'Servidor y todos sus recursos eliminados' };
        }
        catch (error) {
            console.error('Error eliminando servidor:', error);
            try {
                await this.dbService.query('DELETE FROM database_instances WHERE server_id = $1::text', [id]);
            }
            catch (e) { }
            try {
                await this.dbService.query('DELETE FROM websites WHERE server_id = $1', [id]);
            }
            catch (e) { }
            try {
                await this.dbService.query('DELETE FROM servers WHERE id = $1', [id]);
            }
            catch (e) { }
            return { success: true, message: 'Servidor eliminado (algunos recursos remotos no pudieron limpiarse)' };
        }
    }
    async refreshHealth(id) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData)
            return { success: false, message: 'Servidor no encontrado' };
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check
        };
        const health = await this.sshService.getHealth(server);
        await this.dbService.query(`UPDATE servers SET 
                cpu_usage = $1, ram_usage = $2, disk_usage = $3, temp = $4, 
                status = $5, last_health_check = NOW() 
            WHERE id = $6`, [health.cpuUsage, health.ramUsage, health.diskUsage, health.temp, health.status, id]);
        return { success: true, health };
    }
    async getServices(id) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData)
            return [];
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        return this.sshService.listServices(server);
    }
    async installService(id, serviceName, res) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) {
            res.status(404).json({ success: false, message: 'Servidor no encontrado' });
            return;
        }
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        const success = await this.sshService.installService(server, serviceName, (chunk) => {
            res.write(chunk);
        });
        if (success) {
            res.write('\n\n---DONE---\n');
        }
        else {
            res.write('\n\n---ERROR---\n');
        }
        res.end();
    }
    async uninstallService(id, serviceName, res) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) {
            res.status(404).json({ success: false, message: 'Servidor no encontrado' });
            return;
        }
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        const success = await this.sshService.uninstallService(server, serviceName, (chunk) => {
            res.write(chunk);
        });
        if (success) {
            res.write('\n\n---DONE---\n');
        }
        else {
            res.write('\n\n---ERROR---\n');
        }
        res.end();
    }
    async manageService(id, serviceName, action) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData)
            return { success: false, message: 'Servidor no encontrado' };
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        const success = await this.sshService.manageService(server, serviceName, action);
        return { success };
    }
    async updateSystem(id, res) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) {
            res.status(404).json({ success: false, message: 'Servidor no encontrado' });
            return;
        }
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        const success = await this.sshService.updateServer(server, (chunk) => {
            res.write(chunk);
        });
        if (success) {
            res.write('\n\n---DONE---\n');
        }
        else {
            res.write('\n\n---ERROR---\n');
        }
        res.end();
    }
    async deployWebsite(id, body) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData)
            return { success: false, message: 'Servidor no encontrado' };
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        const success = await this.sshService.deployWebsite(server, body);
        if (success) {
            try {
                await this.dbService.query(`
                    DO $$ 
                    BEGIN 
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='build_command') THEN
                            ALTER TABLE websites ADD COLUMN build_command VARCHAR(255);
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='domain') THEN
                            ALTER TABLE websites ADD COLUMN domain VARCHAR(255);
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='entry_point') THEN
                            ALTER TABLE websites ADD COLUMN entry_point VARCHAR(255);
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='user_id') THEN
                            ALTER TABLE websites ADD COLUMN user_id VARCHAR(255);
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='env_vars') THEN
                            ALTER TABLE websites ADD COLUMN env_vars TEXT;
                        END IF;
                    END $$;
                `);
                await this.dbService.query(`
                    INSERT INTO websites (server_id, user_id, repo_url, name, install_command, build_command, start_command, port, domain, entry_point, env_vars)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                `, [id, body.userId || '', body.repo, body.name, body.installCommand, body.buildCommand, body.startCommand, body.port, body.domain, body.entryPoint, body.envVars]);
            }
            catch (error) {
                console.error("Error guardando el sitio en la base de datos:", error);
            }
        }
        return { success, message: success ? 'Sitio web desplegado' : 'Error al desplegar sitio' };
    }
    async updateWebsite(id, websiteId, body) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData)
            return { success: false, message: 'Servidor no encontrado' };
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        await this.dbService.query(`
            UPDATE websites 
            SET install_command = $1, build_command = $2, start_command = $3, 
                port = $4, domain = $5, entry_point = $6, env_vars = $7
            WHERE id = $8
        `, [body.installCommand, body.buildCommand, body.startCommand, body.port, body.domain, body.entryPoint, body.envVars, websiteId]);
        const safeName = body.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const projectPath = `/var/www/${safeName}`;
        const finalDomain = body.domain && body.domain.trim() !== '' ? body.domain : '_';
        const updateEnvCmd = `
            cd ${projectPath}
            echo "PORT=${body.port}" > .env
            ${body.envVars ? `echo "${body.envVars.replace(/\r/g, '')}" >> .env` : ''}
            echo "✅ .env actualizado."
            pm2 restart ${safeName} || true

            # Configuración de Nginx Reverse Proxy
            if command -v nginx > /dev/null; then
                echo "⚙️ Reconfigurando Nginx Reverse Proxy..."
                sudo bash -c 'cat > /etc/nginx/sites-available/${safeName} << "EOF"
server {
    listen 80;
    server_name ${finalDomain};

    location / {
        proxy_pass http://localhost:${body.port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF'
                sudo ln -sf /etc/nginx/sites-available/${safeName} /etc/nginx/sites-enabled/
                
                if [ "${finalDomain}" = "_" ]; then
                    sudo rm -f /etc/nginx/sites-enabled/default
                fi

                sudo nginx -t && sudo systemctl reload nginx
                echo "✅ Nginx reconfigurado exitosamente."
            fi
        `;
        await this.sshService.executeCommand(server, updateEnvCmd);
        return { success: true, message: 'Configuración actualizada, sitio y proxy reiniciados' };
    }
    async getWebsites(userId) {
        try {
            await this.dbService.query(`
                DO $$ BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='env_vars') THEN
                        ALTER TABLE websites ADD COLUMN env_vars TEXT;
                    END IF;
                END $$;
            `);
            const result = await this.dbService.query(`SELECT w.*, s.name as "serverName", s.ip as "serverIp" 
                 FROM websites w 
                 JOIN servers s ON w.server_id = s.id 
                 WHERE s.user_id = $1`, [userId]);
            return result.rows;
        }
        catch (error) {
            console.error('Error listando sitios web:', error);
            return [];
        }
    }
    async getWebsiteEnv(id, websiteId) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData)
            return { success: false, message: 'Servidor no encontrado' };
        const siteResult = await this.dbService.query('SELECT * FROM websites WHERE id = $1', [websiteId]);
        const site = siteResult.rows[0];
        if (!site)
            return { success: false, message: 'Sitio no encontrado' };
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        const safeName = site.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const projectPath = `/var/www/${safeName}`;
        try {
            const execResult = await this.sshService.executeCommand(server, `[ -f ${projectPath}/.env ] && cat ${projectPath}/.env || echo ""`);
            return { success: true, env: execResult };
        }
        catch (error) {
            return { success: false, message: 'No se pudo leer el archivo .env remoto' };
        }
    }
    async deleteWebsite(id, websiteId) {
        const siteResult = await this.dbService.query('SELECT * FROM websites WHERE id = $1', [websiteId]);
        const site = siteResult.rows[0];
        if (!site)
            return { success: false, message: 'Sitio no encontrado' };
        const serverResult = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = serverResult.rows[0];
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        const safeName = site.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const cleanCmd = `
            pm2 delete ${safeName} || true
            sudo rm -f /etc/nginx/sites-enabled/${safeName}
            sudo rm -f /etc/nginx/sites-available/${safeName}
            sudo nginx -t && sudo systemctl reload nginx
            sudo rm -rf /var/www/${safeName}
        `;
        await this.sshService.executeCommand(server, cleanCmd);
        await this.dbService.query('DELETE FROM websites WHERE id = $1', [websiteId]);
        return { success: true, message: 'Sitio eliminado correctamente' };
    }
    async getWebsiteLogs(id, websiteId) {
        const siteResult = await this.dbService.query('SELECT name FROM websites WHERE id = $1', [websiteId]);
        const site = siteResult.rows[0];
        if (!site)
            return { success: false, message: 'Sitio no encontrado' };
        const serverResult = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = serverResult.rows[0];
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        const safeName = site.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const logs = await this.sshService.executeCommand(server, `pm2 logs ${safeName} --lines 50 --nostream`);
        return { success: true, logs };
    }
    async getWebsiteCommit(id, websiteId) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        const siteResult = await this.dbService.query('SELECT * FROM websites WHERE id = $1', [websiteId]);
        const site = siteResult.rows[0];
        if (!serverData || !site)
            return { success: false, message: 'No encontrado' };
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        const safeName = site.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const projectPath = `/var/www/${safeName}`;
        try {
            const output = await this.sshService.executeCommand(server, `cd ${projectPath} && git log -1 --format="%h|%s|%cr|%an"`);
            const parts = output.trim().split('|');
            if (parts.length >= 4) {
                return { success: true, commit: { hash: parts[0], message: parts[1], time: parts[2], author: parts[3] } };
            }
            return { success: false, message: 'No se pudo obtener el commit o el folder no es un repo git' };
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    async deployLatestCommit(id, websiteId) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        const siteResult = await this.dbService.query('SELECT * FROM websites WHERE id = $1', [websiteId]);
        const site = siteResult.rows[0];
        if (!serverData || !site)
            return { success: false, message: 'No encontrado' };
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        const safeName = site.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const projectPath = `/var/www/${safeName}`;
        const deployCmd = `
            cd ${projectPath}
            git reset --hard
            git pull
            ${site.install_command || 'npm install'}
            ${site.build_command ? site.build_command : ''}
            pm2 restart ${safeName} || true
        `;
        try {
            await this.sshService.executeCommand(server, deployCmd);
            return { success: true, message: 'Sitio actualizado y desplegado al último commit' };
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    async executeCommand(id, command) {
        const serverResult = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = serverResult.rows[0];
        if (!serverData)
            return { success: false, message: 'Servidor no encontrado' };
        const server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
        try {
            const output = await this.sshService.executeCommand(server, command);
            return { success: true, output };
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    getServerFromData(serverData) {
        return {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
    }
    async deployDatabase(id, body, res) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) {
            res.status(404).json({ success: false, message: 'Servidor no encontrado' });
            return;
        }
        const server = this.getServerFromData(serverData);
        await this.dbService.query(`
            CREATE TABLE IF NOT EXISTS database_instances (
                id VARCHAR(255) PRIMARY KEY,
                server_id VARCHAR(255) NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                engine VARCHAR(50) NOT NULL,
                port VARCHAR(10) NOT NULL,
                db_name VARCHAR(255) NOT NULL,
                db_user VARCHAR(255) NOT NULL,
                db_password VARCHAR(255) NOT NULL,
                admin_port VARCHAR(10),
                container_name VARCHAR(255),
                admin_container_name VARCHAR(255),
                status VARCHAR(50) DEFAULT 'deploying',
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        const dbId = crypto.randomUUID();
        const safeName = body.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const containerName = `cloudcore_db_${safeName}`;
        const adminContainerName = `cloudcore_pma_${safeName}`;
        await this.dbService.query(`
            INSERT INTO database_instances (id, server_id, user_id, name, engine, port, db_name, db_user, db_password, admin_port, container_name, admin_container_name, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'deploying')
        `, [dbId, id, body.userId || '', body.name, body.engine, body.port, body.dbName, body.dbUser, body.dbPassword, body.adminPort || '', containerName, adminContainerName]);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        let deployCmd = '';
        const prepDockerCmd = `
            if ! command -v docker > /dev/null 2>&1; then
                echo "📦 Preparando servidor: Instalando Docker..."
                sudo apt-get update -qq
                sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io
                sudo systemctl enable --now docker
                echo "✅ Docker instalado correctamente."
            fi
        `;
        if (body.engine === 'mysql') {
            deployCmd = prepDockerCmd + `
                echo "🐬 Desplegando MySQL con Docker..."
                
                # Crear red Docker para comunicación entre contenedores
                sudo docker network create cloudcore_${safeName}_net 2>/dev/null || true
                
                # Detener y eliminar contenedores previos si existen
                sudo docker rm -f ${containerName} 2>/dev/null || true
                sudo docker rm -f ${adminContainerName} 2>/dev/null || true
                
                # Crear volumen persistente
                sudo docker volume create ${containerName}_data 2>/dev/null || true
                
                # Iniciar MySQL
                echo "📦 Iniciando contenedor MySQL..."
                sudo docker run -d \\
                    --name ${containerName} \\
                    --network cloudcore_${safeName}_net \\
                    -e MYSQL_ROOT_PASSWORD=${body.dbPassword} \\
                    -e MYSQL_DATABASE=${body.dbName} \\
                    -e MYSQL_USER=${body.dbUser} \\
                    -e MYSQL_PASSWORD=${body.dbPassword} \\
                    -p ${body.port}:3306 \\
                    -v ${containerName}_data:/var/lib/mysql \\
                    --restart unless-stopped \\
                    mysql:8.0
                
                echo "⏳ Esperando a que MySQL inicie..."
                sleep 10
                
                # Iniciar phpMyAdmin
                echo "🖥️ Iniciando phpMyAdmin..."
                sudo docker run -d \\
                    --name ${adminContainerName} \\
                    --network cloudcore_${safeName}_net \\
                    -e PMA_HOST=${containerName} \\
                    -e PMA_PORT=3306 \\
                    -e MYSQL_ROOT_PASSWORD=${body.dbPassword} \\
                    -p ${body.adminPort || '8080'}:80 \\
                    --restart unless-stopped \\
                    phpmyadmin/phpmyadmin
                
                echo "✅ MySQL y phpMyAdmin desplegados correctamente."
                echo "📊 MySQL disponible en el puerto ${body.port}"
                echo "🔗 phpMyAdmin disponible en http://$(hostname -I | awk '{print $1}'):${body.adminPort || '8080'}"
            `;
        }
        else {
            deployCmd = prepDockerCmd + `
                echo "🐘 Desplegando PostgreSQL con Docker..."
                
                # Detener y eliminar contenedor previo si existe
                sudo docker rm -f ${containerName} 2>/dev/null || true
                
                # Crear volumen persistente
                sudo docker volume create ${containerName}_data 2>/dev/null || true
                
                # Iniciar PostgreSQL
                echo "📦 Iniciando contenedor PostgreSQL..."
                sudo docker run -d \\
                    --name ${containerName} \\
                    -e POSTGRES_DB=${body.dbName} \\
                    -e POSTGRES_USER=${body.dbUser} \\
                    -e POSTGRES_PASSWORD=${body.dbPassword} \\
                    -p ${body.port}:5432 \\
                    -v ${containerName}_data:/var/lib/postgresql/data \\
                    --restart unless-stopped \\
                    postgres:16-alpine
                
                echo "⏳ Esperando a que PostgreSQL inicie..."
                sleep 5
                
                echo "✅ PostgreSQL desplegado correctamente."
                echo "📊 PostgreSQL disponible en el puerto ${body.port}"
            `;
        }
        try {
            const success = await this.sshService.executeCommand(server, deployCmd, (chunk) => {
                res.write(chunk);
            });
            await this.dbService.query('UPDATE database_instances SET status = $1 WHERE id = $2', ['running', dbId]);
            res.write('\n\n---DONE---\n');
        }
        catch (error) {
            console.error('Error deploying database:', error);
            await this.dbService.query('UPDATE database_instances SET status = $1 WHERE id = $2', ['stopped', dbId]);
            res.write('\n\n---ERROR---\n');
        }
        res.end();
    }
    async listDatabases(userId) {
        try {
            await this.dbService.query(`
                CREATE TABLE IF NOT EXISTS database_instances (
                    id VARCHAR(255) PRIMARY KEY,
                    server_id VARCHAR(255) NOT NULL,
                    user_id VARCHAR(255) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    engine VARCHAR(50) NOT NULL,
                    port VARCHAR(10) NOT NULL,
                    db_name VARCHAR(255) NOT NULL,
                    db_user VARCHAR(255) NOT NULL,
                    db_password VARCHAR(255) NOT NULL,
                    admin_port VARCHAR(10),
                    container_name VARCHAR(255),
                    admin_container_name VARCHAR(255),
                    status VARCHAR(50) DEFAULT 'deploying',
                    created_at TIMESTAMP DEFAULT NOW()
                );
            `);
            const result = await this.dbService.query(`
                SELECT di.*, s.name as "serverName", s.ip as "serverIp"
                FROM database_instances di
                JOIN servers s ON di.server_id = s.id::text
                WHERE di.user_id = $1::text
                ORDER BY di.created_at DESC
            `, [userId]);
            return result.rows.map(row => ({
                id: row.id,
                serverId: row.server_id,
                serverName: row.serverName,
                serverIp: row.serverIp,
                name: row.name,
                engine: row.engine,
                port: row.port,
                dbName: row.db_name,
                dbUser: row.db_user,
                dbPassword: row.db_password,
                status: row.status,
                adminPort: row.admin_port,
                createdAt: row.created_at,
            }));
        }
        catch (error) {
            console.error('Error listing databases:', error);
            return [];
        }
    }
    async deleteDatabaseInstance(id, dbId) {
        const serverResult = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = serverResult.rows[0];
        if (!serverData)
            return { success: false, message: 'Servidor no encontrado' };
        const dbResult = await this.dbService.query('SELECT * FROM database_instances WHERE id = $1', [dbId]);
        const dbInstance = dbResult.rows[0];
        if (!dbInstance)
            return { success: false, message: 'Base de datos no encontrada' };
        const server = this.getServerFromData(serverData);
        const safeName = dbInstance.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        let cleanCmd = `
            sudo docker rm -f ${dbInstance.container_name} 2>/dev/null || true
            sudo docker volume rm ${dbInstance.container_name}_data 2>/dev/null || true
        `;
        if (dbInstance.engine === 'mysql' && dbInstance.admin_container_name) {
            cleanCmd += `
                sudo docker rm -f ${dbInstance.admin_container_name} 2>/dev/null || true
                sudo docker network rm cloudcore_${safeName}_net 2>/dev/null || true
            `;
        }
        try {
            await this.sshService.executeCommand(server, cleanCmd);
        }
        catch (error) {
            console.warn('No se pudo limpiar contenedores Docker (servidor inaccesible), eliminando solo el registro:', error.message);
        }
        await this.dbService.query('DELETE FROM database_instances WHERE id = $1', [dbId]);
        return { success: true, message: 'Base de datos eliminada correctamente' };
    }
    async manageDatabaseContainer(id, dbId, action) {
        const validActions = ['start', 'stop', 'restart'];
        if (!validActions.includes(action))
            return { success: false, message: 'Acción no válida' };
        const serverResult = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = serverResult.rows[0];
        if (!serverData)
            return { success: false, message: 'Servidor no encontrado' };
        const dbResult = await this.dbService.query('SELECT * FROM database_instances WHERE id = $1', [dbId]);
        const dbInstance = dbResult.rows[0];
        if (!dbInstance)
            return { success: false, message: 'Base de datos no encontrada' };
        const server = this.getServerFromData(serverData);
        let cmd = `sudo docker ${action} ${dbInstance.container_name}`;
        if (dbInstance.engine === 'mysql' && dbInstance.admin_container_name) {
            cmd += ` && sudo docker ${action} ${dbInstance.admin_container_name}`;
        }
        try {
            await this.sshService.executeCommand(server, cmd);
            const newStatus = action === 'stop' ? 'stopped' : 'running';
            await this.dbService.query('UPDATE database_instances SET status = $1 WHERE id = $2', [newStatus, dbId]);
            return { success: true };
        }
        catch (error) {
            console.error(`Error ${action} database container:`, error);
            return { success: false, message: error.message };
        }
    }
};
exports.ServerController = ServerController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_server_dto_1.CreateServerDto]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "deleteServer", null);
__decorate([
    (0, common_1.Post)(':id/refresh'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "refreshHealth", null);
__decorate([
    (0, common_1.Get)(':id/services'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "getServices", null);
__decorate([
    (0, common_1.Post)(':id/services/install/:serviceName'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('serviceName')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, typeof (_a = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "installService", null);
__decorate([
    (0, common_1.Post)(':id/services/uninstall/:serviceName'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('serviceName')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, typeof (_b = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "uninstallService", null);
__decorate([
    (0, common_1.Post)(':id/services/:serviceName/:action'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('serviceName')),
    __param(2, (0, common_1.Param)('action')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "manageService", null);
__decorate([
    (0, common_1.Post)(':id/update-system'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_c = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "updateSystem", null);
__decorate([
    (0, common_1.Post)(':id/deploy-website'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "deployWebsite", null);
__decorate([
    (0, common_1.Post)(':id/websites/:websiteId/update'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('websiteId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "updateWebsite", null);
__decorate([
    (0, common_1.Get)('websites/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "getWebsites", null);
__decorate([
    (0, common_1.Get)(':id/websites/:websiteId/env'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('websiteId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "getWebsiteEnv", null);
__decorate([
    (0, common_1.Post)(':id/websites/:websiteId/delete'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('websiteId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "deleteWebsite", null);
__decorate([
    (0, common_1.Get)(':id/websites/:websiteId/logs'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('websiteId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "getWebsiteLogs", null);
__decorate([
    (0, common_1.Get)(':id/websites/:websiteId/commit'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('websiteId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "getWebsiteCommit", null);
__decorate([
    (0, common_1.Post)(':id/websites/:websiteId/deploy-latest'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('websiteId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "deployLatestCommit", null);
__decorate([
    (0, common_1.Post)(':id/execute'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('command')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "executeCommand", null);
__decorate([
    (0, common_1.Post)(':id/deploy-database'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_d = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "deployDatabase", null);
__decorate([
    (0, common_1.Get)('databases/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "listDatabases", null);
__decorate([
    (0, common_1.Post)(':id/databases/:dbId/delete'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('dbId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "deleteDatabaseInstance", null);
__decorate([
    (0, common_1.Post)(':id/databases/:dbId/:action'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('dbId')),
    __param(2, (0, common_1.Param)('action')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "manageDatabaseContainer", null);
exports.ServerController = ServerController = __decorate([
    (0, common_1.Controller)('servers'),
    __metadata("design:paramtypes", [ssh_service_1.SshService,
        database_service_1.DatabaseService])
], ServerController);
//# sourceMappingURL=server.controller.js.map