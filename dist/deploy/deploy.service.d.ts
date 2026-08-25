import { SshService } from '../services/ssh.service';
import { DatabaseService } from '../database/database.service';
import { Server } from '../models/server.model';
import { DeployWebsiteDto } from './dto/deploy-website.dto';
import { DeployContext, DeployStack, StackLogCommands, WebsiteRow } from './stacks/stack.interface';
import { StackRegistry } from './stacks/stack.registry';
export declare const PORT_RANGE_START = 30000;
export declare const PORT_RANGE_END = 39999;
export declare function toSafeName(name: string): string;
export declare function parseStackConfig(raw: unknown): Record<string, any> | undefined;
export declare function validateForStack(stackId: string, dto: DeployWebsiteDto): string | null;
export declare class DeployService {
    private readonly ssh;
    private readonly db;
    private readonly registry;
    private readonly logger;
    constructor(ssh: SshService, db: DatabaseService, registry: StackRegistry);
    buildNginxFor(ctx: DeployContext, stackId?: string): string;
    stackOf(site: WebsiteRow): DeployStack;
    listStacks(): {
        id: string;
        label: string;
        usesGit: boolean;
    }[];
    contextFor(server: Server, site: WebsiteRow, body?: Partial<DeployWebsiteDto> & {
        userEmail?: string;
    }): DeployContext;
    buildUpdateScript(ctx: DeployContext, site: WebsiteRow): string;
    reconfigureFor(ctx: DeployContext, site: WebsiteRow): Record<string, any>;
    buildCleanupScript(ctx: DeployContext, site: WebsiteRow): string;
    logCommandsFor(ctx: DeployContext, site: WebsiteRow): StackLogCommands;
    private allocatePort;
    private findNameConflict;
    deploy(server: Server, userId: string, dto: DeployWebsiteDto, onData?: (chunk: string) => void): Promise<boolean>;
    ensureWebsitesColumns(): Promise<void>;
}
