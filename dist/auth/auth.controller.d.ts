import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';
import { LoginDto, Verify2FALoginDto, RegisterDto, VerifyRegisterDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto, Enable2FADto, Disable2FADto, UpdateAvatarDto, UpdateOnboardingDto } from './dto/auth.dto';
export declare class AuthController {
    private readonly db;
    private readonly jwtService;
    private readonly mail;
    private readonly logger;
    constructor(db: DatabaseService, jwtService: JwtService, mail: MailService);
    private signToken;
    login(body: LoginDto): Promise<{
        success: boolean;
        message: string;
        require2FA?: undefined;
        preAuthToken?: undefined;
        token?: undefined;
        user?: undefined;
    } | {
        success: boolean;
        require2FA: boolean;
        preAuthToken: string;
        message: string;
        token?: undefined;
        user?: undefined;
    } | {
        success: boolean;
        token: string;
        user: {
            id: string;
            name: any;
            email: any;
            role: any;
            avatar: any;
            onboardingDone: boolean;
        };
        message?: undefined;
        require2FA?: undefined;
        preAuthToken?: undefined;
    }>;
    verify2FALogin(body: Verify2FALoginDto): Promise<{
        success: boolean;
        message: string;
        token?: undefined;
        user?: undefined;
    } | {
        success: boolean;
        token: string;
        user: {
            id: string;
            name: any;
            email: any;
            role: any;
            avatar: any;
            onboardingDone: boolean;
        };
        message?: undefined;
    }>;
    register(body: RegisterDto): Promise<{
        success: boolean;
        message: string;
        requiresVerification?: undefined;
    } | {
        success: boolean;
        requiresVerification: boolean;
        message: string;
    }>;
    verifyRegister(body: VerifyRegisterDto): Promise<{
        success: boolean;
        message: string;
        token?: undefined;
        user?: undefined;
    } | {
        success: boolean;
        message: string;
        token: string;
        user: {
            id: string;
            name: any;
            email: any;
            role: any;
            avatar: any;
            onboardingDone: boolean;
        };
    }>;
    forgotPassword(body: ForgotPasswordDto): Promise<{
        success: boolean;
        message: string;
    }>;
    resetPassword(body: ResetPasswordDto): Promise<{
        success: boolean;
        message: string;
    }>;
    changePassword(userId: string, body: ChangePasswordDto): Promise<{
        success: boolean;
        message: string;
    }>;
    generate2FA(userId: string): Promise<{
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
    enable2FA(userId: string, body: Enable2FADto): Promise<{
        success: boolean;
        message: string;
    }>;
    disable2FA(userId: string, body: Disable2FADto): Promise<{
        success: boolean;
        message: string;
    }>;
    get2FAStatus(userId: string): Promise<{
        success: boolean;
        enabled: boolean;
    }>;
    me(userId: string): Promise<{
        success: boolean;
        message: string;
        user?: undefined;
    } | {
        success: boolean;
        user: {
            id: string;
            name: any;
            email: any;
            role: any;
            avatar: any;
            onboardingDone: boolean;
            createdAt: any;
        };
        message?: undefined;
    }>;
    updateOnboarding(userId: string, body: UpdateOnboardingDto): Promise<{
        success: boolean;
        message: string;
        onboardingDone?: undefined;
    } | {
        success: boolean;
        onboardingDone: boolean;
        message?: undefined;
    }>;
    updateAvatar(userId: string, body: UpdateAvatarDto): Promise<{
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
            role: any;
            avatar: any;
        };
    }>;
}
