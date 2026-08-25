import { Controller, Post, Body, Get, Param, Delete, InternalServerErrorException, NotFoundException, Res } from '@nestjs/common';
import { Response } from 'express';
import { SshService, PROVISION_STEPS } from '../services/ssh.service';
import type { ProvisionEvent } from '../services/ssh.service';
import { CreateServerDto } from '../dto/create-server.dto';
import { Server } from '../models/server.model';
import { DatabaseService } from '../database/database.service';
import { encrypt } from '../common/utils/encryption.util';
import { CurrentUser } from '../common/auth/current-user.decorator';
import * as crypto from 'crypto';
import { DeployService, toSafeName } from '../deploy/deploy.service';
import { DeployContext } from '../deploy/stacks/stack.interface';
import * as dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);

// El aprovisionamiento que ve el usuario son los pasos SSH más la detección de
// sitios ya montados, que corre después y también tarda. El controlador es la
// autoridad sobre el total y el porcentaje; SshService solo reporta su parte.
const DISCOVER_STEP = { key: 'discover_websites', name: 'Detectando sitios existentes' };
const PROVISION_TOTAL = PROVISION_STEPS.length + 1;

@Controller('servers')
export class ServerController {
    constructor(
        private readonly sshService: SshService,
        private readonly dbService: DatabaseService,
        private readonly deployService: DeployService
    ) { }

    // ===== Ownership helpers =====
    // Lanzan NotFoundException tanto si el recurso no existe como si no pertenece
    // al usuario autenticado, para no revelar la existencia de recursos ajenos.

    private async assertServerOwnership(serverId: string, userId: string): Promise<any> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1 AND user_id = $2', [serverId, userId]);
        const serverData = result.rows[0];
        if (!serverData) throw new NotFoundException('Servidor no encontrado');
        return serverData;
    }

    private async assertWebsiteOwnership(serverId: string, websiteId: string): Promise<any> {
        // El serverId ya fue validado contra el usuario por assertServerOwnership,
        // así que basta con confirmar que el sitio pertenece a ese servidor.
        const result = await this.dbService.query('SELECT * FROM websites WHERE id = $1 AND server_id = $2', [websiteId, serverId]);
        const site = result.rows[0];
        if (!site) throw new NotFoundException('Sitio no encontrado');
        return site;
    }

    private async assertDatabaseOwnership(serverId: string, dbId: string): Promise<any> {
        const result = await this.dbService.query('SELECT * FROM database_instances WHERE id = $1 AND server_id = $2::text', [dbId, serverId]);
        const dbInstance = result.rows[0];
        if (!dbInstance) throw new NotFoundException('Base de datos no encontrada');
        return dbInstance;
    }

    @Get()
    async findAll(@CurrentUser('sub') userId: string): Promise<Server[]> {
        try {
            const result = await this.dbService.query(
                `SELECT id, user_id as "userId", name, ip, ssh_port as "sshPort",
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
                FROM servers WHERE user_id = $1`,
                [userId]
            );
            return result.rows;
        } catch (error) {
            console.error('Error listando servidores:', error);
            return [];
        }
    }

    @Post()
    async create(@CurrentUser('sub') userId: string, @Body() serverDto: CreateServerDto): Promise<Server> {
        // Cifrar datos sensibles
        const encryptedPrivateKey = serverDto.privateKey ? encrypt(serverDto.privateKey) : undefined;
        const encryptedPassword = serverDto.password ? encrypt(serverDto.password) : undefined;

        const serverId = crypto.randomUUID();

        const newServer: Server = {
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

        // Guardar en la base de datos
        try {
            await this.dbService.query(
                `INSERT INTO servers (id, user_id, name, ip, ssh_port, ssh_user, auth_type, private_key, password, status,
                                      provisioning_step, provisioning_step_key, provisioning_index, provisioning_total,
                                      provisioning_percent, provisioning_detail, provisioning_log, provisioning_started_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                         $11, $12, 0, $13, 0, NULL, '', NOW())`,
                [
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
                ]
            );
        } catch (error) {
            console.error('Error guardando servidor en BD:', error);
            throw new InternalServerErrorException('No se pudo guardar el servidor');
        }

        // Lanzar aprovisionamiento en segundo plano.
        // El progreso se persiste en la fila del servidor para que cualquier
        // pestaña abierta pueda seguirlo (paso actual, %, y las últimas líneas
        // reales de la salida SSH).
        const tracker = this.createProvisioningTracker(serverId);

        this.sshService.provision(newServer, (event) => tracker.handle(event))
            .then(async () => {
                // Detectar e importar sitios que ya estaban montados en el servidor
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
                    } else {
                        tracker.pushLine('No se encontraron sitios previos en el servidor.');
                    }
                } catch (err) {
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

        // Eliminar datos sensibles de la respuesta
        const { privateKey, password, ...safeServer } = newServer;
        return safeServer as Server;
    }

    /**
     * Persiste el progreso del aprovisionamiento de un servidor.
     *
     * Los eventos de log llegan línea a línea (pueden ser cientos por minuto),
     * así que se acumulan en memoria y se vuelcan a la base de datos como mucho
     * una vez cada LOG_FLUSH_MS. Los cambios de paso sí se escriben al momento.
     */
    private createProvisioningTracker(serverId: string) {
        const LOG_FLUSH_MS = 2000;
        const MAX_LOG_LINES = 200;

        const lines: string[] = [];
        let lastDetail = '';
        let lastFlush = 0;
        let flushTimer: NodeJS.Timeout | null = null;
        let finished = false;

        const writeLog = async () => {
            lastFlush = Date.now();
            try {
                await this.dbService.query(
                    'UPDATE servers SET provisioning_detail = $1, provisioning_log = $2 WHERE id = $3',
                    [lastDetail, lines.join('\n'), serverId]
                );
            } catch (e) {
                // El progreso es informativo: si falla el UPDATE no se aborta el aprovisionamiento.
            }
        };

        const scheduleFlush = () => {
            if (finished || flushTimer) return;
            const wait = Math.max(0, LOG_FLUSH_MS - (Date.now() - lastFlush));
            flushTimer = setTimeout(() => {
                flushTimer = null;
                void writeLog();
            }, wait);
            flushTimer.unref?.();
        };

        const pushLine = (line: string) => {
            lines.push(line);
            if (lines.length > MAX_LOG_LINES) lines.splice(0, lines.length - MAX_LOG_LINES);
            lastDetail = line;
            scheduleFlush();
        };

        const setStep = async (step: { name: string; key: string; index: number; total: number; percent: number }) => {
            if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
            lastFlush = Date.now();
            try {
                await this.dbService.query(
                    `UPDATE servers SET provisioning_step = $1, provisioning_step_key = $2,
                                       provisioning_index = $3, provisioning_total = $4,
                                       provisioning_percent = $5, provisioning_log = $6
                     WHERE id = $7`,
                    [step.name, step.key, step.index, step.total, step.percent, lines.join('\n'), serverId]
                );
            } catch (e) { /* informativo */ }
        };

        return {
            pushLine,
            setStep,
            handle: (event: ProvisionEvent) => {
                if (event.type === 'log') { pushLine(event.line); return; }
                if (event.type === 'error') { pushLine(`ERROR: ${event.message}`); return; }
                pushLine(`\u25B8 ${event.name}`);
                return setStep({
                    name: event.name,
                    key: event.key,
                    index: event.index,
                    total: PROVISION_TOTAL,
                    percent: Math.round(((event.index - 1) / PROVISION_TOTAL) * 100),
                });
            },
            finish: async (status: string, step: string, key: string, percent: number | null) => {
                finished = true;
                step = step.slice(0, 250);
                if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
                try {
                    await this.dbService.query(
                        `UPDATE servers SET status = $1, provisioning_step = $2, provisioning_step_key = $3,
                                           provisioning_percent = COALESCE($4, provisioning_percent),
                                           provisioning_detail = $5, provisioning_log = $6,
                                           provisioning_finished_at = NOW()
                         WHERE id = $7`,
                        [status, step, key, percent, lines[lines.length - 1] || '', lines.join('\n'), serverId]
                    );
                } catch (e) {
                    console.error('No se pudo guardar el estado final del aprovisionamiento:', e.message);
                }
            },
        };
    }

    /** Progreso detallado del aprovisionamiento, para el seguimiento en vivo. */
    @Get(':id/provisioning')
    async getProvisioning(@Param('id') id: string, @CurrentUser('sub') userId: string): Promise<any> {
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
            steps: [...PROVISION_STEPS, DISCOVER_STEP].map(st => ({ key: st.key, name: st.name })),
        };
    }

    @Delete(':id')
    async deleteServer(@Param('id') id: string, @CurrentUser('sub') userId: string): Promise<any> {
        const serverData = await this.assertServerOwnership(id, userId);
        try {
            const server = this.getServerFromData(serverData);

            // 1. Limpiar bases de datos Docker en el servidor (best-effort)
            try {
                const dbInstances = await this.dbService.query(
                    'SELECT * FROM database_instances WHERE server_id = $1::text',
                    [id]
                );
                for (const dbInst of dbInstances.rows) {
                    const safeName = dbInst.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
                    let cleanCmd = `sudo docker rm -f ${dbInst.container_name} 2>/dev/null || true; sudo docker volume rm ${dbInst.container_name}_data 2>/dev/null || true`;
                    if (dbInst.engine === 'mysql' && dbInst.admin_container_name) {
                        cleanCmd += `; sudo docker rm -f ${dbInst.admin_container_name} 2>/dev/null || true; sudo docker network rm cloudcore_${safeName}_net 2>/dev/null || true`;
                    }
                    try { await this.sshService.executeCommand(server, cleanCmd); } catch (e) { /* best-effort */ }
                }
            } catch (e) { /* tabla puede no existir */ }

            // 2. Limpiar sitios web en el servidor (best-effort)
            try {
                const websites = await this.dbService.query(
                    'SELECT * FROM websites WHERE server_id = $1',
                    [id]
                );
                for (const site of websites.rows) {
                    const safeName = site.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
                    const cleanCmd = `pm2 delete ${safeName} 2>/dev/null || true; sudo rm -f /etc/nginx/sites-enabled/${safeName} 2>/dev/null || true; sudo rm -f /etc/nginx/sites-available/${safeName} 2>/dev/null || true; sudo rm -rf /var/www/${safeName} 2>/dev/null || true`;
                    try { await this.sshService.executeCommand(server, cleanCmd); } catch (e) { /* best-effort */ }
                }
                try { await this.sshService.executeCommand(server, 'sudo nginx -t && sudo systemctl reload nginx'); } catch (e) { /* best-effort */ }
            } catch (e) { /* tabla puede no existir */ }

            // 3. Eliminar registros de la BD — ORDER MATTERS: hijos antes que padre
            try { await this.dbService.query('DELETE FROM database_instances WHERE server_id = $1::text', [id]); } catch (e) { /* tabla puede no existir */ }
            try { await this.dbService.query('DELETE FROM websites WHERE server_id = $1', [id]); } catch (e) { /* tabla puede no existir */ }
            await this.dbService.query('DELETE FROM servers WHERE id = $1', [id]);

            return { success: true, message: 'Servidor y todos sus recursos eliminados' };
        } catch (error) {
            console.error('Error eliminando servidor:', error);
            // Forzar eliminación en cascada si algo falló
            try { await this.dbService.query('DELETE FROM database_instances WHERE server_id = $1::text', [id]); } catch (e) { /* ignore */ }
            try { await this.dbService.query('DELETE FROM websites WHERE server_id = $1', [id]); } catch (e) { /* ignore */ }
            try { await this.dbService.query('DELETE FROM servers WHERE id = $1', [id]); } catch (e) { /* ignore */ }
            return { success: true, message: 'Servidor eliminado (algunos recursos remotos no pudieron limpiarse)' };
        }
    }

    @Post(':id/refresh')
    async refreshHealth(@Param('id') id: string, @CurrentUser('sub') userId: string): Promise<any> {
        const serverData = await this.assertServerOwnership(id, userId);

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
            lastHealthCheck: serverData.last_health_check
        };

        const health = await this.sshService.getHealth(server);

        await this.dbService.query(
            `UPDATE servers SET
                cpu_usage = $1, ram_usage = $2, disk_usage = $3, temp = $4,
                status = $5, last_health_check = NOW()
            WHERE id = $6`,
            [health.cpuUsage, health.ramUsage, health.diskUsage, health.temp, health.status, id]
        );

        return { success: true, health };
    }

    @Get(':id/services')
    async getServices(@Param('id') id: string, @CurrentUser('sub') userId: string): Promise<any[]> {
        const serverData = await this.assertServerOwnership(id, userId);

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };

        return this.sshService.listServices(server);
    }



    @Post(':id/services/install/:serviceName')
    async installService(
        @Param('id') id: string,
        @Param('serviceName') serviceName: string,
        @CurrentUser('sub') userId: string,
        @Res() res: Response
    ): Promise<void> {
        let serverData: any;
        try {
            serverData = await this.assertServerOwnership(id, userId);
        } catch {
            res.status(404).json({ success: false, message: 'Servidor no encontrado' });
            return;
        }

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const success = await this.sshService.installService(server, serviceName, (chunk) => {
            res.write(chunk);
        });

        if (success) {
            res.write('\n\n---DONE---\n');
        } else {
            res.write('\n\n---ERROR---\n');
        }
        res.end();
    }

    @Post(':id/services/uninstall/:serviceName')
    async uninstallService(
        @Param('id') id: string,
        @Param('serviceName') serviceName: string,
        @CurrentUser('sub') userId: string,
        @Res() res: Response
    ): Promise<void> {
        let serverData: any;
        try {
            serverData = await this.assertServerOwnership(id, userId);
        } catch {
            res.status(404).json({ success: false, message: 'Servidor no encontrado' });
            return;
        }

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const success = await this.sshService.uninstallService(server, serviceName, (chunk) => {
            res.write(chunk);
        });

        if (success) {
            res.write('\n\n---DONE---\n');
        } else {
            res.write('\n\n---ERROR---\n');
        }
        res.end();
    }

    @Post(':id/services/:serviceName/:action')
    async manageService(
        @Param('id') id: string,
        @Param('serviceName') serviceName: string,
        @Param('action') action: string,
        @CurrentUser('sub') userId: string
    ): Promise<any> {
        const serverData = await this.assertServerOwnership(id, userId);

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };

        const success = await this.sshService.manageService(server, serviceName, action);
        return { success };
    }

    @Post(':id/update-system')
    async updateSystem(
        @Param('id') id: string,
        @CurrentUser('sub') userId: string,
        @Res() res: Response
    ): Promise<void> {
        let serverData: any;
        try {
            serverData = await this.assertServerOwnership(id, userId);
        } catch {
            res.status(404).json({ success: false, message: 'Servidor no encontrado' });
            return;
        }

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const success = await this.sshService.updateServer(server, (chunk) => {
            res.write(chunk);
        });

        if (success) {
            res.write('\n\n---DONE---\n');
        } else {
            res.write('\n\n---ERROR---\n');
        }
        res.end();
    }


    @Post(':id/websites/:websiteId/update')
    async updateWebsite(
        @Param('id') id: string, // serverId
        @Param('websiteId') websiteId: string,
        @CurrentUser('sub') userId: string,
        @Body() body: any,
        @Res() res: Response
    ): Promise<void> {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        let serverData: any;
        let site: any;
        try {
            serverData = await this.assertServerOwnership(id, userId);
            site = await this.assertWebsiteOwnership(id, websiteId);
        } catch {
            res.status(404).write('---ERROR---\nServidor no encontrado');
            res.end();
            return;
        }

        // 1. Verificar DNS si se usa Let's Encrypt
        if (body.useLetsEncrypt && body.domain && body.domain !== '_') {
            res.write(`🔍 Verificando propagación DNS para ${body.domain}...\n`);
            try {
                const addresses = await resolve4(body.domain);
                const serverIp = serverData.ip;
                if (!addresses.includes(serverIp)) {
                    res.write(`⚠️ ADVERTENCIA: El dominio ${body.domain} apunta a ${addresses.join(', ')} pero el servidor es ${serverIp}.\n`);
                    res.write(`❌ La generación de SSL podría fallar. Asegúrate de que el registro A en Spaceship sea correcto.\n\n`);
                } else {
                    res.write(`✅ DNS verificado correctamente.\n\n`);
                }
            } catch (error) {
                res.write(`⚠️ No se pudo resolver el dominio ${body.domain}. Es posible que los DNS no hayan propagado aún.\n`);
                res.write(`❌ Procediendo con precaución, pero SSL podría fallar.\n\n`);
            }
        }

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };

        // 1. Asegurar que las columnas existen migrando si es necesario
        await this.deployService.ensureWebsitesColumns();

        // Obtener el email del usuario para Let's Encrypt
        const userRes = await this.dbService.query('SELECT email FROM users WHERE id = $1', [userId]);
        const userEmail = userRes.rows[0]?.email || '';

        // 2. Script de actualización: lo específico del stack (PM2 y .env en Node,
        //    URL del sitio en WordPress) más la configuración de Nginx/SSL, que es
        //    común. El generador es el mismo que usa el despliegue inicial, así
        //    que no pueden divergir.
        const ctx = this.deployService.contextFor(server, site, { ...body, userEmail });
        const updateCmd = this.deployService.buildUpdateScript(ctx, site);

        // 3. Guardar los cambios, incluida la config derivada del stack: cambiar
        //    el dominio o activar SSL mueve la URL del sitio y la de /wp-admin.
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

    @Get('websites')
    async getWebsites(@CurrentUser('sub') userId: string): Promise<any[]> {
        try {
            // Asegurar que las columnas necesarias existen
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

            const result = await this.dbService.query(
                `SELECT w.*, s.name as "serverName", s.ip as "serverIp"
                 FROM websites w
                 JOIN servers s ON w.server_id = s.id
                 WHERE s.user_id = $1`,
                [userId]
            );
            return result.rows;
        } catch (error) {
            console.error('Error listando sitios web:', error);
            return [];
        }
    }

    /**
     * Escanea el servidor por SSH y registra en la BD los sitios que ya están
     * montados (/var/www + Nginx + .env) y que aún no existen en la tabla websites.
     */
    private async importExistingWebsites(server: Server, serverId: string, userId: string): Promise<any[]> {
        const discovered = await this.sshService.discoverWebsites(server);
        if (discovered.length === 0) return [];

        // Asegurar que las columnas necesarias existen (misma migración que deploy-website)
        await this.deployService.ensureWebsitesColumns();

        const imported: any[] = [];
        for (const site of discovered) {
            const exists = await this.dbService.query(
                'SELECT 1 FROM websites WHERE server_id = $1 AND name = $2',
                [serverId, site.name]
            );
            if (exists.rows.length > 0) continue;

            // Un WordPress detectado en el servidor ya tiene su base de datos y su
            // carpeta: se registran tal cual para que editarlo o verlo desde el
            // panel use los mismos datos que usa el sitio en marcha.
            const safeName = toSafeName(site.name);
            const stackConfig = site.stack === 'wordpress'
                ? {
                    mode: 'migrate',
                    directory: site.wpDirectory || '',
                    installPath: site.wpDirectory ? `/var/www/${safeName}/${site.wpDirectory}` : `/var/www/${safeName}`,
                    docroot: `/var/www/${safeName}`,
                    host: site.domain || '',
                    externalDb: true, // no la creó el panel: no debe borrarla al eliminar el sitio
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
                // Un WordPress detectado no tiene puerto interno: la columna es INT
                // y '' la haría fallar, así que se guarda NULL.
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

    @Post(':id/import-websites')
    async importWebsites(@Param('id') id: string, @CurrentUser('sub') userId: string): Promise<any> {
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
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    @Get(':id/websites/:websiteId/env')
    async getWebsiteEnv(
        @Param('id') id: string,
        @Param('websiteId') websiteId: string,
        @CurrentUser('sub') userId: string
    ): Promise<any> {
        const serverData = await this.assertServerOwnership(id, userId);
        const site = await this.assertWebsiteOwnership(id, websiteId);

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };

        const safeName = site.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const projectPath = `/var/www/${safeName}`;

        try {
            // Intentar leer el archivo .env real del servidor
            const execResult = await this.sshService.executeCommand(server, `[ -f ${projectPath}/.env ] && cat ${projectPath}/.env || echo ""`);
            return { success: true, env: execResult };
        } catch (error) {
            return { success: false, message: 'No se pudo leer el archivo .env remoto' };
        }
    }

    @Post(':id/websites/:websiteId/delete')
    async deleteWebsite(
        @Param('id') id: string,
        @Param('websiteId') websiteId: string,
        @CurrentUser('sub') userId: string
    ): Promise<any> {
        const serverData = await this.assertServerOwnership(id, userId);
        const site = await this.assertWebsiteOwnership(id, websiteId);

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };

        // 2. Limpiar en el servidor: lo que creó el stack (proceso PM2 y código en
        //    Node; archivos y base de datos en WordPress) más el vhost de Nginx.
        const ctx = this.deployService.contextFor(server, site);
        const cleanCmd = this.deployService.buildCleanupScript(ctx, site);

        await this.sshService.executeCommand(server, cleanCmd);

        // 3. Borrar de la BD
        await this.dbService.query('DELETE FROM websites WHERE id = $1', [websiteId]);

        return { success: true, message: 'Sitio eliminado correctamente' };
    }

    @Get(':id/websites/:websiteId/logs')
    async getWebsiteLogs(
        @Param('id') id: string,
        @Param('websiteId') websiteId: string,
        @CurrentUser('sub') userId: string
    ): Promise<any> {
        const serverData = await this.assertServerOwnership(id, userId);
        const site = await this.assertWebsiteOwnership(id, websiteId);

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };

        // Cada stack sabe dónde están sus logs: PM2 en Node, Nginx/PHP-FPM y el
        // debug.log de WordPress en los sitios PHP.
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

    @Get(':id/websites/:websiteId/commit')
    async getWebsiteCommit(
        @Param('id') id: string,
        @Param('websiteId') websiteId: string,
        @CurrentUser('sub') userId: string
    ): Promise<any> {
        const serverData = await this.assertServerOwnership(id, userId);
        const site = await this.assertWebsiteOwnership(id, websiteId);

        // WordPress y cualquier stack que no se despliegue desde git no tienen
        // commits que seguir: se responde explícitamente para que el panel deje
        // de consultar en lugar de quedarse "Verificando…" para siempre.
        if (!this.deployService.stackOf(site).usesGit) {
            return { success: false, tracksCommits: false, message: 'Este sitio no se despliega desde un repositorio Git.' };
        }

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
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
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    @Post(':id/websites/:websiteId/deploy-latest')
    async deployLatestCommit(
        @Param('id') id: string,
        @Param('websiteId') websiteId: string,
        @CurrentUser('sub') userId: string
    ): Promise<any> {
        const serverData = await this.assertServerOwnership(id, userId);
        const site = await this.assertWebsiteOwnership(id, websiteId);

        if (!this.deployService.stackOf(site).usesGit) {
            return { success: false, message: 'Este sitio no se despliega desde un repositorio Git.' };
        }

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
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
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    @Post(':id/execute')
    async executeCommand(
        @Param('id') id: string,
        @Body('command') command: string,
        @CurrentUser('sub') userId: string
    ): Promise<any> {
        const serverData = await this.assertServerOwnership(id, userId);

        const server: Server = {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };

        try {
            const output = await this.sshService.executeCommand(server, command);
            return { success: true, output };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // ===== Database Management Endpoints =====

    private getServerFromData(serverData: any): Server {
        return {
            id: serverData.id,
            name: serverData.name,
            ip: serverData.ip,
            sshPort: serverData.ssh_port,
            sshUser: serverData.ssh_user,
            authType: serverData.auth_type,
            privateKey: serverData.private_key,
            password: serverData.password,
            status: serverData.status as any,
            lastHealthCheck: serverData.last_health_check || new Date(),
        };
    }

    @Post(':id/deploy-database')
    async deployDatabase(
        @Param('id') id: string,
        @CurrentUser('sub') userId: string,
        @Body() body: any,
        @Res() res: Response
    ): Promise<void> {
        let serverData: any;
        try {
            serverData = await this.assertServerOwnership(id, userId);
        } catch {
            res.status(404).json({ success: false, message: 'Servidor no encontrado' });
            return;
        }

        const server = this.getServerFromData(serverData);

        // Ensure database_instances table exists
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

        // Save to database first
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
            // Deploy MySQL + phpMyAdmin using Docker
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
        } else {
            // Deploy PostgreSQL using Docker
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

            // Update status
            await this.dbService.query(
                'UPDATE database_instances SET status = $1 WHERE id = $2',
                ['running', dbId]
            );

            res.write('\n\n---DONE---\n');
        } catch (error) {
            console.error('Error deploying database:', error);
            await this.dbService.query(
                'UPDATE database_instances SET status = $1 WHERE id = $2',
                ['stopped', dbId]
            );
            res.write('\n\n---ERROR---\n');
        }
        res.end();
    }

    @Get('databases')
    async listDatabases(@CurrentUser('sub') userId: string): Promise<any[]> {
        try {
            // Ensure table exists
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
        } catch (error) {
            console.error('Error listing databases:', error);
            return [];
        }
    }

    /**
     * Escanea todos los servidores del usuario buscando bases de datos ya montadas
     * (contenedores Docker MySQL/PostgreSQL) y registra las que no estén en la BD.
     */
    @Post('import-databases')
    async importDatabases(@CurrentUser('sub') userId: string): Promise<any> {
        const serversRes = await this.dbService.query('SELECT * FROM servers WHERE user_id = $1', [userId]);
        if (serversRes.rows.length === 0) {
            return { success: true, imported: 0, databases: [], message: 'No tienes servidores registrados' };
        }

        // Asegurar que la tabla existe
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

        const imported: any[] = [];
        const errors: string[] = [];

        for (const serverData of serversRes.rows) {
            const server = this.getServerFromData(serverData);
            try {
                const discovered = await this.sshService.discoverDatabases(server);
                for (const db of discovered) {
                    const exists = await this.dbService.query(
                        'SELECT 1 FROM database_instances WHERE server_id = $1::text AND container_name = $2',
                        [serverData.id, db.containerName]
                    );
                    if (exists.rows.length > 0) continue;

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
            } catch (error) {
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

    @Post(':id/databases/:dbId/delete')
    async deleteDatabaseInstance(
        @Param('id') id: string,
        @Param('dbId') dbId: string,
        @CurrentUser('sub') userId: string
    ): Promise<any> {
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

        // Intentar limpiar contenedores Docker (best-effort, no bloquea la eliminación)
        try {
            await this.sshService.executeCommand(server, cleanCmd);
        } catch (error) {
            console.warn('No se pudo limpiar contenedores Docker (servidor inaccesible), eliminando solo el registro:', error.message);
        }

        // Siempre eliminar el registro de la BD, incluso si SSH falló
        await this.dbService.query('DELETE FROM database_instances WHERE id = $1', [dbId]);
        return { success: true, message: 'Base de datos eliminada correctamente' };
    }

    @Post(':id/databases/:dbId/:action')
    async manageDatabaseContainer(
        @Param('id') id: string,
        @Param('dbId') dbId: string,
        @Param('action') action: string,
        @CurrentUser('sub') userId: string
    ): Promise<any> {
        const validActions = ['start', 'stop', 'restart'];
        if (!validActions.includes(action)) return { success: false, message: 'Acción no válida' };

        const serverData = await this.assertServerOwnership(id, userId);
        const dbInstance = await this.assertDatabaseOwnership(id, dbId);

        const server = this.getServerFromData(serverData);

        let cmd = `sudo docker ${action} ${dbInstance.container_name}`;
        // Also manage phpMyAdmin container for MySQL
        if (dbInstance.engine === 'mysql' && dbInstance.admin_container_name) {
            cmd += ` && sudo docker ${action} ${dbInstance.admin_container_name}`;
        }

        try {
            await this.sshService.executeCommand(server, cmd);
            const newStatus = action === 'stop' ? 'stopped' : 'running';
            await this.dbService.query(
                'UPDATE database_instances SET status = $1 WHERE id = $2',
                [newStatus, dbId]
            );
            return { success: true };
        } catch (error) {
            console.error(`Error ${action} database container: `, error);
            return { success: false, message: error.message };
        }
    }

    // ===== Notification Endpoints =====

    @Get('notifications')
    async getNotifications(@CurrentUser('sub') userId: string) {
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
        const result = await this.dbService.query(
            `SELECT id, user_id, type, title, message, read,
                    EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS timestamp
             FROM user_notifications
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [userId]
        );
        return { success: true, notifications: result.rows };
    }

    @Post('notifications/mark-read')
    async markNotificationsRead(@CurrentUser('sub') userId: string) {
        await this.dbService.query(
            `UPDATE user_notifications SET read = true WHERE user_id = $1`,
            [userId]
        );
        return { success: true };
    }

    @Post('notifications/:id/dismiss')
    async dismissNotification(@Param('id') id: string, @CurrentUser('sub') userId: string) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) return { success: true };
        await this.dbService.query(
            `DELETE FROM user_notifications WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        return { success: true };
    }
}
