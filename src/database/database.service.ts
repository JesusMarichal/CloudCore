import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private pool: Pool;
    private readonly logger = new Logger(DatabaseService.name);

    constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST || 'aws-1-us-east-1.pooler.supabase.com',
            port: parseInt(process.env.DB_PORT || '6543'),
            database: process.env.DB_NAME || 'postgres',
            user: process.env.DB_USER || 'postgres.sbhvcvpnxwmfywffgaeo',
            password: process.env.DB_PASSWORD || process.env.SUPABASE_BASE_DE_DATOS,
            ssl: {
                rejectUnauthorized: false
            },
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
    }

    async onModuleInit() {
        try {
            await this.pool.query('SELECT NOW()');
            this.logger.log('Conexión a la base de datos Supabase establecida correctamente.');
        } catch (error) {
            this.logger.error('Error al conectar con la base de datos:', error.message);
        }
    }

    async query(text: string, params?: any[]) {
        return this.pool.query(text, params);
    }

    async onModuleDestroy() {
        await this.pool.end();
    }
}
