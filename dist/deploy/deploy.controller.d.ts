import { Response } from 'express';
import { DatabaseService } from '../database/database.service';
import { DeployService } from './deploy.service';
import { DeployWebsiteDto } from './dto/deploy-website.dto';
export declare class DeployController {
    private readonly deployService;
    private readonly db;
    constructor(deployService: DeployService, db: DatabaseService);
    deployWebsite(id: string, userId: string, body: DeployWebsiteDto, res: Response): Promise<void>;
}
