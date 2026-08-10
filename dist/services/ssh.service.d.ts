import { Server } from '../models/server.model';
export declare class SshService {
    private readonly logger;
    executeCommand(server: Server, command: string, onData?: (chunk: string) => void, timeoutMs?: number): Promise<string>;
    provision(server: Server, onProgress?: (step: string) => Promise<void>): Promise<void>;
    discoverWebsites(server: Server): Promise<any[]>;
    discoverDatabases(server: Server): Promise<any[]>;
    getHealth(server: Server): Promise<Partial<Server>>;
    listServices(server: Server): Promise<any[]>;
    manageService(server: Server, serviceName: string, action: string): Promise<boolean>;
    installService(server: Server, serviceName: string, onData?: (chunk: string) => void): Promise<boolean>;
    uninstallService(server: Server, serviceName: string, onData?: (chunk: string) => void): Promise<boolean>;
    updateServer(server: Server, onData?: (chunk: string) => void): Promise<boolean>;
}
