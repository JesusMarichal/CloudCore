export interface Server {
    id: string;
    userId?: string;
    name: string;
    ip: string;
    sshPort: number;
    sshUser: string;
    authType: 'key' | 'password';
    privateKey?: string;
    password?: string;
    status: 'online' | 'offline' | 'provisioning';
    provisioningStep?: string;
    lastHealthCheck: Date;
    cpuUsage?: number;
    ramUsage?: number;
    diskUsage?: number;
    temp?: number;
}
