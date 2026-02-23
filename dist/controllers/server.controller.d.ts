import { SshService } from '../services/ssh.service';
import { CreateServerDto } from '../dto/create-server.dto';
import { Server } from '../models/server.model';
export declare class ServerController {
    private readonly sshService;
    constructor(sshService: SshService);
    create(serverDto: CreateServerDto): Promise<Server>;
}
