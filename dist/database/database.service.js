"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DatabaseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, '../../.env') });
let DatabaseService = DatabaseService_1 = class DatabaseService {
    constructor() {
        this.logger = new common_1.Logger(DatabaseService_1.name);
        const host = process.env.DB_HOST || 'aws-1-us-east-1.pooler.supabase.com';
        const port = process.env.DB_PORT || '6543';
        const user = process.env.DB_USER || 'postgres.sbhvcvpnxwmfywffgaeo';
        this.logger.log(`Conectando a host: ${host} puerto: ${port} usuario: ${user.substring(0, 10)}...`);
        this.pool = new pg_1.Pool({
            host,
            port: parseInt(port),
            database: process.env.DB_NAME || 'postgres',
            user,
            password: process.env.DB_PASSWORD || process.env.SUPABASE_BASE_DE_DATOS,
            ssl: { rejectUnauthorized: false },
            max: 20,
            idleTimeoutMillis: 120000,
            connectionTimeoutMillis: 60000,
            allowExitOnIdle: true,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
            statement_timeout: 60000,
            application_name: 'cloudcore_engine'
        });
    }
    async onModuleInit() {
        try {
            this.logger.log('Lanzando consulta de prueba (SELECT NOW())...');
            const result = await this.pool.query('SELECT NOW()');
            this.logger.log(`¡CONEXIÓN EXITOSA! Servidor responde: ${result.rows[0].now}`);
            await this.pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
            await this.createUsersTable();
            await this.createServersTable();
            await this.createPendingRegistrationsTable();
            await this.createPasswordResetsTable();
            await this.createBillingTables();
            await this.applyMigrations();
        }
        catch (error) {
            this.logger.error(`ERROR DE CONEXIÓN: ${error.message}`);
            if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                this.logger.error('Sugerencia: El puerto 6543/5432 podría estar bloqueado en tu red local.');
            }
        }
    }
    async createBillingTables() {
        const query = `
            CREATE TABLE IF NOT EXISTS customers (
                customer_id VARCHAR(255) PRIMARY KEY,
                email VARCHAR(255) NOT NULL DEFAULT '',
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS customers_email_idx ON customers (LOWER(email));

            CREATE TABLE IF NOT EXISTS subscriptions (
                subscription_id VARCHAR(255) PRIMARY KEY,
                customer_id VARCHAR(255) NOT NULL REFERENCES customers(customer_id),
                status VARCHAR(50) NOT NULL,
                price_id VARCHAR(255) NOT NULL,
                product_id VARCHAR(255) NOT NULL,
                scheduled_change_action VARCHAR(50),
                scheduled_change_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS subscriptions_customer_id_idx ON subscriptions (customer_id);
            CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions (status);

            -- Sin FK a customers/subscriptions a propósito: los webhooks llegan
            -- desordenados y una transacción puede adelantar a su suscripción.
            CREATE TABLE IF NOT EXISTS transactions (
                transaction_id VARCHAR(255) PRIMARY KEY,
                customer_id VARCHAR(255),
                subscription_id VARCHAR(255),
                status VARCHAR(50) NOT NULL,
                amount VARCHAR(50),
                currency_code VARCHAR(10),
                billed_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS transactions_customer_id_idx ON transactions (customer_id);

            -- Fecha del proximo cobro: es la "fecha de corte" que ve el usuario.
            ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billed_at TIMESTAMP;

            -- Datos NO sensibles del metodo de pago, tal y como los manda Paddle
            -- en transaction.completed. Nunca se guarda el numero completo ni el
            -- CVC: Paddle no los expone y no deben pasar por aqui.
            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_type VARCHAR(30);
            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_brand VARCHAR(30);
            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_last4 VARCHAR(4);
            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_expiry_month SMALLINT;
            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_expiry_year SMALLINT;

            -- Registro de eventos ya procesados: las entregas son at-least-once
            -- y Paddle reenvía el mismo event_id en cada reintento.
            CREATE TABLE IF NOT EXISTS paddle_webhook_events (
                event_id VARCHAR(255) PRIMARY KEY,
                event_type VARCHAR(100) NOT NULL,
                occurred_at TIMESTAMP,
                processed_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `;
        try {
            await this.pool.query(query);
            this.logger.log('Tablas de facturación (Paddle) verificadas/creadas correctamente.');
        }
        catch (error) {
            this.logger.error('Error al crear las tablas de facturación:', error.message);
        }
    }
    async applyMigrations() {
        try {
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
                    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users') THEN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                     WHERE table_name='users' AND column_name='github_token') THEN
                            ALTER TABLE users ADD COLUMN github_token VARCHAR(255);
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                     WHERE table_name='users' AND column_name='totp_secret') THEN
                            ALTER TABLE users ADD COLUMN totp_secret VARCHAR(64);
                            ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN DEFAULT false;
                            ALTER TABLE users ADD COLUMN failed_attempts INT DEFAULT 0;
                            ALTER TABLE users ADD COLUMN locked_until TIMESTAMP;
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                     WHERE table_name='users' AND column_name='role') THEN
                            ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'CLIENT';
                        END IF;
                        -- Avatar: solo se guarda el ID del avatar predeterminado
                        -- (ej. 'av-03'), nunca la imagen. El frontend resuelve el
                        -- ID a una URL con su catalogo local.
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                     WHERE table_name='users' AND column_name='avatar') THEN
                            ALTER TABLE users ADD COLUMN avatar VARCHAR(64);
                        END IF;
                        -- Guia de CoreBot: se marca cuando el usuario la termina
                        -- o la salta, para no repetirsela en cada inicio de sesion.
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                     WHERE table_name='users' AND column_name='onboarding_done') THEN
                            ALTER TABLE users ADD COLUMN onboarding_done BOOLEAN DEFAULT false;
                        END IF;
                    END IF;
                    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='pending_registrations') THEN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                     WHERE table_name='pending_registrations' AND column_name='avatar') THEN
                            ALTER TABLE pending_registrations ADD COLUMN avatar VARCHAR(64);
                        END IF;
                    END IF;
                END $$;
            `);
            await this.pool.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'CLIENT';`);
            await this.pool.query(`
                UPDATE users SET role = 'CLIENT' WHERE role IS NULL OR role NOT IN ('ADMIN', 'CLIENT');
            `);
            await this.pool.query(`
                UPDATE users SET role = 'ADMIN' WHERE LOWER(email) = 'jesusmarichal0@gmail.com';
            `);
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS websites (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    server_id UUID REFERENCES servers(id),
                    user_id VARCHAR(255),
                    repo_url VARCHAR(255),
                    name VARCHAR(255),
                    domain VARCHAR(255),
                    entry_point VARCHAR(255),
                    install_command VARCHAR(255),
                    start_command VARCHAR(255),
                    port VARCHAR(50),
                    created_at TIMESTAMP DEFAULT NOW()
                );
                
                -- Añadir columnas si la tabla ya existía
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                 WHERE table_name='websites' AND column_name='domain') THEN
                        ALTER TABLE websites ADD COLUMN domain VARCHAR(255);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                 WHERE table_name='websites' AND column_name='entry_point') THEN
                        ALTER TABLE websites ADD COLUMN entry_point VARCHAR(255);
                    END IF;
                END $$;
            `);
            this.logger.log('Migraciones aplicadas correctamente.');
        }
        catch (error) {
            this.logger.error('Error aplicando migraciones:', error.message);
        }
    }
    async createUsersTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password TEXT NOT NULL,
                github_token VARCHAR(255),
                role VARCHAR(20) DEFAULT 'CLIENT',
                avatar VARCHAR(64),
                onboarding_done BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `;
        try {
            await this.pool.query(query);
            this.logger.log('Tabla "users" verificada/creada correctamente.');
        }
        catch (error) {
            this.logger.error('Error al crear la tabla "users":', error.message);
        }
    }
    async createPendingRegistrationsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS pending_registrations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                password TEXT NOT NULL,
                code_hash TEXT NOT NULL,
                avatar VARCHAR(64),
                attempts INT DEFAULT 0,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `;
        try {
            await this.pool.query(query);
            this.logger.log('Tabla "pending_registrations" verificada/creada correctamente.');
        }
        catch (error) {
            this.logger.error('Error al crear la tabla "pending_registrations":', error.message);
        }
    }
    async createPasswordResetsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS password_resets (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) NOT NULL,
                token_hash VARCHAR(64) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `;
        try {
            await this.pool.query(query);
            this.logger.log('Tabla "password_resets" verificada/creada correctamente.');
        }
        catch (error) {
            this.logger.error('Error al crear la tabla "password_resets":', error.message);
        }
    }
    async createServersTable() {
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
        }
        catch (error) {
            this.logger.error('Error al crear la tabla "servers":', error.message);
        }
    }
    async query(text, params) {
        return this.pool.query({
            text,
            values: params,
        });
    }
    async onModuleDestroy() {
        await this.pool.end();
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = DatabaseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], DatabaseService);
//# sourceMappingURL=database.service.js.map