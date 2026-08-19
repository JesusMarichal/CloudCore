export declare class LoginDto {
    email: string;
    password: string;
}
export declare class Verify2FALoginDto {
    preAuthToken: string;
    token: string;
}
export declare class RegisterDto {
    name: string;
    email: string;
    password: string;
    avatar?: string;
}
export declare class UpdateOnboardingDto {
    done: boolean;
}
export declare class UpdateAvatarDto {
    avatar: string;
}
export declare class VerifyRegisterDto {
    email: string;
    code: string;
}
export declare class ForgotPasswordDto {
    email: string;
}
export declare class ResetPasswordDto {
    token: string;
    newPassword: string;
}
export declare class ChangePasswordDto {
    currentPassword: string;
    newPassword: string;
}
export declare class Enable2FADto {
    token: string;
}
export declare class Disable2FADto {
    password: string;
}
