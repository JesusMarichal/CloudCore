export declare class AuthController {
    private readonly logger;
    login(body: any): Promise<{
        success: boolean;
        message: string;
    }>;
}
