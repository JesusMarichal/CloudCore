import { Server } from '../models/server.model';
export interface ProvisionStep {
    key: string;
    name: string;
    cmd: string;
}
export type ProvisionEvent = {
    type: 'step';
    index: number;
    total: number;
    key: string;
    name: string;
    percent: number;
} | {
    type: 'log';
    index: number;
    key: string;
    line: string;
} | {
    type: 'error';
    message: string;
};
export type ProvisionEventHandler = (event: ProvisionEvent) => void | Promise<void>;
export declare const PROVISION_STEPS: ProvisionStep[];
export declare function splitLogLines(chunk: string): string[];
export declare class SshService {
    private readonly logger;
    executeCommand(server: Server, command: string, onData?: (chunk: string) => void, timeoutMs?: number): Promise<string>;
    provision(server: Server, onEvent?: ProvisionEventHandler): Promise<void>;
    discoverWebsites(server: Server): Promise<any[]>;
    discoverDatabases(server: Server): Promise<any[]>;
    getHealth(server: Server): Promise<Partial<Server>>;
    listServices(server: Server): Promise<any[]>;
    manageService(server: Server, serviceName: string, action: string): Promise<boolean>;
    installService(server: Server, serviceName: string, onData?: (chunk: string) => void): Promise<boolean>;
    uninstallService(server: Server, serviceName: string, onData?: (chunk: string) => void): Promise<boolean>;
    updateServer(server: Server, onData?: (chunk: string) => void): Promise<boolean>;
}
