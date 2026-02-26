import { Controller, Post, Body, Get, Query, Param, InternalServerErrorException, Res } from '@nestjs/common';
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
}
