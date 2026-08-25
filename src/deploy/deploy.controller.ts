import { BadRequestException, Body, Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { DatabaseService } from '../database/database.service';
import { Server } from '../models/server.model';
import { SshService } from '../services/ssh.service';
import { DeployService } from './deploy.service';
import { DeployWebsiteDto } from './dto/deploy-website.dto';
import { WP_UPLOAD_PREFIX } from './stacks/wordpress.stack';

/** Extensiones admitidas al migrar un WordPress existente. */
const WP_UPLOAD_EXTENSIONS = ['.zip', '.tar.gz', '.tgz', '.tar', '.sql', '.sql.gz', '.gz'];

/** Tope de subida por archivo (una copia de WordPress con medios pesa). */
const WP_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

/**
 * Endpoint de despliegue de sitios. Mantiene la MISMA ruta
 * (POST /servers/:id/deploy-website) para no romper el frontend.
 * Solo valida la propiedad del servidor y delega en DeployService.
 */
@Controller('servers')
export class DeployController {
    constructor(
        private readonly deployService: DeployService,
        private readonly ssh: SshService,
        private readonly db: DatabaseService,
    ) { }

    /** Catálogo de stacks que puede elegir el usuario al desplegar. */
    @Get('deploy/stacks')
    listStacks(): { stacks: { id: string; label: string; usesGit: boolean }[] } {
        return { stacks: this.deployService.listStacks() };
    }

    @Post(':id/deploy-website')
    async deployWebsite(
        @Param('id') id: string,
        @CurrentUser('sub') userId: string,
        @Body() body: DeployWebsiteDto,
        @Res() res: Response,
    ): Promise<void> {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const server = await this.ownedServer(id, userId);
        if (!server) {
            res.status(404).write('---ERROR---\nServidor no encontrado');
            res.end();
            return;
        }

        await this.deployService.deploy(server, userId, body, (chunk) => res.write(chunk));
        res.end();
    }

    /**
     * Recibe el .zip de los archivos o el .sql de la base de datos de un
     * WordPress que se va a migrar, y lo deja en /tmp del servidor destino.
     *
     * Sustituye los pasos manuales del cPanel ("Cargar" en el Administrador de
     * archivos e "Importar" en phpMyAdmin): el despliegue posterior recibe la
     * ruta devuelta aquí en `wpArchiveUrl` / `wpDbDumpUrl` y se encarga del
     * resto. El archivo temporal lo borra el propio script de despliegue.
     */
    @Post(':id/wordpress/upload')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: WP_UPLOAD_MAX_BYTES } }))
    async uploadWordpressAsset(
        @Param('id') id: string,
        @CurrentUser('sub') userId: string,
        @UploadedFile() file: any,
    ): Promise<any> {
        const server = await this.ownedServer(id, userId);
        if (!server) throw new BadRequestException('Servidor no encontrado');
        if (!file?.buffer?.length) throw new BadRequestException('No se recibió ningún archivo.');

        const originalName = String(file.originalname || 'archivo');
        const lower = originalName.toLowerCase();
        if (!WP_UPLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
            throw new BadRequestException(
                `Formato no admitido. Sube un ${WP_UPLOAD_EXTENSIONS.join(', ')}.`,
            );
        }

        // El nombre remoto conserva la extensión (el script elige el
        // descompresor por ella) pero nunca el nombre original del cliente.
        const ext = WP_UPLOAD_EXTENSIONS
            .filter((e) => lower.endsWith(e))
            .sort((a, b) => b.length - a.length)[0];
        const remotePath = `${WP_UPLOAD_PREFIX}${crypto.randomUUID()}${ext}`;

        const tmpPath = path.join(os.tmpdir(), `cloudcore-wp-${crypto.randomUUID()}${ext}`);
        await fs.promises.writeFile(tmpPath, file.buffer);
        try {
            await this.ssh.uploadFile(server, tmpPath, remotePath);
        } catch (error: any) {
            throw new BadRequestException(`No se pudo subir el archivo al servidor: ${error.message}`);
        } finally {
            await fs.promises.unlink(tmpPath).catch(() => { });
        }

        return {
            success: true,
            path: remotePath,
            name: originalName,
            size: file.buffer.length,
        };
    }

    /** Servidor del usuario, o null si no existe o no le pertenece. */
    private async ownedServer(serverId: string, userId: string): Promise<Server | null> {
        const result = await this.db.query(
            'SELECT * FROM servers WHERE id = $1 AND user_id = $2',
            [serverId, userId],
        );
        const serverData = result.rows[0];
        if (!serverData) return null;

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
}
