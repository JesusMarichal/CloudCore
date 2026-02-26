import { DatabaseService } from '../database/database.service';
import { SshService } from '../services/ssh.service';
export declare class GithubController {
    private readonly db;
    private readonly sshService;
    private readonly logger;
    constructor(db: DatabaseService, sshService: SshService);
    getSettings(userId: string): Promise<{
        success: boolean;
        message: string;
        token?: undefined;
    } | {
        success: boolean;
        token: any;
        message?: undefined;
    }>;
    saveSettings(userId: string, body: {
        token: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    getRepos(userId: string): Promise<{
        success: boolean;
        message: string;
        repos?: undefined;
    } | {
        success: boolean;
        repos: {
            id: number;
            name: string;
            full_name: string;
            clone_url: string;
            private: boolean;
        }[];
        message?: undefined;
    }>;
    handleWebhook(req: any, payload: any): Promise<{
        success: boolean;
        message: string;
    }>;
}
