import { DatabaseService } from '../database/database.service';
export declare class AuthController {
    private readonly db;
    private readonly logger;
    constructor(db: DatabaseService);
    login(body: any): Promise<{
        success: boolean;
        message: string;
        user?: undefined;
    } | {
        success: boolean;
        message: string;
        user: {
            id: string;
            name: any;
            email: any;
        };
    }>;
}
