import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    @Length(1, 255)
    name?: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    email?: string;

    @IsOptional()
    @IsIn(['ADMIN', 'CLIENT'])
    role?: 'ADMIN' | 'CLIENT';
}

export class ListUsersQueryDto {
    /** Texto libre contra nombre y email. */
    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string;

    /** 'ALL' (o ausente) no filtra. */
    @IsOptional()
    @IsIn(['ALL', 'ADMIN', 'CLIENT'])
    role?: 'ALL' | 'ADMIN' | 'CLIENT';
}
