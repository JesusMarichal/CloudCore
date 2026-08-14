import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
export declare class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private pool;
    private readonly logger;
    constructor();
    onModuleInit(): Promise<void>;
    private applyMigrations;
    private createUsersTable;
    private createPendingRegistrationsTable;
    private createPasswordResetsTable;
    private createServersTable;
    query(text: string, params?: any[]): Promise<import("pg").QueryResult<any>>;
    onModuleDestroy(): Promise<void>;
}
