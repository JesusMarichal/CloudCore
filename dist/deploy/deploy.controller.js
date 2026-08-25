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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeployController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const express_1 = require("express");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const current_user_decorator_1 = require("../common/auth/current-user.decorator");
const database_service_1 = require("../database/database.service");
const ssh_service_1 = require("../services/ssh.service");
const deploy_service_1 = require("./deploy.service");
const deploy_website_dto_1 = require("./dto/deploy-website.dto");
const wordpress_stack_1 = require("./stacks/wordpress.stack");
const WP_UPLOAD_EXTENSIONS = ['.zip', '.tar.gz', '.tgz', '.tar', '.sql', '.sql.gz', '.gz'];
const WP_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024;
let DeployController = class DeployController {
    constructor(deployService, ssh, db) {
        this.deployService = deployService;
        this.ssh = ssh;
        this.db = db;
    }
    listStacks() {
        return { stacks: this.deployService.listStacks() };
    }
    async deployWebsite(id, userId, body, res) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        const server = await this.ownedServer(id, userId);
        if (!server) {
            res.status(404).write('---ERROR---\nServidor no encontrado');
            res.end();
            return;
        }
        await this.deployService.deploy(server, userId, body, (chunk) => res.write(chunk));
        res.end();
    }
    async uploadWordpressAsset(id, userId, file) {
        const server = await this.ownedServer(id, userId);
        if (!server)
            throw new common_1.BadRequestException('Servidor no encontrado');
        if (!file?.buffer?.length)
            throw new common_1.BadRequestException('No se recibió ningún archivo.');
        const originalName = String(file.originalname || 'archivo');
        const lower = originalName.toLowerCase();
        if (!WP_UPLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
            throw new common_1.BadRequestException(`Formato no admitido. Sube un ${WP_UPLOAD_EXTENSIONS.join(', ')}.`);
        }
        const ext = WP_UPLOAD_EXTENSIONS
            .filter((e) => lower.endsWith(e))
            .sort((a, b) => b.length - a.length)[0];
        const remotePath = `${wordpress_stack_1.WP_UPLOAD_PREFIX}${crypto.randomUUID()}${ext}`;
        const tmpPath = path.join(os.tmpdir(), `cloudcore-wp-${crypto.randomUUID()}${ext}`);
        await fs.promises.writeFile(tmpPath, file.buffer);
        try {
            await this.ssh.uploadFile(server, tmpPath, remotePath);
        }
        catch (error) {
            throw new common_1.BadRequestException(`No se pudo subir el archivo al servidor: ${error.message}`);
        }
        finally {
            await fs.promises.unlink(tmpPath).catch(() => { });
        }
        return {
            success: true,
            path: remotePath,
            name: originalName,
            size: file.buffer.length,
        };
    }
    async ownedServer(serverId, userId) {
        const result = await this.db.query('SELECT * FROM servers WHERE id = $1 AND user_id = $2', [serverId, userId]);
        const serverData = result.rows[0];
        if (!serverData)
            return null;
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
};
exports.DeployController = DeployController;
__decorate([
    (0, common_1.Get)('deploy/stacks'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], DeployController.prototype, "listStacks", null);
__decorate([
    (0, common_1.Post)(':id/deploy-website'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, deploy_website_dto_1.DeployWebsiteDto, typeof (_a = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], DeployController.prototype, "deployWebsite", null);
__decorate([
    (0, common_1.Post)(':id/wordpress/upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: WP_UPLOAD_MAX_BYTES } })),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], DeployController.prototype, "uploadWordpressAsset", null);
exports.DeployController = DeployController = __decorate([
    (0, common_1.Controller)('servers'),
    __metadata("design:paramtypes", [deploy_service_1.DeployService,
        ssh_service_1.SshService,
        database_service_1.DatabaseService])
], DeployController);
//# sourceMappingURL=deploy.controller.js.map