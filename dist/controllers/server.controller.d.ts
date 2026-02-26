import { Response } from 'express';
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
    getServices(id: string): Promise<any[]>;
    manageService(id: string, serviceName: string, action: string): Promise<any>;
    installService(id: string, serviceName: string, res: Response): Promise<void>;
    uninstallService(id: string, serviceName: string, res: Response): Promise<void>;
    updateSystem(id: string, res: Response): Promise<void>;
    deployWebsite(id: string, body: any): Promise<any>;
    updateWebsite(id: string, websiteId: string, body: any): Promise<any>;
    getWebsites(userId: string): Promise<any[]>;
    getWebsiteEnv(id: string, websiteId: string): Promise<any>;
    deleteWebsite(id: string, websiteId: string): Promise<any>;
    getWebsiteLogs(id: string, websiteId: string): Promise<any>;
    executeCommand(id: string, command: string): Promise<any>;
}
