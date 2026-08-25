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
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerController = void 0;
const common_1 = require("@nestjs/common");
const express_1 = require("express");
const ssh_service_1 = require("../services/ssh.service");
const create_server_dto_1 = require("../dto/create-server.dto");
const database_service_1 = require("../database/database.service");
const encryption_util_1 = require("../common/utils/encryption.util");
const current_user_decorator_1 = require("../common/auth/current-user.decorator");
const crypto = require("crypto");
const deploy_service_1 = require("../deploy/deploy.service");
const dns = require("dns");
const util_1 = require("util");
const resolve4 = (0, util_1.promisify)(dns.resolve4);
const DISCOVER_STEP = { key: 'discover_websites', name: 'Detectando sitios existentes' };
const PROVISION_TOTAL = ssh_service_1.PROVISION_STEPS.length + 1;
let ServerController = class ServerController {
    constructor(sshService, dbService, deployService) {
        this.sshService = sshService;
        this.dbService = dbService;
        this.deployService = deployService;
    }
    async assertServerOwnership(serverId, userId) {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1 AND user_id = $2', [serverId, userId]);
        const serverData = result.rows[0];
        if (!serverData)
            throw new common_1.NotFoundException('Servidor no encontrado');
        return serverData;
    }
    async assertWebsiteOwnership(serverId, websiteId) {
        const result = await this.dbService.query('SELECT * FROM websites WHERE id = $1 AND server_id = $2', [websiteId, serverId]);
        const site = result.rows[0];
        if (!site)
            throw new common_1.NotFoundException('Sitio no encontrado');
        return site;
    }
    async assertDatabaseOwnership(serverId, dbId) {
        const result = await this.dbService.query('SELECT * FROM database_instances WHERE id = $1 AND server_id = $2::text', [dbId, serverId]);
        const dbInstance = result.rows[0];
        if (!dbInstance)
            throw new common_1.NotFoundException('Base de datos no encontrada');
        return dbInstance;
    }
    async findAll(userId) {
        try {
            const result = await this.dbService.query(`SELECT id, user_id as "userId", name, ip, ssh_port as "sshPort",
                ssh_user as "sshUser", auth_type as "authType", status,
                provisioning_step as "provisioningStep",
                provisioning_step_key as "provisioningStepKey",
                provisioning_index as "provisioningIndex",
                provisioning_total as "provisioningTotal",
                provisioning_percent as "provisioningPercent",
                provisioning_detail as "provisioningDetail",
                provisioning_started_at as "provisioningStartedAt",
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
    async create(userId, serverDto) {
        const encryptedPrivateKey = serverDto.privateKey ? (0, encryption_util_1.encrypt)(serverDto.privateKey) : undefined;
        const encryptedPassword = serverDto.password ? (0, encryption_util_1.encrypt)(serverDto.password) : undefined;
        const serverId = crypto.randomUUID();
        const newServer = {
            id: serverId,
            userId: userId,
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
            await this.dbService.query(`INSERT INTO servers (id, user_id, name, ip, ssh_port, ssh_user, auth_type, private_key, password, status,
                                      provisioning_step, provisioning_step_key, provisioning_index, provisioning_total,
                                      provisioning_percent, provisioning_detail, provisioning_log, provisioning_started_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                         $11, $12, 0, $13, 0, NULL, '', NOW())`, [
                newServer.id,
                newServer.userId,
                newServer.name,
                newServer.ip,
                newServer.sshPort,
                newServer.sshUser,
                newServer.authType,
                newServer.privateKey,
                newServer.password,
                newServer.status,
                'Conectando por SSH',
                'connect',
                PROVISION_TOTAL
            ]);
        }
        catch (error) {
            console.error('Error guardando servidor en BD:', error);
            throw new common_1.InternalServerErrorException('No se pudo guardar el servidor');
        }
        const tracker = this.createProvisioningTracker(serverId);
        this.sshService.provision(newServer, (event) => tracker.handle(event))
            .then(async () => {
            try {
                await tracker.setStep({
                    name: DISCOVER_STEP.name,
                    key: DISCOVER_STEP.key,
                    index: PROVISION_TOTAL,
                    total: PROVISION_TOTAL,
                    percent: Math.round(((PROVISION_TOTAL - 1) / PROVISION_TOTAL) * 100),
                });
                const imported = await this.importExistingWebsites(newServer, serverId, userId);
                if (imported.length > 0) {
                    tracker.pushLine(`Importados ${imported.length} sitios existentes: ${imported.map(s => s.name).join(', ')}`);
                    console.log(`Importados ${imported.length} sitios existentes desde ${newServer.ip}: ${imported.map(s => s.name).join(', ')}`);
                }
                else {
                    tracker.pushLine('No se encontraron sitios previos en el servidor.');
                }
            }
            catch (err) {
                tracker.pushLine(`Aviso: no se pudieron importar los sitios existentes (${err.message})`);
                console.error(`No se pudieron importar los sitios existentes de ${newServer.ip}:`, err.message);
            }
            tracker.pushLine('Aprovisionamiento completado. El servidor está listo.');
            await tracker.finish('online', 'Completado', 'done', 100);
        })
            .catch(async (err) => {
            console.error(`Error de aprovisionamiento para ${newServer.ip}:`, err);
            await tracker.finish('offline', 'Error: ' + err.message, 'error', null);
        });
        const { privateKey, password, ...safeServer } = newServer;
        return safeServer;
    }
    createProvisioningTracker(serverId) {
        const LOG_FLUSH_MS = 2000;
        const MAX_LOG_LINES = 200;
        const lines = [];
        let lastDetail = '';
        let lastFlush = 0;
        let flushTimer = null;
        let finished = false;
        const writeLog = async () => {
            lastFlush = Date.now();
            try {
                await this.dbService.query('UPDATE servers SET provisioning_detail = $1, provisioning_log = $2 WHERE id = $3', [lastDetail, lines.join('\n'), serverId]);
            }
            catch (e) {
            }
        };
        const scheduleFlush = () => {
            if (finished || flushTimer)
                return;
            const wait = Math.max(0, LOG_FLUSH_MS - (Date.now() - lastFlush));
            flushTimer = setTimeout(() => {
                flushTimer = null;
                void writeLog();
            }, wait);
            flushTimer.unref?.();
        };
        const pushLine = (line) => {
            lines.push(line);
            if (lines.length > MAX_LOG_LINES)
                lines.splice(0, lines.length - MAX_LOG_LINES);
            lastDetail = line;
            scheduleFlush();
        };
        const setStep = async (step) => {
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            lastFlush = Date.now();
            try {
                await this.dbService.query(`UPDATE servers SET provisioning_step = $1, provisioning_step_key = $2,
                                       provisioning_index = $3, provisioning_total = $4,
                                       provisioning_percent = $5, provisioning_log = $6
                     WHERE id = $7`, [step.name, step.key, step.index, step.total, step.percent, lines.join('\n'), serverId]);
            }
            catch (e) { }
        };
        return {
            pushLine,
            setStep,
            handle: (event) => {
                if (event.type === 'log') {
                    pushLine(event.line);
                    return;
                }
                if (event.type === 'error') {
                    pushLine(`ERROR: ${event.message}`);
                    return;
                }
                pushLine(`\u25B8 ${event.name}`);
                return setStep({
                    name: event.name,
                    key: event.key,
                    index: event.index,
                    total: PROVISION_TOTAL,
                    percent: Math.round(((event.index - 1) / PROVISION_TOTAL) * 100),
                });
            },
            finish: async (status, step, key, percent) => {
                finished = true;
                step = step.slice(0, 250);
                if (flushTimer) {
                    clearTimeout(flushTimer);
                    flushTimer = null;
                }
                try {
                    await this.dbService.query(`UPDATE servers SET status = $1, provisioning_step = $2, provisioning_step_key = $3,
                                           provisioning_percent = COALESCE($4, provisioning_percent),
                                           provisioning_detail = $5, provisioning_log = $6,
                                           provisioning_finished_at = NOW()
                         WHERE id = $7`, [status, step, key, percent, lines[lines.length - 1] || '', lines.join('\n'), serverId]);
                }
                catch (e) {
                    console.error('No se pudo guardar el estado final del aprovisionamiento:', e.message);
                }
            },
        };
    }
    async getProvisioning(id, userId) {
        const data = await this.assertServerOwnership(id, userId);
        const startedAt = data.provisioning_started_at ? new Date(data.provisioning_started_at) : null;
        const finishedAt = data.provisioning_finished_at ? new Date(data.provisioning_finished_at) : null;
        return {
            status: data.status,
            step: data.provisioning_step || null,
            stepKey: data.provisioning_step_key || null,
            index: Number(data.provisioning_index) || 0,
            total: Number(data.provisioning_total) || PROVISION_TOTAL,
            percent: Number(data.provisioning_percent) || 0,
            detail: data.provisioning_detail || '',
            log: data.provisioning_log || '',
            startedAt,
            finishedAt,
            elapsedSeconds: startedAt
                ? Math.max(0, Math.round(((finishedAt || new Date()).getTime() - startedAt.getTime()) / 1000))
                : 0,
            steps: [...ssh_service_1.PROVISION_STEPS, DISCOVER_STEP].map(st => ({ key: st.key, name: st.name })),
        };
    }
    async deleteServer(id, userId) {
        const serverData = await this.assertServerOwnership(id, userId);
        try {
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
    async refreshHealth(id, userId) {
        const serverData = await this.assertServerOwnership(id, userId);
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
    async getServices(id, userId) {
        const serverData = await this.assertServerOwnership(id, userId);
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
    async installService(id, serviceName, userId, res) {
        let serverData;
        try {
            serverData = await this.assertServerOwnership(id, userId);
        }
        catch {
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
    async uninstallService(id, serviceName, userId, res) {
        let serverData;
        try {
            serverData = await this.assertServerOwnership(id, userId);
        }
        catch {
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
    async manageService(id, serviceName, action, userId) {
        const serverData = await this.assertServerOwnership(id, userId);
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
    async updateSystem(id, userId, res) {
        let serverData;
        try {
            serverData = await this.assertServerOwnership(id, userId);
        }
        catch {
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
    async updateWebsite(id, websiteId, userId, body, res) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        let serverData;
        let site;
        try {
            serverData = await this.assertServerOwnership(id, userId);
            site = await this.assertWebsiteOwnership(id, websiteId);
        }
        catch {
            res.status(404).write('---ERROR---\nServidor no encontrado');
            res.end();
            return;
        }
        if (body.useLetsEncrypt && body.domain && body.domain !== '_') {
            res.write(`🔍 Verificando propagación DNS para ${body.domain}...\n`);
            try {
                const addresses = await resolve4(body.domain);
                const serverIp = serverData.ip;
                if (!addresses.includes(serverIp)) {
                    res.write(`⚠️ ADVERTENCIA: El dominio ${body.domain} apunta a ${addresses.join(', ')} pero el servidor es ${serverIp}.\n`);
                    res.write(`❌ La generación de SSL podría fallar. Asegúrate de que el registro A en Spaceship sea correcto.\n\n`);
                }
                else {
                    res.write(`✅ DNS verificado correctamente.\n\n`);
                }
            }
            catch (error) {
                res.write(`⚠️ No se pudo resolver el dominio ${body.domain}. Es posible que los DNS no hayan propagado aún.\n`);
                res.write(`❌ Procediendo con precaución, pero SSL podría fallar.\n\n`);
            }
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
        await this.deployService.ensureWebsitesColumns();
        const userRes = await this.dbService.query('SELECT email FROM users WHERE id = $1', [userId]);
        const userEmail = userRes.rows[0]?.email || '';
        const ctx = this.deployService.contextFor(server, site, { ...body, userEmail });
        const updateCmd = this.deployService.buildUpdateScript(ctx, site);
        const stackConfig = this.deployService.reconfigureFor(ctx, site);
        await this.dbService.query(`
            UPDATE websites
            SET install_command = $1, build_command = $2, start_command = $3,
                domain = $4, entry_point = $5, env_vars = $6,
                use_letsencrypt = $7, setup_www_alias = $8, stack_config = $9
            WHERE id = $10
        `, [body.installCommand, body.buildCommand, body.startCommand, body.domain, body.entryPoint, body.envVars, body.useLetsEncrypt || false, body.setupWwwAlias || false, JSON.stringify(stackConfig), websiteId]);
        await this.sshService.executeCommand(server, updateCmd, (chunk) => {
            res.write(chunk);
        });
        res.write('\n✅ Proceso completado exitosamente.');
        res.end();
    }
    async getWebsites(userId) {
        try {
            await this.dbService.query(`
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='env_vars') THEN
                        ALTER TABLE websites ADD COLUMN env_vars TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='use_letsencrypt') THEN
                        ALTER TABLE websites ADD COLUMN use_letsencrypt BOOLEAN DEFAULT FALSE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='setup_www_alias') THEN
                        ALTER TABLE websites ADD COLUMN setup_www_alias BOOLEAN DEFAULT FALSE;
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
    async importExistingWebsites(server, serverId, userId) {
        const discovered = await this.sshService.discoverWebsites(server);
        if (discovered.length === 0)
            return [];
        await this.deployService.ensureWebsitesColumns();
        const imported = [];
        for (const site of discovered) {
            const exists = await this.dbService.query('SELECT 1 FROM websites WHERE server_id = $1 AND name = $2', [serverId, site.name]);
            if (exists.rows.length > 0)
                continue;
            const safeName = (0, deploy_service_1.toSafeName)(site.name);
            const stackConfig = site.stack === 'wordpress'
                ? {
                    mode: 'migrate',
                    directory: site.wpDirectory || '',
                    installPath: site.wpDirectory ? `/var/www/${safeName}/${site.wpDirectory}` : `/var/www/${safeName}`,
                    docroot: `/var/www/${safeName}`,
                    host: site.domain || '',
                    externalDb: true,
                    dbHost: 'localhost',
                    dbName: site.wpDbName || '',
                    dbUser: site.wpDbUser || '',
                    dbPassword: '',
                    tablePrefix: 'wp_',
                    locale: 'es_ES',
                }
                : {};
            await this.dbService.query(`
                INSERT INTO websites (server_id, user_id, repo_url, name, install_command, build_command, start_command, port, domain, entry_point, env_vars, use_letsencrypt, setup_www_alias, stack, stack_config)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            `, [
                serverId,
                userId || '',
                site.repoUrl,
                site.name,
                site.stack === 'wordpress' ? '' : 'npm install',
                '',
                '',
                site.port || null,
                site.domain,
                site.entryPoint,
                site.envVars,
                site.useLetsEncrypt,
                site.setupWwwAlias,
                site.stack || 'node',
                JSON.stringify(stackConfig),
            ]);
            imported.push(site);
        }
        return imported;
    }
    async importWebsites(id, userId) {
        const serverData = await this.assertServerOwnership(id, userId);
        const server = this.getServerFromData(serverData);
        try {
            const imported = await this.importExistingWebsites(server, id, userId);
            return {
                success: true,
                imported: imported.length,
                sites: imported.map(s => ({ name: s.name, domain: s.domain, port: s.port })),
                message: imported.length > 0
                    ? `Se registraron ${imported.length} sitios detectados en el servidor`
                    : 'No se encontraron sitios nuevos para registrar'
            };
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    async getWebsiteEnv(id, websiteId, userId) {
        const serverData = await this.assertServerOwnership(id, userId);
        const site = await this.assertWebsiteOwnership(id, websiteId);
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
    async deleteWebsite(id, websiteId, userId) {
        const serverData = await this.assertServerOwnership(id, userId);
        const site = await this.assertWebsiteOwnership(id, websiteId);
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
        const ctx = this.deployService.contextFor(server, site);
        const cleanCmd = this.deployService.buildCleanupScript(ctx, site);
        await this.sshService.executeCommand(server, cleanCmd);
        await this.dbService.query('DELETE FROM websites WHERE id = $1', [websiteId]);
        return { success: true, message: 'Sitio eliminado correctamente' };
    }
    async getWebsiteLogs(id, websiteId, userId) {
        const serverData = await this.assertServerOwnership(id, userId);
        const site = await this.assertWebsiteOwnership(id, websiteId);
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
        const ctx = this.deployService.contextFor(server, site);
        const { out: outCmd, error: errCmd, nginx: nginxCmd } = this.deployService.logCommandsFor(ctx, site);
        const outLogs = await this.sshService.executeCommand(server, outCmd);
        const errLogs = await this.sshService.executeCommand(server, errCmd);
        const nginxLogs = await this.sshService.executeCommand(server, nginxCmd);
        return {
            success: true,
            logs: {
                out: outLogs,
                error: errLogs,
                nginx: nginxLogs
            }
        };
    }
    async getWebsiteCommit(id, websiteId, userId) {
        const serverData = await this.assertServerOwnership(id, userId);
        const site = await this.assertWebsiteOwnership(id, websiteId);
        if (!this.deployService.stackOf(site).usesGit) {
            return { success: false, tracksCommits: false, message: 'Este sitio no se despliega desde un repositorio Git.' };
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
        const safeName = site.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const projectPath = `/var/www/${safeName}`;
        try {
            const checkCmd = `
                cd ${projectPath}
                git fetch origin -q || true
                BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")
                LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "")
                REMOTE=$(git rev-parse origin/$BRANCH 2>/dev/null || echo "")
                LOCAL_LOG=$(git log -1 --format="%h|%s|%cr|%an" 2>/dev/null || echo "")

                if [ -n "$REMOTE" ] && [ -n "$LOCAL" ] && [ "$LOCAL" != "$REMOTE" ]; then
                    REMOTE_LOG=$(git log -1 origin/$BRANCH --format="%h|%s|%cr|%an" 2>/dev/null || echo "")
                    echo "$LOCAL_LOG|OUTDATED|$REMOTE_LOG"
                else
                    echo "$LOCAL_LOG|UPTODATE|"
                fi
            `;
            const output = await this.sshService.executeCommand(server, checkCmd);
            const lines = output.trim().split('\n');
            const lastLine = lines[lines.length - 1].trim();
            const parts = lastLine.split('|');
            if (parts.length >= 4 && parts[0] !== '') {
                const isOutdated = parts[4] === 'OUTDATED';
                return {
                    success: true,
                    commit: {
                        hash: parts[0],
                        message: parts[1],
                        time: parts[2],
                        author: parts[3],
                        isOutdated,
                        latestHash: isOutdated ? (parts[5] || null) : null,
                        latestMessage: isOutdated ? (parts[6] || null) : null,
                        latestTime: isOutdated ? (parts[7] || null) : null,
                    }
                };
            }
            return { success: false, message: 'No se pudo obtener el commit o el folder no es un repo git' };
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    async deployLatestCommit(id, websiteId, userId) {
        const serverData = await this.assertServerOwnership(id, userId);
        const site = await this.assertWebsiteOwnership(id, websiteId);
        if (!this.deployService.stackOf(site).usesGit) {
            return { success: false, message: 'Este sitio no se despliega desde un repositorio Git.' };
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
        const safeName = site.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const envB64 = Buffer.from(`PORT=${site.port}\n${site.env_vars ? site.env_vars.replace(/\r/g, '') : ''}`).toString('base64');
        const deployCmd = `
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o BatchMode=yes"
export CI=true
export NPM_CONFIG_YES=true
export DEBIAN_FRONTEND=noninteractive

cd /var/www/${safeName} || { echo "❌ Directorio no existe: /var/www/${safeName}"; exit 1; }

echo "📥 Obteniendo último commit del remoto..."
git fetch --all --prune -q 2>&1 || { echo "⚠️ git fetch falló, continuando..."; }
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")
git reset --hard origin/$BRANCH 2>&1
echo "✅ Commit: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

echo "⚙️ Re-inyectando variables de entorno..."
node -e "const fs=require('fs');fs.writeFileSync('.env',Buffer.from('${envB64}','base64'));" 2>&1

echo "📦 Instalando dependencias..."
${site.install_command || 'npm install'} --no-audit --no-fund --prefer-offline --yes 2>&1 | tail -10
chmod -R +x node_modules/.bin 2>/dev/null || true

${site.build_command ? `echo "🏗️ Build..."\n${site.build_command} 2>&1 | tail -10` : ''}

echo "🚀 Reiniciando con PM2..."
pm2 delete ${safeName} >/dev/null 2>&1 || true

ENTRY_POINT=""
if   [ -f "dist/main.js" ];                      then ENTRY_POINT="dist/main.js"
elif [ -f "${site.entry_point || 'index.js'}" ];  then ENTRY_POINT="${site.entry_point || 'index.js'}"
elif [ -f "index.js" ];                           then ENTRY_POINT="index.js"
elif [ -f "server.js" ];                          then ENTRY_POINT="server.js"
elif [ -f "app.js" ];                             then ENTRY_POINT="app.js"
fi

if [ -n "$ENTRY_POINT" ]; then
    pm2 start "$ENTRY_POINT" --name "${safeName}" --cwd "/var/www/${safeName}" --max-memory-restart 200M 2>&1
else
    pm2 start npm --name "${safeName}" --cwd "/var/www/${safeName}" --max-memory-restart 200M -- run start 2>&1
fi

pm2 save --force >/dev/null 2>&1 || true
sleep 3

pm2 show ${safeName} 2>/dev/null | grep -q "online" \
    && echo "✅ App corriendo correctamente." \
    || { echo "⚠️ Logs de la app:"; pm2 logs ${safeName} --lines 10 --nostream 2>/dev/null || true; }

echo "---DEPLOY_DONE---"
`;
        try {
            await this.sshService.executeCommand(server, deployCmd);
            return { success: true, message: 'Sitio actualizado y desplegado al último commit' };
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    }
    async executeCommand(id, command, userId) {
        const serverData = await this.assertServerOwnership(id, userId);
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
    async deployDatabase(id, userId, body, res) {
        let serverData;
        try {
            serverData = await this.assertServerOwnership(id, userId);
        }
        catch {
            res.status(404).json({ success: false, message: 'Servidor no encontrado' });
            return;
        }
        const server = this.getServerFromData(serverData);
        await this.dbService.query(`
            CREATE TABLE IF NOT EXISTS database_instances(
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
            INSERT INTO database_instances(id, server_id, user_id, name, engine, port, db_name, db_user, db_password, admin_port, container_name, admin_container_name, status)
            VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'deploying')
        `, [dbId, id, userId, body.name, body.engine, body.port, body.dbName, body.dbUser, body.dbPassword, body.adminPort || '', containerName, adminContainerName]);
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

# Limpiar puertos si están en uso
if sudo ss -tulpn | grep -q ":${body.port} "; then
    echo "🧹 Limpiando puerto MySQL (${body.port})..."
    for id in \$(sudo docker ps -q); do
        if sudo docker port \$id | grep -q "${body.port}"; then
            sudo docker rm -f \$id 2>/dev/null || true
        fi
    done
    sudo ss -lptn 'sport = :'"${body.port}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | xargs -r sudo kill -9 2>/dev/null || true
fi
if sudo ss -tulpn | grep -q ":${body.adminPort || '8080'} "; then
    echo "🧹 Limpiando puerto phpMyAdmin (${body.adminPort || '8080'})..."
    for id in \$(sudo docker ps -q); do
        if sudo docker port \$id | grep -q "${body.adminPort || '8080'}"; then
            sudo docker rm -f \$id 2>/dev/null || true
        fi
    done
    sudo ss -lptn 'sport = :'"${body.adminPort || '8080'}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | xargs -r sudo kill -9 2>/dev/null || true
fi

# Crear red Docker para comunicación entre contenedores
sudo docker network create cloudcore_${safeName}_net 2>/dev/null || true

# Detener y eliminar contenedores previos si existen
sudo docker rm -f ${containerName} 2>/dev/null || true
sudo docker rm -f ${adminContainerName} 2>/dev/null || true

# Crear volumen persistente
sudo docker volume create ${containerName}_data 2>/dev/null || true

# Iniciar MySQL con autenticación compatible con Node.js
echo "📦 Iniciando contenedor MySQL..."
sudo docker run -d \\
    --name ${containerName} \\
    --network cloudcore_${safeName}_net \\
    --network-alias db \\
    -e MYSQL_ROOT_PASSWORD=${body.dbPassword} \\
    -e MYSQL_DATABASE=${body.dbName} \\
    -e MYSQL_USER=${body.dbUser} \\
    -e MYSQL_PASSWORD=${body.dbPassword} \\
    -p ${body.port}:3306 \\
    -v ${containerName}_data:/var/lib/mysql \\
    --restart unless-stopped \\
    mysql:8.0 --default-authentication-plugin=mysql_native_password

echo "⏳ Esperando a que MySQL inicie completamente..."
sleep 15

# Configurar usuario con permisos correctos y autenticación compatible
echo "🔧 Configurando permisos de usuario..."
sudo docker exec ${containerName} mysql -uroot -p${body.dbPassword} -e "
    ALTER USER '${body.dbUser}'@'%' IDENTIFIED WITH mysql_native_password BY '${body.dbPassword}';
    GRANT ALL PRIVILEGES ON ${body.dbName}.* TO '${body.dbUser}'@'%';
    GRANT ALL PRIVILEGES ON ${body.dbName}.* TO '${body.dbUser}'@'172.18.0.%' IDENTIFIED BY '${body.dbPassword}';
    FLUSH PRIVILEGES;
" 2>/dev/null || echo "Nota: Los permisos se configurarán cuando MySQL termine de iniciar."

# Iniciar phpMyAdmin
echo "🖥️ Iniciando phpMyAdmin..."
sudo docker run -d \\
    --name ${adminContainerName} \\
    --network cloudcore_${safeName}_net \\
    -e PMA_HOST=db \\
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

# Limpiar puerto si está en uso
if sudo ss -tulpn | grep -q ":${body.port} "; then
    echo "🧹 Limpiando puerto PostgreSQL (${body.port})..."
    for id in \$(sudo docker ps -q); do
        if sudo docker port \$id | grep -q "${body.port}"; then
            sudo docker rm -f \$id 2>/dev/null || true
        fi
    done
    sudo ss -lptn 'sport = :'"${body.port}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | xargs -r sudo kill -9 2>/dev/null || true
fi

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
            await this.sshService.executeCommand(server, deployCmd, (chunk) => {
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
                CREATE TABLE IF NOT EXISTS database_instances(
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
                JOIN servers s ON di.server_id = s.id:: text
                WHERE di.user_id = $1:: text
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
    async importDatabases(userId) {
        const serversRes = await this.dbService.query('SELECT * FROM servers WHERE user_id = $1', [userId]);
        if (serversRes.rows.length === 0) {
            return { success: true, imported: 0, databases: [], message: 'No tienes servidores registrados' };
        }
        await this.dbService.query(`
            CREATE TABLE IF NOT EXISTS database_instances(
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
        const imported = [];
        const errors = [];
        for (const serverData of serversRes.rows) {
            const server = this.getServerFromData(serverData);
            try {
                const discovered = await this.sshService.discoverDatabases(server);
                for (const db of discovered) {
                    const exists = await this.dbService.query('SELECT 1 FROM database_instances WHERE server_id = $1::text AND container_name = $2', [serverData.id, db.containerName]);
                    if (exists.rows.length > 0)
                        continue;
                    const dbId = crypto.randomUUID();
                    await this.dbService.query(`
                        INSERT INTO database_instances(id, server_id, user_id, name, engine, port, db_name, db_user, db_password, admin_port, container_name, admin_container_name, status)
                        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    `, [dbId, serverData.id, userId, db.name, db.engine, db.port, db.dbName, db.dbUser, db.dbPassword, db.adminPort || '', db.containerName, db.adminContainerName || '', db.status]);
                    imported.push({
                        id: dbId,
                        name: db.name,
                        engine: db.engine,
                        port: db.port,
                        serverName: serverData.name,
                        serverIp: serverData.ip,
                    });
                }
            }
            catch (error) {
                console.error(`Error escaneando bases de datos en ${serverData.ip}:`, error.message);
                errors.push(`${serverData.name} (${serverData.ip}): ${error.message}`);
            }
        }
        return {
            success: true,
            imported: imported.length,
            databases: imported,
            errors,
            message: imported.length > 0
                ? `Se registraron ${imported.length} base(s) de datos detectada(s)`
                : 'No se encontraron bases de datos montadas en tus servidores'
        };
    }
    async deleteDatabaseInstance(id, dbId, userId) {
        const serverData = await this.assertServerOwnership(id, userId);
        const dbInstance = await this.assertDatabaseOwnership(id, dbId);
        const server = this.getServerFromData(serverData);
        const safeName = dbInstance.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const containerName = dbInstance.container_name ? dbInstance.container_name.trim() : '';
        const adminContainerName = dbInstance.admin_container_name ? dbInstance.admin_container_name.trim() : '';
        let cleanCmd = '';
        if (containerName) {
            cleanCmd += `
                sudo docker stop ${containerName} 2>/dev/null || true
                sudo docker rm -f ${containerName} 2>/dev/null || true
                sleep 2
                sudo docker volume rm ${containerName}_data 2>/dev/null || true
                sudo rm -rf /var/lib/docker/volumes/${containerName}_data 2>/dev/null || true
            `;
        }
        if (dbInstance.engine === 'mysql' && adminContainerName) {
            cleanCmd += `
                sudo docker stop ${adminContainerName} 2>/dev/null || true
                sudo docker rm -f ${adminContainerName} 2>/dev/null || true
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
    async manageDatabaseContainer(id, dbId, action, userId) {
        const validActions = ['start', 'stop', 'restart'];
        if (!validActions.includes(action))
            return { success: false, message: 'Acción no válida' };
        const serverData = await this.assertServerOwnership(id, userId);
        const dbInstance = await this.assertDatabaseOwnership(id, dbId);
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
            console.error(`Error ${action} database container: `, error);
            return { success: false, message: error.message };
        }
    }
    async getNotifications(userId) {
        await this.dbService.query(`
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
        const result = await this.dbService.query(`SELECT id, user_id, type, title, message, read,
                    EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS timestamp
             FROM user_notifications
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`, [userId]);
        return { success: true, notifications: result.rows };
    }
    async markNotificationsRead(userId) {
        await this.dbService.query(`UPDATE user_notifications SET read = true WHERE user_id = $1`, [userId]);
        return { success: true };
    }
    async dismissNotification(id, userId) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id))
            return { success: true };
        await this.dbService.query(`DELETE FROM user_notifications WHERE id = $1 AND user_id = $2`, [id, userId]);
        return { success: true };
    }
};
exports.ServerController = ServerController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_server_dto_1.CreateServerDto]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id/provisioning'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "getProvisioning", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "deleteServer", null);
__decorate([
    (0, common_1.Post)(':id/refresh'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "refreshHealth", null);
__decorate([
    (0, common_1.Get)(':id/services'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "getServices", null);
__decorate([
    (0, common_1.Post)(':id/services/install/:serviceName'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('serviceName')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, typeof (_a = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "installService", null);
__decorate([
    (0, common_1.Post)(':id/services/uninstall/:serviceName'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('serviceName')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, typeof (_b = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "uninstallService", null);
__decorate([
    (0, common_1.Post)(':id/services/:serviceName/:action'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('serviceName')),
    __param(2, (0, common_1.Param)('action')),
    __param(3, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "manageService", null);
__decorate([
    (0, common_1.Post)(':id/update-system'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, typeof (_c = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "updateSystem", null);
__decorate([
    (0, common_1.Post)(':id/websites/:websiteId/update'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('websiteId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, typeof (_d = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "updateWebsite", null);
__decorate([
    (0, common_1.Get)('websites'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "getWebsites", null);
__decorate([
    (0, common_1.Post)(':id/import-websites'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "importWebsites", null);
__decorate([
    (0, common_1.Get)(':id/websites/:websiteId/env'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('websiteId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "getWebsiteEnv", null);
__decorate([
    (0, common_1.Post)(':id/websites/:websiteId/delete'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('websiteId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "deleteWebsite", null);
__decorate([
    (0, common_1.Get)(':id/websites/:websiteId/logs'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('websiteId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "getWebsiteLogs", null);
__decorate([
    (0, common_1.Get)(':id/websites/:websiteId/commit'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('websiteId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "getWebsiteCommit", null);
__decorate([
    (0, common_1.Post)(':id/websites/:websiteId/deploy-latest'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('websiteId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "deployLatestCommit", null);
__decorate([
    (0, common_1.Post)(':id/execute'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('command')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "executeCommand", null);
__decorate([
    (0, common_1.Post)(':id/deploy-database'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, typeof (_e = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "deployDatabase", null);
__decorate([
    (0, common_1.Get)('databases'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "listDatabases", null);
__decorate([
    (0, common_1.Post)('import-databases'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "importDatabases", null);
__decorate([
    (0, common_1.Post)(':id/databases/:dbId/delete'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('dbId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "deleteDatabaseInstance", null);
__decorate([
    (0, common_1.Post)(':id/databases/:dbId/:action'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('dbId')),
    __param(2, (0, common_1.Param)('action')),
    __param(3, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "manageDatabaseContainer", null);
__decorate([
    (0, common_1.Get)('notifications'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "getNotifications", null);
__decorate([
    (0, common_1.Post)('notifications/mark-read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "markNotificationsRead", null);
__decorate([
    (0, common_1.Post)('notifications/:id/dismiss'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ServerController.prototype, "dismissNotification", null);
exports.ServerController = ServerController = __decorate([
    (0, common_1.Controller)('servers'),
    __metadata("design:paramtypes", [ssh_service_1.SshService,
        database_service_1.DatabaseService,
        deploy_service_1.DeployService])
], ServerController);
//# sourceMappingURL=server.controller.js.map