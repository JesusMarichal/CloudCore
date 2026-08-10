import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { DatabaseService } from '../database/database.service';
import { Server } from '../models/server.model';
import { DeployService } from './deploy.service';
import { DeployWebsiteDto } from './dto/deploy-website.dto';

/**
 * Endpoint de despliegue de sitios. Mantiene la MISMA ruta
 * (POST /servers/:id/deploy-website) para no romper el frontend.
 * Solo valida la propiedad del servidor y delega en DeployService.
 */
@Controller('servers')
export class DeployController {
    constructor(
        private readonly deployService: DeployService,
        private readonly db: DatabaseService,
    ) { }

    @Post(':id/deploy-website')
    async deployWebsite(
        @Param('id') id: string,
        @CurrentUser('sub') userId: string,
        @Body() body: DeployWebsiteDto,
        @Res() res: Response,
    ): Promise<void> {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Ownership: lanza 404 tanto si no existe como si no pertenece al usuario
        const result = await this.db.query('SELECT * FROM servers WHERE id = $1 AND user_id = $2', [id, userId]);
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

        await this.deployService.deploy(server, userId, body, (chunk) => res.write(chunk));
        res.end();
    }
}
