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
const express_1 = require("express");
const current_user_decorator_1 = require("../common/auth/current-user.decorator");
const database_service_1 = require("../database/database.service");
const deploy_service_1 = require("./deploy.service");
const deploy_website_dto_1 = require("./dto/deploy-website.dto");
let DeployController = class DeployController {
    constructor(deployService, db) {
        this.deployService = deployService;
        this.db = db;
    }
    async deployWebsite(id, userId, body, res) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        const result = await this.db.query('SELECT * FROM servers WHERE id = $1 AND user_id = $2', [id, userId]);
        const serverData = result.rows[0];
        if (!serverData) {
            res.status(404).write('---ERROR---\nServidor no encontrado');
            res.end();
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
        await this.deployService.deploy(server, userId, body, (chunk) => res.write(chunk));
        res.end();
    }
};
exports.DeployController = DeployController;
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
exports.DeployController = DeployController = __decorate([
    (0, common_1.Controller)('servers'),
    __metadata("design:paramtypes", [deploy_service_1.DeployService,
        database_service_1.DatabaseService])
], DeployController);
//# sourceMappingURL=deploy.controller.js.map