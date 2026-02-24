import { Controller, Post, Body, Get, Query, Param, InternalServerErrorException } from '@nestjs/common';
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
}




