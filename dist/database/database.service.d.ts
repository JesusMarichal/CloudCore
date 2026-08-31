import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { QueryResult } from 'pg';
export declare class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private pool;
    private readonly logger;
    constructor();
    onModuleInit(): Promise<void>;
    private createBillingTables;
    private applyMigrations;
    private createUsersTable;
    private createPendingRegistrationsTable;
    private createPasswordResetsTable;
    private createServersTable;
    query(text: string, params?: any[]): Promise<QueryResult<any>>;
    transaction<T>(work: (query: (text: string, params?: any[]) => Promise<QueryResult>) => Promise<T>): Promise<T>;
    onModuleDestroy(): Promise<void>;
}
