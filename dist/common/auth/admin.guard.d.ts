import { CanActivate, ExecutionContext } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
export declare class AdminGuard implements CanActivate {
    private readonly db;
    constructor(db: DatabaseService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
