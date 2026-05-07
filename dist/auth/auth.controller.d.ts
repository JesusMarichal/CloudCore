import { DatabaseService } from '../database/database.service';
export declare class AuthController {
    private readonly db;
    private readonly logger;
    constructor(db: DatabaseService);
    login(body: any): Promise<{
        success: boolean;
        message: string;
        require2FA?: undefined;
        userId?: undefined;
        user?: undefined;
    } | {
        success: boolean;
        require2FA: boolean;
        userId: string;
        message: string;
        user?: undefined;
    } | {
        success: boolean;
        user: {
            id: string;
            name: any;
            email: any;
        };
        message?: undefined;
        require2FA?: undefined;
        userId?: undefined;
    }>;
    verify2FALogin(body: any): Promise<{
        success: boolean;
        message: string;
        user?: undefined;
    } | {
        success: boolean;
        user: {
            id: string;
            name: any;
            email: any;
        };
        message?: undefined;
    }>;
    register(body: any): Promise<{
        success: boolean;
        message: string;
        user?: undefined;
    } | {
        success: boolean;
        message: string;
        user: any;
    }>;
    changePassword(body: any): Promise<{
        success: boolean;
        message: string;
    }>;
    generate2FA(body: any): Promise<{
        success: boolean;
        message: string;
        secret?: undefined;
        otpauthUrl?: undefined;
    } | {
        success: boolean;
        secret: string;
        otpauthUrl: string;
        message?: undefined;
    }>;
    enable2FA(body: any): Promise<{
        success: boolean;
        message: string;
    }>;
    disable2FA(body: any): Promise<{
        success: boolean;
        message: string;
    }>;
    get2FAStatus(body: any): Promise<{
        success: boolean;
        enabled?: undefined;
    } | {
        success: boolean;
        enabled: boolean;
    }>;
}
