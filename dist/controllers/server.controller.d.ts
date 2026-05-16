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
    deleteServer(id: string): Promise<any>;
    refreshHealth(id: string): Promise<any>;
    getServices(id: string): Promise<any[]>;
    installService(id: string, serviceName: string, res: Response): Promise<void>;
    uninstallService(id: string, serviceName: string, res: Response): Promise<void>;
    manageService(id: string, serviceName: string, action: string): Promise<any>;
    updateSystem(id: string, res: Response): Promise<void>;
    deployWebsite(id: string, body: any, res: Response): Promise<void>;
    updateWebsite(id: string, websiteId: string, body: any, res: Response): Promise<void>;
    getWebsites(userId: string): Promise<any[]>;
    getWebsiteEnv(id: string, websiteId: string): Promise<any>;
    deleteWebsite(id: string, websiteId: string): Promise<any>;
    getWebsiteLogs(id: string, websiteId: string): Promise<any>;
    getWebsiteCommit(id: string, websiteId: string): Promise<any>;
    deployLatestCommit(id: string, websiteId: string): Promise<any>;
    executeCommand(id: string, command: string): Promise<any>;
    private getServerFromData;
    deployDatabase(id: string, body: any, res: Response): Promise<void>;
    listDatabases(userId: string): Promise<any[]>;
    deleteDatabaseInstance(id: string, dbId: string): Promise<any>;
    manageDatabaseContainer(id: string, dbId: string, action: string): Promise<any>;
    getNotifications(userId: string): Promise<{
        success: boolean;
        notifications: any[];
    }>;
    markNotificationsRead(userId: string): Promise<{
        success: boolean;
    }>;
    dismissNotification(id: string): Promise<{
        success: boolean;
    }>;
}
