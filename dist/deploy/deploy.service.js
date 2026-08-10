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
var DeployService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeployService = void 0;
const common_1 = require("@nestjs/common");
const dns = require("dns");
const util_1 = require("util");
const ssh_service_1 = require("../services/ssh.service");
const database_service_1 = require("../database/database.service");
const stack_registry_1 = require("./stacks/stack.registry");
const nginx_util_1 = require("./nginx.util");
const resolve4 = (0, util_1.promisify)(dns.resolve4);
let DeployService = DeployService_1 = class DeployService {
    constructor(ssh, db, registry) {
        this.ssh = ssh;
        this.db = db;
        this.registry = registry;
        this.logger = new common_1.Logger(DeployService_1.name);
    }
    async deploy(server, userId, dto, onData) {
        const stackId = dto.stack ?? 'node';
        const stack = this.registry.get(stackId);
        const safeName = dto.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const projectPath = `/var/www/${safeName}`;
        let repoUrlWithToken = dto.repo;
        let userEmail = '';
        const userRes = await this.db.query('SELECT github_token, email FROM users WHERE id = $1', [userId]);
        const userData = userRes.rows[0];
        if (userData?.github_token && dto.repo.startsWith('https://github.com/')) {
            repoUrlWithToken = dto.repo.replace('https://github.com/', `https://${userData.github_token}@github.com/`);
        }
        userEmail = userData?.email || '';
        const emit = (chunk) => {
            if (!onData)
                return;
            if (repoUrlWithToken !== dto.repo) {
                const tokenRegex = new RegExp(`https://[^@]+@github\\.com`, 'g');
                chunk = chunk.replace(tokenRegex, 'https://github.com');
            }
            onData(chunk);
        };
        if (dto.useLetsEncrypt && dto.domain && dto.domain !== '_') {
            emit(`🔍 Verificando propagación DNS para ${dto.domain}...\n`);
            try {
                const addresses = await resolve4(dto.domain);
                if (!addresses.includes(server.ip)) {
                    emit(`⚠️ ADVERTENCIA: El dominio ${dto.domain} apunta a ${addresses.join(', ')} pero el servidor es ${server.ip}.\n`);
                    emit(`❌ La generación de SSL podría fallar. Asegúrate de que el registro A sea correcto.\n\n`);
                }
                else {
                    emit(`✅ DNS verificado correctamente.\n\n`);
                }
            }
            catch {
                emit(`⚠️ No se pudo resolver el dominio ${dto.domain}. Es posible que los DNS no hayan propagado aún.\n`);
                emit(`❌ Procediendo con precaución, pero SSL podría fallar.\n\n`);
            }
        }
        const ctx = {
            server,
            safeName,
            projectPath,
            data: { ...dto, repo: repoUrlWithToken, userEmail },
        };
        const fullScript = `${stack.buildAppScript(ctx)}\n${(0, nginx_util_1.buildNginxScript)(ctx, stack.serve(ctx))}`;
        try {
            await this.ssh.executeCommand(server, fullScript, emit);
            emit('\n\n---DONE---\n');
        }
        catch (error) {
            this.logger.error(`Error desplegando ${safeName} (${stackId}) en ${server.ip}: ${error.message}`);
            emit(`\n❌ Error de despliegue: ${error.message}\n`);
            return false;
        }
        try {
            await this.ensureWebsitesColumns();
            await this.db.query(`
                INSERT INTO websites (server_id, user_id, repo_url, name, install_command, build_command, start_command, port, domain, entry_point, env_vars, use_letsencrypt, setup_www_alias, stack)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `, [
                server.id, userId, dto.repo, dto.name, dto.installCommand, dto.buildCommand,
                dto.startCommand, dto.port, dto.domain, dto.entryPoint, dto.envVars,
                dto.useLetsEncrypt || false, dto.setupWwwAlias || false, stackId,
            ]);
        }
        catch (error) {
            this.logger.error(`Error guardando el sitio en la base de datos: ${error}`);
        }
        return true;
    }
    async ensureWebsitesColumns() {
        await this.db.query(`
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
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='use_letsencrypt') THEN
                    ALTER TABLE websites ADD COLUMN use_letsencrypt BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='setup_www_alias') THEN
                    ALTER TABLE websites ADD COLUMN setup_www_alias BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='stack') THEN
                    ALTER TABLE websites ADD COLUMN stack VARCHAR(32) DEFAULT 'node';
                END IF;
            END $$;
        `);
    }
};
exports.DeployService = DeployService;
exports.DeployService = DeployService = DeployService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ssh_service_1.SshService,
        database_service_1.DatabaseService,
        stack_registry_1.StackRegistry])
], DeployService);
//# sourceMappingURL=deploy.service.js.map