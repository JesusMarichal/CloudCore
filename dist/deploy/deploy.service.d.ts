import { SshService } from '../services/ssh.service';
import { DatabaseService } from '../database/database.service';
import { Server } from '../models/server.model';
import { DeployWebsiteDto } from './dto/deploy-website.dto';
import { StackRegistry } from './stacks/stack.registry';
export declare class DeployService {
    private readonly ssh;
    private readonly db;
    private readonly registry;
    private readonly logger;
    constructor(ssh: SshService, db: DatabaseService, registry: StackRegistry);
    deploy(server: Server, userId: string, dto: DeployWebsiteDto, onData?: (chunk: string) => void): Promise<boolean>;
    private ensureWebsitesColumns;
}
