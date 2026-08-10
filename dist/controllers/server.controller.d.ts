import { Response } from 'express';
import { SshService } from '../services/ssh.service';
import { CreateServerDto } from '../dto/create-server.dto';
import { Server } from '../models/server.model';
import { DatabaseService } from '../database/database.service';
export declare class ServerController {
    private readonly sshService;
    private readonly dbService;
    constructor(sshService: SshService, dbService: DatabaseService);
    private assertServerOwnership;
    private assertWebsiteOwnership;
    private assertDatabaseOwnership;
    findAll(userId: string): Promise<Server[]>;
    create(userId: string, serverDto: CreateServerDto): Promise<Server>;
    deleteServer(id: string, userId: string): Promise<any>;
    refreshHealth(id: string, userId: string): Promise<any>;
    getServices(id: string, userId: string): Promise<any[]>;
    installService(id: string, serviceName: string, userId: string, res: Response): Promise<void>;
    uninstallService(id: string, serviceName: string, userId: string, res: Response): Promise<void>;
    manageService(id: string, serviceName: string, action: string, userId: string): Promise<any>;
    updateSystem(id: string, userId: string, res: Response): Promise<void>;
    updateWebsite(id: string, websiteId: string, userId: string, body: any, res: Response): Promise<void>;
    getWebsites(userId: string): Promise<any[]>;
    private importExistingWebsites;
    importWebsites(id: string, userId: string): Promise<any>;
    getWebsiteEnv(id: string, websiteId: string, userId: string): Promise<any>;
    deleteWebsite(id: string, websiteId: string, userId: string): Promise<any>;
    getWebsiteLogs(id: string, websiteId: string, userId: string): Promise<any>;
    getWebsiteCommit(id: string, websiteId: string, userId: string): Promise<any>;
    deployLatestCommit(id: string, websiteId: string, userId: string): Promise<any>;
    executeCommand(id: string, command: string, userId: string): Promise<any>;
    private getServerFromData;
    deployDatabase(id: string, userId: string, body: any, res: Response): Promise<void>;
    listDatabases(userId: string): Promise<any[]>;
    importDatabases(userId: string): Promise<any>;
    deleteDatabaseInstance(id: string, dbId: string, userId: string): Promise<any>;
    manageDatabaseContainer(id: string, dbId: string, action: string, userId: string): Promise<any>;
    getNotifications(userId: string): Promise<{
        success: boolean;
        notifications: any[];
    }>;
    markNotificationsRead(userId: string): Promise<{
        success: boolean;
    }>;
    dismissNotification(id: string, userId: string): Promise<{
        success: boolean;
    }>;
}
