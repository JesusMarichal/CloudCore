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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerController = void 0;
const common_1 = require("@nestjs/common");
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
exports.ServerController = ServerController = __decorate([
    (0, common_1.Controller)('servers'),
    __metadata("design:paramtypes", [ssh_service_1.SshService,
        database_service_1.DatabaseService])
], ServerController);
//# sourceMappingURL=server.controller.js.map