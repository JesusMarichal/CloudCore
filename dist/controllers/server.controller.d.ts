import { SshService } from '../services/ssh.service';
import { CreateServerDto } from '../dto/create-server.dto';
import { Server } from '../models/server.model';
import { DatabaseService } from '../database/database.service';
export declare class ServerController {
    private readonly sshService;
    private readonly dbService;
    constructor(sshService: SshService, dbService: DatabaseService);
    findAll(userId: string): Promise<Server[]>;
    create(serverDto: CreateServerDto): Promise<Server>;
    refreshHealth(id: string): Promise<any>;
}
