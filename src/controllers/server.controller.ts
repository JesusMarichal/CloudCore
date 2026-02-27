import { Controller, Post, Body, Get, Query, Param, Delete, InternalServerErrorException, Res } from '@nestjs/common';
import { Response } from 'express';
import { SshService } from '../services/ssh.service';
import { CreateServerDto } from '../dto/create-server.dto';
import { Server } from '../models/server.model';
import { DatabaseService } from '../database/database.service';
import { encrypt } from '../common/utils/encryption.util';
import * as crypto from 'crypto';

@Controller('servers')
export class ServerController {
    constructor(
        private readonly sshService: SshService,
        private readonly dbService: DatabaseService
    ) { }

    @Get()
    async findAll(@Query('userId') userId: string): Promise<Server[]> {
        try {
            const result = await this.dbService.query(
                `SELECT id, user_id as "userId", name, ip, ssh_port as "sshPort", 
                ssh_user as "sshUser", auth_type as "authType", status, 
                provisioning_step as "provisioningStep",
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
    async create(@Body() serverDto: CreateServerDto): Promise<Server> {
        // Cifrar datos sensibles
        const encryptedPrivateKey = serverDto.privateKey ? encrypt(serverDto.privateKey) : undefined;
        const encryptedPassword = serverDto.password ? encrypt(serverDto.password) : undefined;

        const serverId = crypto.randomUUID();

        const newServer: Server = {
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

        // Guardar en la base de datos
        try {
            await this.dbService.query(
                `INSERT INTO servers (id, user_id, name, ip, ssh_port, ssh_user, auth_type, private_key, password, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
                    newServer.status
                ]
            );
        } catch (error) {
            console.error('Error guardando servidor en BD:', error);
            throw new InternalServerErrorException('No se pudo guardar el servidor');
        }

        // Lanzar aprovisionamiento en segundo plano
        this.sshService.provision(newServer, async (step) => {
            await this.dbService.query(
                'UPDATE servers SET provisioning_step = $1 WHERE id = $2',
                [step, serverId]
            );
        })
            .then(async () => {
                await this.dbService.query(
                    'UPDATE servers SET status = $1, provisioning_step = $2 WHERE id = $3',
                    ['online', 'Completado', serverId]
                );
            })
            .catch(async (err) => {
                console.error(`Error de aprovisionamiento para ${newServer.ip}:`, err);
                await this.dbService.query(
                    'UPDATE servers SET status = $1, provisioning_step = $2 WHERE id = $3',
                    ['offline', 'Error: ' + err.message, serverId]
                );
            });

        // Eliminar datos sensibles de la respuesta
        const { privateKey, password, ...safeServer } = newServer;
        return safeServer as Server;
    }

    @Delete(':id')
    async deleteServer(@Param('id') id: string): Promise<any> {
        try {
            // Obtener datos del servidor
            const serverResult = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
            const serverData = serverResult.rows[0];
            if (!serverData) return { success: false, message: 'Servidor no encontrado' };

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
    async refreshHealth(@Param('id') id: string): Promise<any> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];

        if (!serverData) return { success: false, message: 'Servidor no encontrado' };

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
    async getServices(@Param('id') id: string): Promise<any[]> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) return [];

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

    @Post(':id/services/:serviceName/:action')
    async manageService(
        @Param('id') id: string,
        @Param('serviceName') serviceName: string,
        @Param('action') action: string
    ): Promise<any> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) return { success: false, message: 'Servidor no encontrado' };

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

    @Post(':id/services/install/:serviceName')
    async installService(
        @Param('id') id: string,
        @Param('serviceName') serviceName: string,
        @Res() res: Response
    ): Promise<void> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) {
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
        @Res() res: Response
    ): Promise<void> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) {
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

    @Post(':id/update-system')
    async updateSystem(
        @Param('id') id: string,
        @Res() res: Response
    ): Promise<void> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) {
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

    @Post(':id/deploy-website')
    async deployWebsite(
        @Param('id') id: string,
        @Body() body: any
    ): Promise<any> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) return { success: false, message: 'Servidor no encontrado' };

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

        const success = await this.sshService.deployWebsite(server, body);

        if (success) {
            try {
                // MIGRACIÓN MANUAL: Asegurar que las columnas existen antes de insertar
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

                // Registrar el sitio en la base de datos para los webhooks
                await this.dbService.query(`
                    INSERT INTO websites (server_id, user_id, repo_url, name, install_command, build_command, start_command, port, domain, entry_point, env_vars)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                `, [id, body.userId || '', body.repo, body.name, body.installCommand, body.buildCommand, body.startCommand, body.port, body.domain, body.entryPoint, body.envVars]);
            } catch (error) {
                console.error("Error guardando el sitio en la base de datos:", error);
            }
        }

        return { success, message: success ? 'Sitio web desplegado' : 'Error al desplegar sitio' };
    }

    @Post(':id/websites/:websiteId/update')
    async updateWebsite(
        @Param('id') id: string, // serverId
        @Param('websiteId') websiteId: string,
        @Body() body: any
    ): Promise<any> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) return { success: false, message: 'Servidor no encontrado' };

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

        // 1. Actualizar en la base de datos
        await this.dbService.query(`
            UPDATE websites 
            SET install_command = $1, build_command = $2, start_command = $3, 
                port = $4, domain = $5, entry_point = $6, env_vars = $7
            WHERE id = $8
        `, [body.installCommand, body.buildCommand, body.startCommand, body.port, body.domain, body.entryPoint, body.envVars, websiteId]);

        // 2. Si hay cambios en .env o comandos, podemos redesplegar o solo actualizar .env
        // Por ahora, actualizaremos el .env en el servidor para que los cambios surtan efecto
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

    @Get('websites/:userId')
    async getWebsites(@Param('userId') userId: string): Promise<any[]> {
        try {
            // Asegurar que la columna env_vars existe
            await this.dbService.query(`
                DO $$ BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='env_vars') THEN
                        ALTER TABLE websites ADD COLUMN env_vars TEXT;
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

    @Get(':id/websites/:websiteId/env')
    async getWebsiteEnv(
        @Param('id') id: string,
        @Param('websiteId') websiteId: string
    ): Promise<any> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) return { success: false, message: 'Servidor no encontrado' };

        const siteResult = await this.dbService.query('SELECT * FROM websites WHERE id = $1', [websiteId]);
        const site = siteResult.rows[0];
        if (!site) return { success: false, message: 'Sitio no encontrado' };

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
        @Param('websiteId') websiteId: string
    ): Promise<any> {
        // 1. Obtener datos del sitio y servidor
        const siteResult = await this.dbService.query('SELECT * FROM websites WHERE id = $1', [websiteId]);
        const site = siteResult.rows[0];
        if (!site) return { success: false, message: 'Sitio no encontrado' };

        const serverResult = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = serverResult.rows[0];

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

        // 2. Limpiar en el servidor (PM2 y Nginx)
        const safeName = site.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const cleanCmd = `
            pm2 delete ${safeName} || true
            sudo rm -f /etc/nginx/sites-enabled/${safeName}
            sudo rm -f /etc/nginx/sites-available/${safeName}
            sudo nginx -t && sudo systemctl reload nginx
            sudo rm -rf /var/www/${safeName}
        `;

        await this.sshService.executeCommand(server, cleanCmd);

        // 3. Borrar de la BD
        await this.dbService.query('DELETE FROM websites WHERE id = $1', [websiteId]);

        return { success: true, message: 'Sitio eliminado correctamente' };
    }

    @Get(':id/websites/:websiteId/logs')
    async getWebsiteLogs(
        @Param('id') id: string,
        @Param('websiteId') websiteId: string
    ): Promise<any> {
        const siteResult = await this.dbService.query('SELECT name FROM websites WHERE id = $1', [websiteId]);
        const site = siteResult.rows[0];
        if (!site) return { success: false, message: 'Sitio no encontrado' };

        const serverResult = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = serverResult.rows[0];

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
        // Obtener las últimas 50 líneas de logs de PM2
        const logs = await this.sshService.executeCommand(server, `pm2 logs ${safeName} --lines 50 --nostream`);

        return { success: true, logs };
    }

    @Get(':id/websites/:websiteId/commit')
    async getWebsiteCommit(
        @Param('id') id: string,
        @Param('websiteId') websiteId: string
    ): Promise<any> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        const siteResult = await this.dbService.query('SELECT * FROM websites WHERE id = $1', [websiteId]);
        const site = siteResult.rows[0];

        if (!serverData || !site) return { success: false, message: 'No encontrado' };

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
            const output = await this.sshService.executeCommand(server, `cd ${projectPath} && git log -1 --format="%h|%s|%cr|%an"`);
            const parts = output.trim().split('|');
            if (parts.length >= 4) {
                return { success: true, commit: { hash: parts[0], message: parts[1], time: parts[2], author: parts[3] } };
            }
            return { success: false, message: 'No se pudo obtener el commit o el folder no es un repo git' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    @Post(':id/websites/:websiteId/deploy-latest')
    async deployLatestCommit(
        @Param('id') id: string,
        @Param('websiteId') websiteId: string
    ): Promise<any> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        const siteResult = await this.dbService.query('SELECT * FROM websites WHERE id = $1', [websiteId]);
        const site = siteResult.rows[0];
        if (!serverData || !site) return { success: false, message: 'No encontrado' };

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
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    @Post(':id/execute')
    async executeCommand(
        @Param('id') id: string,
        @Body('command') command: string
    ): Promise<any> {
        const serverResult = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = serverResult.rows[0];
        if (!serverData) return { success: false, message: 'Servidor no encontrado' };

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
        @Body() body: any,
        @Res() res: Response
    ): Promise<void> {
        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) {
            res.status(404).json({ success: false, message: 'Servidor no encontrado' });
            return;
        }

        const server = this.getServerFromData(serverData);

        // Ensure database_instances table exists
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

        // Save to database first
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
            // Deploy MySQL + phpMyAdmin using Docker
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
        } else {
            // Deploy PostgreSQL using Docker
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

    @Get('databases/:userId')
    async listDatabases(@Param('userId') userId: string): Promise<any[]> {
        try {
            // Ensure table exists
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
        } catch (error) {
            console.error('Error listing databases:', error);
            return [];
        }
    }

    @Post(':id/databases/:dbId/delete')
    async deleteDatabaseInstance(
        @Param('id') id: string,
        @Param('dbId') dbId: string
    ): Promise<any> {
        const serverResult = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = serverResult.rows[0];
        if (!serverData) return { success: false, message: 'Servidor no encontrado' };

        const dbResult = await this.dbService.query('SELECT * FROM database_instances WHERE id = $1', [dbId]);
        const dbInstance = dbResult.rows[0];
        if (!dbInstance) return { success: false, message: 'Base de datos no encontrada' };

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
        @Param('action') action: string
    ): Promise<any> {
        const validActions = ['start', 'stop', 'restart'];
        if (!validActions.includes(action)) return { success: false, message: 'Acción no válida' };

        const serverResult = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = serverResult.rows[0];
        if (!serverData) return { success: false, message: 'Servidor no encontrado' };

        const dbResult = await this.dbService.query('SELECT * FROM database_instances WHERE id = $1', [dbId]);
        const dbInstance = dbResult.rows[0];
        if (!dbInstance) return { success: false, message: 'Base de datos no encontrada' };

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
            console.error(`Error ${action} database container:`, error);
            return { success: false, message: error.message };
        }
    }
}
