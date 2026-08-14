import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class LoginDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(1)
    password: string;
}

export class Verify2FALoginDto {
    @IsString()
    @MinLength(1)
    preAuthToken: string;

    @IsString()
    @Length(6, 6)
    token: string;
}

export class RegisterDto {
    @IsString()
    @MinLength(1)
    name: string;

    @IsEmail()
    email: string;

    @IsString()
    @MinLength(8)
    password: string;
}

export class VerifyRegisterDto {
    @IsEmail()
    email: string;

    @IsString()
    @Length(6, 6)
    code: string;
}

export class ForgotPasswordDto {
    @IsEmail()
    email: string;
}

export class ResetPasswordDto {
    @IsString()
    @MinLength(1)
    token: string;

    @IsString()
    @MinLength(8)
    newPassword: string;
}

export class ChangePasswordDto {
    @IsString()
    @MinLength(1)
    currentPassword: string;

    @IsString()
    @MinLength(8)
    newPassword: string;
}

export class Enable2FADto {
    @IsString()
    @Length(6, 6)
    token: string;
}

export class Disable2FADto {
    @IsString()
    @MinLength(1)
    password: string;
}
