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
        const host = process.env.DB_HOST || 'aws-1-us-east-1.pooler.supabase.com';
        const port = process.env.DB_PORT || '6543';
        const user = process.env.DB_USER || 'postgres.sbhvcvpnxwmfywffgaeo';

        this.logger.log(`Conectando a host: ${host} puerto: ${port} usuario: ${user.substring(0, 10)}...`);

        this.pool = new Pool({
            host,
            port: parseInt(port),
            database: process.env.DB_NAME || 'postgres',
            user,
            password: process.env.DB_PASSWORD || process.env.SUPABASE_BASE_DE_DATOS,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 60000,
            connectionTimeoutMillis: 30000,
            keepAlive: true,
            statement_timeout: 30000,
            application_name: 'cloudcore_engine'
        });
    }

    async onModuleInit() {
        try {
            this.logger.log('Lanzando consulta de prueba (SELECT NOW())...');
            const result = await this.pool.query('SELECT NOW()');
            this.logger.log(`¡CONEXIÓN EXITOSA! Servidor responde: ${result.rows[0].now}`);
            await this.createServersTable();
            await this.applyMigrations();
        } catch (error) {
            this.logger.error(`ERROR DE CONEXIÓN: ${error.message}`);
            if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                this.logger.error('Sugerencia: El puerto 6543/5432 podría estar bloqueado en tu red local.');
            }
        }
    }


    private async applyMigrations() {
        try {
            // Migración para agregar provisioning_step si no existe
            await this.pool.query(`
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                 WHERE table_name='servers' AND column_name='provisioning_step') THEN
                        ALTER TABLE servers ADD COLUMN provisioning_step VARCHAR(255);
                    END IF;

                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                 WHERE table_name='servers' AND column_name='user_id') THEN
                        ALTER TABLE servers ADD COLUMN user_id VARCHAR(255);
                    ELSE
                        ALTER TABLE servers ALTER COLUMN user_id TYPE VARCHAR(255);
                    END IF;

                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                 WHERE table_name='servers' AND column_name='cpu_usage') THEN
                        ALTER TABLE servers ADD COLUMN cpu_usage NUMERIC(5,2);
                        ALTER TABLE servers ADD COLUMN ram_usage NUMERIC(5,2);
                        ALTER TABLE servers ADD COLUMN disk_usage NUMERIC(5,2);
                        ALTER TABLE servers ADD COLUMN temp NUMERIC(5,2);
                    END IF;
                END $$;
            `);

            this.logger.log('Migraciones aplicadas correctamente.');
        } catch (error) {
            this.logger.error('Error aplicando migraciones:', error.message);
        }
    }


    private async createServersTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS servers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id VARCHAR(255),
                name VARCHAR(255) NOT NULL,

                ip VARCHAR(255) NOT NULL,
                ssh_port INT DEFAULT 22,
                ssh_user VARCHAR(255) DEFAULT 'root',
                auth_type VARCHAR(50) DEFAULT 'key',
                private_key TEXT,
                password TEXT,
                status VARCHAR(50) DEFAULT 'provisioning',
                provisioning_step VARCHAR(255),
                cpu_usage NUMERIC(5,2),
                ram_usage NUMERIC(5,2),
                disk_usage NUMERIC(5,2),
                temp NUMERIC(5,2),
                last_health_check TIMESTAMP DEFAULT NOW(),
                created_at TIMESTAMP DEFAULT NOW()
            );
        `;
        try {
            await this.pool.query(query);
            this.logger.log('Tabla "servers" verificada/creada correctamente.');
        } catch (error) {
            this.logger.error('Error al crear la tabla "servers":', error.message);
        }
    }


    async query(text: string, params?: any[]) {
        // En Transaction Mode de Supabase, es mejor pasar los parámetros directamente 
        // o asegurar que el driver no intente crear una 'prepared statement' con nombre.
        return this.pool.query({
            text,
            values: params,
        });
    }


    async onModuleDestroy() {
        await this.pool.end();
    }
}
