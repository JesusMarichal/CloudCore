import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'dns';
import { promisify } from 'util';
import { SshService } from '../services/ssh.service';
import { DatabaseService } from '../database/database.service';
import { Server } from '../models/server.model';
import { DeployWebsiteDto } from './dto/deploy-website.dto';
import { DeployContext } from './stacks/stack.interface';
import { StackRegistry } from './stacks/stack.registry';
import { buildNginxScript } from './nginx.util';

const resolve4 = promisify(dns.resolve4);

/**
 * Orquestador del despliegue. Elige el stack, ensambla el script (app + Nginx),
 * lo ejecuta por SSH transmitiendo los logs en vivo y persiste el sitio.
 * Reutiliza SshService.executeCommand como primitivo de streaming.
 */
@Injectable()
export class DeployService {
    private readonly logger = new Logger(DeployService.name);

    constructor(
        private readonly ssh: SshService,
        private readonly db: DatabaseService,
        private readonly registry: StackRegistry,
    ) { }

    async deploy(
        server: Server,
        userId: string,
        dto: DeployWebsiteDto,
        onData?: (chunk: string) => void,
    ): Promise<boolean> {
        const stackId = dto.stack ?? 'node';
        const stack = this.registry.get(stackId);

        const safeName = dto.name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const projectPath = `/var/www/${safeName}`;

        // 1. Inyectar token de GitHub en la URL del repo (si aplica)
        let repoUrlWithToken = dto.repo;
        let userEmail = '';
        const userRes = await this.db.query('SELECT github_token, email FROM users WHERE id = $1', [userId]);
        const userData = userRes.rows[0];
        if (userData?.github_token && dto.repo.startsWith('https://github.com/')) {
            repoUrlWithToken = dto.repo.replace('https://github.com/', `https://${userData.github_token}@github.com/`);
        }
        userEmail = userData?.email || '';

        // Enmascarar el token en el stream de logs para no enviarlo al panel web
        const emit = (chunk: string) => {
            if (!onData) return;
            if (repoUrlWithToken !== dto.repo) {
                const tokenRegex = new RegExp(`https://[^@]+@github\\.com`, 'g');
                chunk = chunk.replace(tokenRegex, 'https://github.com');
            }
            onData(chunk);
        };

        // 2. Verificar propagación DNS si se usa Let's Encrypt
        if (dto.useLetsEncrypt && dto.domain && dto.domain !== '_') {
            emit(`🔍 Verificando propagación DNS para ${dto.domain}...\n`);
            try {
                const addresses = await resolve4(dto.domain);
                if (!addresses.includes(server.ip)) {
                    emit(`⚠️ ADVERTENCIA: El dominio ${dto.domain} apunta a ${addresses.join(', ')} pero el servidor es ${server.ip}.\n`);
                    emit(`❌ La generación de SSL podría fallar. Asegúrate de que el registro A sea correcto.\n\n`);
                } else {
                    emit(`✅ DNS verificado correctamente.\n\n`);
                }
            } catch {
                emit(`⚠️ No se pudo resolver el dominio ${dto.domain}. Es posible que los DNS no hayan propagado aún.\n`);
                emit(`❌ Procediendo con precaución, pero SSL podría fallar.\n\n`);
            }
        }

        // 3. Ensamblar el script: parte de la app (según stack) + Nginx/Certbot (común)
        const ctx: DeployContext = {
            server,
            safeName,
            projectPath,
            data: { ...dto, repo: repoUrlWithToken, userEmail },
        };
        const fullScript = `${stack.buildAppScript(ctx)}\n${buildNginxScript(ctx, stack.serve(ctx))}`;

        // 4. Ejecutar por SSH transmitiendo logs en vivo
        try {
            await this.ssh.executeCommand(server, fullScript, emit);
            emit('\n\n---DONE---\n');
        } catch (error: any) {
            this.logger.error(`Error desplegando ${safeName} (${stackId}) en ${server.ip}: ${error.message}`);
            emit(`\n❌ Error de despliegue: ${error.message}\n`);
            return false;
        }

        // 5. Persistir el sitio (para webhooks / listado)
        try {
            await this.ensureWebsitesColumns();
            await this.db.query(`
                INSERT INTO websites (server_id, user_id, repo_url, name, install_command, build_command, start_command, port, domain, entry_point, env_vars, use_letsencrypt, setup_www_alias, stack)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `, [
                server.id, userId, dto.repo, dto.name, dto.installCommand, dto.buildCommand,
                dto.startCommand, dto.port, dto.domain, dto.entryPoint, dto.envVars,
                dto.useLetsEncrypt || false, dto.setupWwwAlias || false, stackId,
            ]);
        } catch (error) {
            this.logger.error(`Error guardando el sitio en la base de datos: ${error}`);
        }

        return true;
    }

    /** Migración ad-hoc: garantiza que existan las columnas de la tabla websites. */
    private async ensureWebsitesColumns(): Promise<void> {
        await this.db.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='build_command') THEN
                    ALTER TABLE websites ADD COLUMN build_command VARCHAR(255);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='domain') THEN
                    ALTER TABLE websites ADD COLUMN domain VARCHAR(255);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='entry_point') THEN
                    ALTER TABLE websites ADD COLUMN entry_point VARCHAR(255);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='user_id') THEN
                    ALTER TABLE websites ADD COLUMN user_id VARCHAR(255);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='env_vars') THEN
                    ALTER TABLE websites ADD COLUMN env_vars TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='use_letsencrypt') THEN
                    ALTER TABLE websites ADD COLUMN use_letsencrypt BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='setup_www_alias') THEN
                    ALTER TABLE websites ADD COLUMN setup_www_alias BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='stack') THEN
                    ALTER TABLE websites ADD COLUMN stack VARCHAR(32) DEFAULT 'node';
                END IF;
            END $$;
        `);
    }
}
