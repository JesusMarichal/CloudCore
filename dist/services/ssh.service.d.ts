import { Server } from '../models/server.model';
export declare class SshService {
    private readonly logger;
    executeCommand(server: Server, command: string): Promise<string>;
    provision(server: Server, onProgress?: (step: string) => Promise<void>): Promise<void>;
    getHealth(server: Server): Promise<Partial<Server>>;
}
