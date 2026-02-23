import { Server } from '../models/server.model';
export declare class SshService {
    executeCommand(server: Server, command: string): Promise<string>;
    provision(server: Server): Promise<void>;
}
