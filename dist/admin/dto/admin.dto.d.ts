export declare class UpdateUserDto {
    name?: string;
    email?: string;
    role?: 'ADMIN' | 'CLIENT';
}
export declare class ListUsersQueryDto {
    search?: string;
    role?: 'ALL' | 'ADMIN' | 'CLIENT';
}
