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
exports.DeployService = exports.PORT_RANGE_END = exports.PORT_RANGE_START = void 0;
exports.toSafeName = toSafeName;
exports.parseStackConfig = parseStackConfig;
exports.validateForStack = validateForStack;
const common_1 = require("@nestjs/common");
const dns = require("dns");
const util_1 = require("util");
const ssh_service_1 = require("../services/ssh.service");
const database_service_1 = require("../database/database.service");
const stack_registry_1 = require("./stacks/stack.registry");
const nginx_util_1 = require("./nginx.util");
const resolve4 = (0, util_1.promisify)(dns.resolve4);
exports.PORT_RANGE_START = 30000;
exports.PORT_RANGE_END = 39999;
function toSafeName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
}
function parseStackConfig(raw) {
    if (!raw)
        return undefined;
    if (typeof raw === 'object')
        return raw;
    try {
        return JSON.parse(String(raw));
    }
    catch {
        return undefined;
    }
}
function validateForStack(stackId, dto) {
    if (stackId === 'wordpress') {
        if (dto.wpMode === 'migrate') {
            if (!dto.wpArchiveUrl?.trim()) {
                return 'Para migrar un WordPress existente hace falta el archivo con los ficheros del sitio (.zip o .tar.gz).';
            }
            return null;
        }
        if (!dto.wpAdminUser?.trim())
            return 'Indica el usuario administrador de WordPress.';
        if (!dto.wpAdminPassword || dto.wpAdminPassword.length < 8) {
            return 'La contraseña del administrador de WordPress debe tener al menos 8 caracteres.';
        }
        if (!dto.wpAdminEmail?.trim())
            return 'Indica el correo del administrador de WordPress.';
        return null;
    }
    if (!dto.repo?.trim())
        return 'Indica el repositorio Git del proyecto.';
    return null;
}
let DeployService = DeployService_1 = class DeployService {
    constructor(ssh, db, registry) {
        this.ssh = ssh;
        this.db = db;
        this.registry = registry;
        this.logger = new common_1.Logger(DeployService_1.name);
    }
    buildNginxFor(ctx, stackId) {
        const stack = this.registry.get(stackId || 'node');
        return (0, nginx_util_1.buildNginxScript)(ctx, stack.serve(ctx));
    }
    stackOf(site) {
        return this.registry.get(site?.stack || 'node');
    }
    listStacks() {
        return this.registry.list();
    }
    contextFor(server, site, body = {}) {
        const safeName = toSafeName(site.name);
        return {
            server,
            safeName,
            projectPath: `/var/www/${safeName}`,
            data: {
                ...body,
                name: site.name,
                port: String(site.port ?? ''),
            },
            stackConfig: parseStackConfig(site.stack_config),
        };
    }
    buildUpdateScript(ctx, site) {
        const stack = this.stackOf(site);
        const next = { ...ctx, stackConfig: stack.reconfigure(ctx, site) };
        return [
            stack.updateAppScript(next, site),
            (0, nginx_util_1.buildNginxScript)(next, stack.serve(next)),
            stack.postNginxScript(next),
        ].join('\n');
    }
    reconfigureFor(ctx, site) {
        return this.stackOf(site).reconfigure(ctx, site);
    }
    buildCleanupScript(ctx, site) {
        const stack = this.stackOf(site);
        return `
            ${stack.cleanupScript(ctx, site)}
            sudo rm -f /etc/nginx/sites-enabled/${ctx.safeName}
            sudo rm -f /etc/nginx/sites-available/${ctx.safeName}
            sudo nginx -t && sudo systemctl reload nginx
        `;
    }
    logCommandsFor(ctx, site) {
        return this.stackOf(site).logCommands(ctx, site);
    }
    async allocatePort(serverId, preferred) {
        const wanted = parseInt(String(preferred ?? ''), 10);
        if (Number.isInteger(wanted) && wanted > 0 && wanted < 65536) {
            const taken = await this.db.query('SELECT 1 FROM websites WHERE server_id = $1 AND port = $2', [serverId, wanted]);
            if (taken.rows.length === 0)
                return wanted;
        }
        const res = await this.db.query(`SELECT p FROM generate_series($2::int, $3::int) p
             WHERE NOT EXISTS (
                 SELECT 1 FROM websites w WHERE w.server_id = $1 AND w.port = p
             )
             ORDER BY p LIMIT 1`, [serverId, exports.PORT_RANGE_START, exports.PORT_RANGE_END]);
        const free = res.rows[0]?.p;
        if (!free) {
            throw new Error(`No quedan puertos libres en el rango ${exports.PORT_RANGE_START}-${exports.PORT_RANGE_END} para este servidor.`);
        }
        return Number(free);
    }
    async findNameConflict(serverId, safeName) {
        const res = await this.db.query(`SELECT name FROM websites
             WHERE server_id = $1
               AND lower(regexp_replace(name, '[^a-zA-Z0-9_-]', '', 'g')) = $2
             LIMIT 1`, [serverId, safeName]);
        return res.rows[0]?.name ?? null;
    }
    async deploy(server, userId, dto, onData) {
        const stackId = dto.stack ?? 'node';
        const stack = this.registry.get(stackId);
        const safeName = toSafeName(dto.name);
        const projectPath = `/var/www/${safeName}`;
        const emitRaw = (chunk) => { if (onData)
            onData(chunk); };
        await this.ensureWebsitesColumns();
        const missing = validateForStack(stackId, dto);
        if (missing) {
            emitRaw(`\n❌ ${missing}\n`);
            emitRaw('\n\n---DONE---\n');
            return false;
        }
        const conflict = await this.findNameConflict(server.id, safeName);
        if (conflict) {
            emitRaw(`\n❌ Ya existe un sitio llamado "${conflict}" en este servidor.\n`);
            emitRaw(`   Ambos usarían la misma carpeta (/var/www/${safeName}), el mismo proceso PM2\n`);
            emitRaw(`   y la misma configuración de Nginx, así que este despliegue borraría el anterior.\n`);
            emitRaw(`   Elige otro nombre, o actualiza el sitio existente desde su panel.\n`);
            emitRaw('\n\n---DONE---\n');
            return false;
        }
        let port = null;
        if (stack.needsPort) {
            try {
                port = await this.allocatePort(server.id, dto.port);
            }
            catch (error) {
                emitRaw(`\n❌ ${error.message}\n`);
                emitRaw('\n\n---DONE---\n');
                return false;
            }
            if (String(port) !== String(dto.port)) {
                emitRaw(`ℹ️ Puerto interno asignado por el panel: ${port}.\n`);
            }
        }
        let repoUrlWithToken = dto.repo || '';
        let userEmail = '';
        const userRes = await this.db.query('SELECT github_token, email FROM users WHERE id = $1', [userId]);
        const userData = userRes.rows[0];
        if (stack.usesGit && userData?.github_token && repoUrlWithToken.startsWith('https://github.com/')) {
            repoUrlWithToken = repoUrlWithToken.replace('https://github.com/', `https://${userData.github_token}@github.com/`);
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
            data: { ...dto, port: port === null ? '' : String(port), repo: repoUrlWithToken, userEmail },
        };
        ctx.stackConfig = stack.prepare(ctx);
        let websiteId;
        try {
            const inserted = await this.db.query(`
                INSERT INTO websites (server_id, user_id, repo_url, name, install_command, build_command, start_command, port, domain, entry_point, env_vars, use_letsencrypt, setup_www_alias, stack, stack_config)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING id
            `, [
                server.id, userId, dto.repo || '', dto.name, dto.installCommand, dto.buildCommand,
                dto.startCommand, port, dto.domain, dto.entryPoint, dto.envVars,
                dto.useLetsEncrypt || false, dto.setupWwwAlias || false, stackId,
                JSON.stringify(ctx.stackConfig ?? {}),
            ]);
            websiteId = inserted.rows[0].id;
        }
        catch (error) {
            this.logger.error(`No se pudo reservar el sitio ${safeName} en ${server.ip}: ${error.message}`);
            emit(`\n❌ No se pudo reservar el sitio: otro despliegue tomó el nombre o el puerto justo ahora.\n`);
            emit(`   Vuelve a intentarlo.\n`);
            emit('\n\n---DONE---\n');
            return false;
        }
        const fullScript = [
            stack.buildAppScript(ctx),
            (0, nginx_util_1.buildNginxScript)(ctx, stack.serve(ctx)),
            stack.postNginxScript(ctx),
        ].join('\n');
        try {
            await this.ssh.executeCommand(server, fullScript, emit);
            emit('\n\n---DONE---\n');
        }
        catch (error) {
            this.logger.error(`Error desplegando ${safeName} (${stackId}) en ${server.ip}: ${error.message}`);
            emit(`\n❌ Error de despliegue: ${error.message}\n`);
            await this.db.query('DELETE FROM websites WHERE id = $1', [websiteId])
                .catch((e) => this.logger.error(`No se pudo liberar la reserva ${websiteId}: ${e}`));
            emit('\n\n---DONE---\n');
            return false;
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
                -- Datos derivados propios de cada stack (credenciales de la base
                -- de datos de WordPress, ruta de instalación, URL del sitio…).
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='stack_config') THEN
                    ALTER TABLE websites ADD COLUMN stack_config JSONB;
                END IF;
            END $$;
        `);
        await this.db.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='websites' AND column_name='port' AND data_type <> 'integer') THEN
                    ALTER TABLE websites
                        ALTER COLUMN port TYPE INT
                        USING NULLIF(regexp_replace(port::text, '[^0-9]', '', 'g'), '')::int;
                END IF;
            END $$;
        `);
        await this.db.query(`
            DO $$
            BEGIN
                BEGIN
                    ALTER TABLE websites ADD CONSTRAINT websites_server_port_uniq UNIQUE (server_id, port);
                EXCEPTION
                    WHEN duplicate_table OR duplicate_object THEN NULL;
                    WHEN unique_violation THEN
                        RAISE WARNING 'websites: hay puertos duplicados en un mismo servidor; revisalos para activar websites_server_port_uniq.';
                END;
                BEGIN
                    ALTER TABLE websites ADD CONSTRAINT websites_server_name_uniq UNIQUE (server_id, name);
                EXCEPTION
                    WHEN duplicate_table OR duplicate_object THEN NULL;
                    WHEN unique_violation THEN
                        RAISE WARNING 'websites: hay nombres duplicados en un mismo servidor; revisalos para activar websites_server_name_uniq.';
                END;
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