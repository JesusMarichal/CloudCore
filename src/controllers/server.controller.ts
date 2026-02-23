import { Controller, Post, Body } from '@nestjs/common';
import { SshService } from '../services/ssh.service';
import { CreateServerDto } from '../dto/create-server.dto';
import { Server } from '../models/server.model';

@Controller('servers')
export class ServerController {
    constructor(private readonly sshService: SshService) { }

    @Post()
    async create(@Body() serverDto: CreateServerDto): Promise<Server> {
        const newServer: Server = {
            id: Math.random().toString(36).substr(2, 9),
            name: serverDto.name,
            ip: serverDto.ip,
            status: 'provisioning',
            lastHealthCheck: new Date(),
        };

        // Lanzar aprovisionamiento
        this.sshService.provision(newServer)
            .then(() => newServer.status = 'online')
            .catch(() => newServer.status = 'offline');

        return newServer;
    }
}
