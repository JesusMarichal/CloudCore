import { Controller, Get, Post, Body, Param, Logger, Req, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SshService } from '../services/ssh.service';
import { Octokit } from '@octokit/rest';

@Controller('github')
export class GithubController {
    private readonly logger = new Logger(GithubController.name);

    constructor(
        private readonly db: DatabaseService,
        private readonly sshService: SshService
    ) { }

    @Get('settings/:userId')
    async getSettings(@Param('userId') userId: string) {
        try {
            const result = await this.db.query('SELECT github_token FROM users WHERE id = $1', [userId]);
            if (!result.rows[0]) return { success: false, message: 'Usuario no encontrado' };

            return { success: true, token: result.rows[0].github_token };
        } catch (error) {
            this.logger.error('Error fetching github settings:', error);
            return { success: false, message: 'Error interno del servidor' };
        }
    }

    @Post('settings/:userId')
    async saveSettings(@Param('userId') userId: string, @Body() body: { token: string }) {
        try {
            await this.db.query('UPDATE users SET github_token = $1 WHERE id = $2', [body.token, userId]);
            return { success: true, message: 'Token guardado correctamente' };
        } catch (error) {
            this.logger.error('Error saving github settings:', error);
            return { success: false, message: 'Error al guardar configuración' };
        }
    }

    @Get('repos/:userId')
    async getRepos(@Param('userId') userId: string) {
        try {
            const result = await this.db.query('SELECT github_token FROM users WHERE id = $1', [userId]);
            const token = result.rows[0]?.github_token;

            if (!token) {
                return { success: false, message: 'No hay token de Github configurado.' };
            }

            const octokit = new Octokit({
                auth: token,
                request: {
                    timeout: 30000 // Aumentamos a 30 segundos para conexiones lentas
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
        } catch (error) {
            this.logger.error('Error fetching repos:', error);
            return { success: false, message: 'Error conectando con la API de Github. Revisa tu token.' };
        }
    }

    @Post('webhook')
    async handleWebhook(@Req() req: any, @Body() payload: any) {
        const event = req.headers['x-github-event'];

        // Solo reaccionamos si es un push
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

        // Buscamos si existe un sitio web (y su servidor) asociado a este repo. 
        // Como no tenemos tabla "websites", el usuario indicó que quiere que "con cada Push main" se actualice.
        // Haremos una búsqueda en servers si hay alguno que tenga este repo registrado o usaremos un mapeo provisto.
        // Por simplicidad en CloudCore (según conversaciones previas la "tabla de sitios" está embebida o se gestiona manualmente), 
        // debemos crear una tabla o lógica para mapear repos a servidores.
        // Dado el alcance actual, crearemos una tabla websites simple si no existe.
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

        try {
            // Buscamos sitios que usen este repositorio
            const sitesResult = await this.db.query('SELECT * FROM websites WHERE repo_url = $1', [repoUrl]);
            const sites = sitesResult.rows;

            if (sites.length === 0) {
                this.logger.log(`No hay sitios registrados vinculados al repo ${repoUrl}`);
                return { success: true, message: 'No hay sitios vinculados' };
            }

            // Realizamos el pull y reinicio para cada sitio
            for (const site of sites) {
                const serverResult = await this.db.query('SELECT * FROM servers WHERE id = $1', [site.server_id]);
                const serverData = serverResult.rows[0];

                if (!serverData) continue;

                // Construimos el Server model para SshService
                const server = {
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
            }

            return { success: true, message: 'Despliegues actualizados' };

        } catch (error) {
            this.logger.error('Error procesando webhook:', error);
            throw new BadRequestException('Error en webhook');
        }
    }
}
