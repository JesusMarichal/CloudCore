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
        }
        catch (error) {
            this.logger.error(`ERROR DE CONEXIÓN: ${error.message}`);
            if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                this.logger.error('Sugerencia: El puerto 6543/5432 podría estar bloqueado en tu red local.');
            }
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
                END $$;
            `);
            this.logger.log('Migraciones aplicadas correctamente.');
        }
        catch (error) {
            this.logger.error('Error aplicando migraciones:', error.message);
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