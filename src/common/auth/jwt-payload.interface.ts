export type UserRole = 'ADMIN' | 'CLIENT';

export interface JwtPayload {
    sub: string;
    email: string;
    name: string;
    role: UserRole;
    scope?: 'full' | 'pre2fa';
}
