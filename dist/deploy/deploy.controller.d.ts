import { Response } from 'express';
import { DatabaseService } from '../database/database.service';
import { SshService } from '../services/ssh.service';
import { DeployService } from './deploy.service';
import { DeployWebsiteDto } from './dto/deploy-website.dto';
export declare class DeployController {
    private readonly deployService;
    private readonly ssh;
    private readonly db;
    constructor(deployService: DeployService, ssh: SshService, db: DatabaseService);
    listStacks(): {
        stacks: {
            id: string;
            label: string;
            usesGit: boolean;
        }[];
    };
    deployWebsite(id: string, userId: string, body: DeployWebsiteDto, res: Response): Promise<void>;
    uploadWordpressAsset(id: string, userId: string, file: any): Promise<any>;
    private ownedServer;
}
