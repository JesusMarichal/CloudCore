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
var _a, _b, _c;
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
        const updateEnvCmd = `
            cd ${projectPath}
            echo "PORT=${body.port}" > .env
            ${body.envVars ? `echo "${body.envVars.replace(/\r/g, '')}" >> .env` : ''}
            echo "✅ .env actualizado."
            pm2 restart ${safeName} || true
        `;
        await this.sshService.executeCommand(server, updateEnvCmd);
        return { success: true, message: 'Configuración actualizada y sitio reiniciado' };
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
    (0, common_1.Post)(':id/services/:serviceName/:action'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('serviceName')),
    __param(2, (0, common_1.Param)('action')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "manageService", null);
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
    (0, common_1.Post)(':id/execute'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('command')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "executeCommand", null);
exports.ServerController = ServerController = __decorate([
    (0, common_1.Controller)('servers'),
    __metadata("design:paramtypes", [ssh_service_1.SshService,
        database_service_1.DatabaseService])
], ServerController);
//# sourceMappingURL=server.controller.js.map