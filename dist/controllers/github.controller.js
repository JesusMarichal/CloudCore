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
var GithubController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GithubController = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const ssh_service_1 = require("../services/ssh.service");
const rest_1 = require("@octokit/rest");
let GithubController = GithubController_1 = class GithubController {
    constructor(db, sshService) {
        this.db = db;
        this.sshService = sshService;
        this.logger = new common_1.Logger(GithubController_1.name);
    }
    async getSettings(userId) {
        try {
            const result = await this.db.query('SELECT github_token FROM users WHERE id = $1', [userId]);
            if (!result.rows[0])
                return { success: false, message: 'Usuario no encontrado' };
            return { success: true, token: result.rows[0].github_token };
        }
        catch (error) {
            this.logger.error('Error fetching github settings:', error);
            return { success: false, message: 'Error interno del servidor' };
        }
    }
    async saveSettings(userId, body) {
        try {
            await this.db.query('UPDATE users SET github_token = $1 WHERE id = $2', [body.token, userId]);
            return { success: true, message: 'Token guardado correctamente' };
        }
        catch (error) {
            this.logger.error('Error saving github settings:', error);
            return { success: false, message: 'Error al guardar configuración' };
        }
    }
    async getRepos(userId) {
        try {
            const result = await this.db.query('SELECT github_token FROM users WHERE id = $1', [userId]);
            const token = result.rows[0]?.github_token;
            if (!token) {
                return { success: false, message: 'No hay token de Github configurado.' };
            }
            const octokit = new rest_1.Octokit({
                auth: token,
                request: {
                    timeout: 30000
                }
            });
            const { data } = await octokit.rest.repos.listForAuthenticatedUser({
                sort: 'updated',
                per_page: 50,
            });
            const repos = data.map(repo => ({
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                clone_url: repo.clone_url,
                private: repo.private
            }));
            return { success: true, repos };
        }
        catch (error) {
            this.logger.error('Error fetching repos:', error);
            return { success: false, message: 'Error conectando con la API de Github. Revisa tu token.' };
        }
    }
    async handleWebhook(req, payload) {
        const event = req.headers['x-github-event'];
        if (event !== 'push') {
            return { success: true, message: 'Evento ignorado' };
        }
        const repoUrl = payload.repository?.clone_url;
        const branch = payload.ref?.split('/').pop();
        if (!repoUrl || branch !== 'main') {
            this.logger.log(`Push ignorado. Rama: ${branch}`);
            return { success: true, message: 'Solo reaccionamos a push en main' };
        }
        this.logger.log(`¡Webhook recibido para repositorio ${repoUrl} en branch ${branch}!`);
        await this.db.query(`
            CREATE TABLE IF NOT EXISTS websites (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                server_id UUID REFERENCES servers(id),
                user_id VARCHAR(255),
                repo_url VARCHAR(255),
                name VARCHAR(255),
                install_command VARCHAR(255),
                build_command VARCHAR(255),
                start_command VARCHAR(255),
                port VARCHAR(50),
                domain VARCHAR(255),
                entry_point VARCHAR(255)
            )
        `);
        await this.db.query(`
            CREATE TABLE IF NOT EXISTS user_notifications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL DEFAULT 'success',
                title VARCHAR(255) NOT NULL,
                message TEXT,
                read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        try {
            const repoUrlClean = repoUrl.replace(/\.git$/, '');
            const sitesResult = await this.db.query(`SELECT * FROM websites WHERE repo_url = $1 OR repo_url = $2 OR repo_url = $3`, [repoUrl, repoUrlClean, repoUrlClean + '.git']);
            const sites = sitesResult.rows;
            if (sites.length === 0) {
                this.logger.log(`No hay sitios registrados vinculados al repo ${repoUrl}`);
                return { success: true, message: 'No hay sitios vinculados' };
            }
            for (const site of sites) {
                const serverResult = await this.db.query('SELECT * FROM servers WHERE id = $1', [site.server_id]);
                const serverData = serverResult.rows[0];
                if (!serverData)
                    continue;
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
                const projectPath = "/var/www/" + safeName;
                const cmd = `
                    cd ${projectPath} && \\
                    git pull origin main && \\
                    ${site.install_command || 'npm install'} && \\
                    pm2 restart ${safeName}
                `;
                this.logger.log(`Actualizando sitio ${safeName} en el servidor ${server.ip}...`);
                await this.sshService.executeCommand(server, cmd);
                this.logger.log(`¡Sitio ${safeName} actualizado correctamente vía webhook!`);
                const commitMsg = payload.head_commit?.message || 'Commit nuevo';
                const shortHash = (payload.head_commit?.id || '').slice(0, 7);
                await this.db.query(`INSERT INTO user_notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)`, [
                    site.user_id,
                    'success',
                    `${site.name} actualizado`,
                    shortHash ? `[${shortHash}] ${commitMsg}` : commitMsg,
                ]);
            }
            return { success: true, message: 'Despliegues actualizados' };
        }
        catch (error) {
            this.logger.error('Error procesando webhook:', error);
            throw new common_1.BadRequestException('Error en webhook');
        }
    }
};
exports.GithubController = GithubController;
__decorate([
    (0, common_1.Get)('settings/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GithubController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Post)('settings/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GithubController.prototype, "saveSettings", null);
__decorate([
    (0, common_1.Get)('repos/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GithubController.prototype, "getRepos", null);
__decorate([
    (0, common_1.Post)('webhook'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GithubController.prototype, "handleWebhook", null);
exports.GithubController = GithubController = GithubController_1 = __decorate([
    (0, common_1.Controller)('github'),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        ssh_service_1.SshService])
], GithubController);
//# sourceMappingURL=github.controller.js.map