import { Controller, Post, Body, Get, Query, Param, Delete, InternalServerErrorException, Res } from '@nestjs/common';
import { Response } from 'express';
import { SshService } from '../services/ssh.service';
import { CreateServerDto } from '../dto/create-server.dto';
import { Server } from '../models/server.model';
import { DatabaseService } from '../database/database.service';
import { encrypt } from '../common/utils/encryption.util';
import * as crypto from 'crypto';
import * as dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);

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
        @Body() body: any,
        @Res() res: Response
    ): Promise<void> {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) {
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

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        let repoUrlWithToken = body.repo;
        let userEmail = '';
        if (body.userId) {
            const userRes = await this.dbService.query('SELECT github_token, email FROM users WHERE id = $1', [body.userId]);
            const userData = userRes.rows[0];
            if (userData?.github_token && body.repo.startsWith('https://github.com/')) {
                // Agregar el token HTTP basic auth a la URL de Github
                repoUrlWithToken = body.repo.replace('https://github.com/', `https://${userData.github_token}@github.com/`);
            }
            userEmail = userData?.email || '';
        }

        const deployBody = { ...body, repo: repoUrlWithToken, userEmail };

        const success = await this.sshService.deployWebsite(server, deployBody, (chunk) => {
            // Enmascarar el token en el stream de log para no enviarlo al panel web
            if (body.userId && repoUrlWithToken !== body.repo) {
                const tokenRegex = new RegExp(`https://[^@]+@github\\.com`, 'g');
                chunk = chunk.replace(tokenRegex, 'https://github.com');
            }
            res.write(chunk);
        });

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
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='use_letsencrypt') THEN
                            ALTER TABLE websites ADD COLUMN use_letsencrypt BOOLEAN DEFAULT FALSE;
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='setup_www_alias') THEN
                            ALTER TABLE websites ADD COLUMN setup_www_alias BOOLEAN DEFAULT FALSE;
                        END IF;
                    END $$;
                `);

                // Registrar el sitio en la base de datos para los webhooks
                await this.dbService.query(`
                    INSERT INTO websites (server_id, user_id, repo_url, name, install_command, build_command, start_command, port, domain, entry_point, env_vars, use_letsencrypt, setup_www_alias)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `, [id, body.userId || '', body.repo, body.name, body.installCommand, body.buildCommand, body.startCommand, body.port, body.domain, body.entryPoint, body.envVars, body.useLetsEncrypt || false, body.setupWwwAlias || false]);
            } catch (error) {
                console.error("Error guardando el sitio en la base de datos:", error);
            }
        }

        res.end();
    }

    @Post(':id/websites/:websiteId/update')
    async updateWebsite(
        @Param('id') id: string, // serverId
        @Param('websiteId') websiteId: string,
        @Body() body: any,
        @Res() res: Response
    ): Promise<void> {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const result = await this.dbService.query('SELECT * FROM servers WHERE id = $1', [id]);
        const serverData = result.rows[0];
        if (!serverData) {
            res.status(404).write('---ERROR---\nServidor no encontrado');
            res.end();
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

        // 1. Asegurar que las columnas existen migrando si es necesario
        await this.dbService.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='use_letsencrypt') THEN
                    ALTER TABLE websites ADD COLUMN use_letsencrypt BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='setup_www_alias') THEN
                    ALTER TABLE websites ADD COLUMN setup_www_alias BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
        `);

        // 2. Actualizar en la base de datos
        await this.dbService.query(`
            UPDATE websites 
            SET install_command = $1, build_command = $2, start_command = $3, 
                port = $4, domain = $5, entry_point = $6, env_vars = $7,
                use_letsencrypt = $8, setup_www_alias = $9
            WHERE id = $10
        `, [body.installCommand, body.buildCommand, body.startCommand, body.port, body.domain, body.entryPoint, body.envVars, body.useLetsEncrypt || false, body.setupWwwAlias || false, websiteId]);

        // Obtener el email del usuario para Let's Encrypt
        const userRes = await this.dbService.query('SELECT email FROM users WHERE id = $1', [body.userId]);
        const userEmail = userRes.rows[0]?.email || '';

        // 3. Variables para el script de Nginx/SSL
        const safeName = body.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const projectPath = `/var/www/${safeName}`;
        const finalDomain = body.domain && body.domain.trim() !== '' ? body.domain : '_';
        const hasDomain = finalDomain !== '_';
        const serverNames = (hasDomain && body.setupWwwAlias) ? `${finalDomain} www.${finalDomain}` : finalDomain;
        const certbotDomains = (hasDomain && body.setupWwwAlias) ? `-d ${finalDomain} -d www.${finalDomain}` : `-d ${finalDomain}`;
        const useSSL = body.useLetsEncrypt && hasDomain;

        const updateEnvCmd = `
            cd ${projectPath}
            node -e "const fs = require('fs'); fs.writeFileSync('.env', Buffer.from('${Buffer.from(`PORT=${body.port}\n${body.envVars ? body.envVars.replace(/\r/g, '') : ''}`).toString('base64')}', 'base64'));"
            echo "✅ .env actualizado."
            pm2 restart ${safeName} || true

            # Configuración de Nginx (Estilo Cleavr)
            if command -v nginx > /dev/null; then
                echo "⚙️ Reconfigurando Nginx Reverse Proxy para ${serverNames}..."
                echo 'server {
    listen 80;
    server_name ${serverNames};

    location / {
        proxy_pass http://localhost:${body.port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}' | sudo tee /etc/nginx/sites-available/${safeName} > /dev/null

                sudo ln -sf /etc/nginx/sites-available/${safeName} /etc/nginx/sites-enabled/
                
                if [ "${finalDomain}" = "_" ]; then
                    sudo rm -f /etc/nginx/sites-enabled/default
                fi

                sudo nginx -t && sudo systemctl reload nginx
                
                # 4. Gestionar SSL
                if [ "${useSSL ? 'true' : 'false'}" = "true" ]; then
                    if ! command -v certbot > /dev/null; then
                        echo "📦 Certbot no detectado, instalando..."
                        sudo apt update && sudo DEBIAN_FRONTEND=noninteractive apt install -y certbot python3-certbot-nginx
                    fi
                    echo "🔐 Asegurando certificado SSL para ${serverNames}..."
                    sudo certbot --nginx ${certbotDomains} --non-interactive --agree-tos --email ${userEmail || 'admin@' + (finalDomain !== '_' ? finalDomain : 'example.com')} --redirect || echo "⚠️ Error al configurar SSL."
                fi

                sudo nginx -t && sudo systemctl reload nginx
                echo "✅ Nginx reconfigurado exitosamente."
            fi
        `;

        await this.sshService.executeCommand(server, updateEnvCmd, (chunk) => {
            res.write(chunk);
        });

        res.write('\n✅ Proceso completado exitosamente.');
        res.end();
    }

    @Get('websites/:userId')
    async getWebsites(@Param('userId') userId: string): Promise<any[]> {
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
        const pm2LogName = safeName.replace(/_/g, '-');
        const pmDir = `/home/${server.sshUser}/.pm2/logs`;

        const outCmd = `tail -n 100 ${pmDir}/${safeName}-out.log 2>/dev/null || tail -n 100 ${pmDir}/${pm2LogName}-out.log 2>/dev/null || pm2 logs ${safeName} --out --lines 50 --nostream 2>/dev/null || echo "Sin logs de salida disponibles."`;
        const errCmd = `tail -n 100 ${pmDir}/${safeName}-error.log 2>/dev/null || tail -n 100 ${pmDir}/${pm2LogName}-error.log 2>/dev/null || pm2 logs ${safeName} --err --lines 50 --nostream 2>/dev/null || echo "Sin logs de errores disponibles."`;
        const nginxCmd = `sudo tail -n 100 /var/log/nginx/error.log 2>/dev/null || echo "Sin logs de nginx."`;

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
            const checkCmd = `
                cd ${projectPath}
                git fetch origin -q || true
                LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "")
                REMOTE=$(git ls-remote origin HEAD 2>/dev/null | awk '{print $1}')
                LOG=$(git log -1 --format="%h|%s|%cr|%an" 2>/dev/null || echo "")
                
                if [ -n "$REMOTE" ] && [ -n "$LOCAL" ] && [ "$LOCAL" != "$REMOTE" ]; then
                    SHORT_REMOTE=$(echo $REMOTE | cut -c1-7)
                    echo "$LOG|OUTDATED|$SHORT_REMOTE"
                else
                    echo "$LOG|UPTODATE|"
                fi
            `;
            const output = await this.sshService.executeCommand(server, checkCmd);
            const lines = output.trim().split('\n');
            const lastLine = lines[lines.length - 1].trim();
            const parts = lastLine.split('|');

            if (parts.length >= 4 && parts[0] !== '') {
                return {
                    success: true,
                    commit: {
                        hash: parts[0],
                        message: parts[1],
                        time: parts[2],
                        author: parts[3],
                        isOutdated: parts[4] === 'OUTDATED',
                        latestHash: parts[5] || null
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
cd /var/www/${safeName}
echo "📥 Obteniendo último commit..."
git reset --hard
git pull

echo "⚙️ Re-inyectando variables de entorno..."
node -e "const fs = require('fs'); fs.writeFileSync('.env', Buffer.from('${Buffer.from(`PORT=${site.port}\n${site.env_vars ? site.env_vars.replace(/\r/g, '') : ''}`).toString('base64')}', 'base64'));"

echo "📦 Instalando dependencias..."
${site.install_command || 'npm install'}

# Asegurar permisos de ejecución en binarios
chmod -R +x node_modules/.bin 2>/dev/null || true

${site.build_command ? `echo "🏗️ Ejecutando build: ${site.build_command}"\n${site.build_command}` : ''}

echo "🧹 Limpiando logs anteriores..."
pm2 flush ${safeName} >/dev/null 2>&1 || true
rm -f /home/$USER/.pm2/logs/${safeName}*.log 2>/dev/null || true
rm -f /home/$USER/.pm2/logs/${safeName.replace(/_/g, '-')}*.log 2>/dev/null || true
sudo truncate -s 0 /var/log/nginx/error.log 2>/dev/null || true
sudo truncate -s 0 /var/log/nginx/access.log 2>/dev/null || true

echo "🚀 Reiniciando aplicación..."
pm2 delete ${safeName} >/dev/null 2>&1 || true

# Auto-detectar el punto de entrada correcto
ENTRY_POINT=""
if [ -f "dist/main.js" ]; then
    ENTRY_POINT="dist/main.js"
elif [ -f "${site.entry_point || 'index.js'}" ]; then
    ENTRY_POINT="${site.entry_point || 'index.js'}"
elif [ -f "index.js" ]; then
    ENTRY_POINT="index.js"
elif [ -f "server.js" ]; then
    ENTRY_POINT="server.js"
fi

if [ -n "$ENTRY_POINT" ]; then
    pm2 start "$ENTRY_POINT" --name "${safeName}" --cwd "/var/www/${safeName}"
else
    pm2 start npm --name "${safeName}" --cwd "/var/www/${safeName}" -- run start
fi

pm2 save
sleep 5

if pm2 show ${safeName} | grep -q "online"; then
    echo "✅ App reiniciada correctamente."
else
    echo "⚠️ La app puede haber fallado. Logs:"
    pm2 logs ${safeName} --lines 10 --nostream 2>/dev/null || true
fi
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
            console.error(`Error ${action} database container: `, error);
            return { success: false, message: error.message };
        }
    }
}
