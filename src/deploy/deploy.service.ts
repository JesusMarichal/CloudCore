import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'dns';
import { promisify } from 'util';
import { SshService } from '../services/ssh.service';
import { DatabaseService } from '../database/database.service';
import { Server } from '../models/server.model';
import { DeployWebsiteDto } from './dto/deploy-website.dto';
import { DeployContext, DeployStack, StackLogCommands, WebsiteRow } from './stacks/stack.interface';
import { StackRegistry } from './stacks/stack.registry';
import { buildNginxScript } from './nginx.util';

const resolve4 = promisify(dns.resolve4);

/** Rango de puertos internos que el panel reserva para las apps de los sitios. */
export const PORT_RANGE_START = 30000;
export const PORT_RANGE_END = 39999;

/** Deriva el identificador en disco / PM2 / Nginx a partir del nombre del sitio. */
export function toSafeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
}

/**
 * `websites.stack_config` es JSONB: el driver `pg` ya lo devuelve como objeto,
 * pero las filas migradas desde una columna de texto pueden llegar como string.
 */
export function parseStackConfig(raw: unknown): Record<string, any> | undefined {
    if (!raw) return undefined;
    if (typeof raw === 'object') return raw as Record<string, any>;
    try {
        return JSON.parse(String(raw));
    } catch {
        return undefined;
    }
}

/**
 * Comprueba los campos que cada stack necesita de verdad y devuelve el mensaje
 * de error, o null si el payload es utilizable. Se hace aquí y no con
 * class-validator porque los requisitos dependen del stack y del modo elegido.
 */
export function validateForStack(stackId: string, dto: DeployWebsiteDto): string | null {
    if (stackId === 'wordpress') {
        if (dto.wpMode === 'migrate') {
            if (!dto.wpArchiveUrl?.trim()) {
                return 'Para migrar un WordPress existente hace falta el archivo con los ficheros del sitio (.zip o .tar.gz).';
            }
            return null;
        }
        // Instalación limpia: las credenciales del administrador son obligatorias.
        if (!dto.wpAdminUser?.trim()) return 'Indica el usuario administrador de WordPress.';
        if (!dto.wpAdminPassword || dto.wpAdminPassword.length < 8) {
            return 'La contraseña del administrador de WordPress debe tener al menos 8 caracteres.';
        }
        if (!dto.wpAdminEmail?.trim()) return 'Indica el correo del administrador de WordPress.';
        return null;
    }

    if (!dto.repo?.trim()) return 'Indica el repositorio Git del proyecto.';
    return null;
}

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

    /**
     * Script de (re)configuración de Nginx para un sitio ya desplegado. Existe
     * para que la edición de un sitio use exactamente el mismo generador que el
     * despliegue inicial, en lugar de una copia paralela que puede divergir.
     */
    buildNginxFor(ctx: DeployContext, stackId?: string): string {
        const stack = this.registry.get(stackId || 'node');
        return buildNginxScript(ctx, stack.serve(ctx));
    }

    /** Stack de un sitio guardado (compatibilidad: sin columna = 'node'). */
    stackOf(site: WebsiteRow): DeployStack {
        return this.registry.get(site?.stack || 'node');
    }

    /** Catálogo de stacks disponibles para la UI. */
    listStacks(): { id: string; label: string; usesGit: boolean }[] {
        return this.registry.list();
    }

    /**
     * Reconstruye el contexto de un sitio YA desplegado a partir de su fila y de
     * los datos que llegan del formulario de edición. El identificador y el
     * puerto salen SIEMPRE de la fila guardada: son la carpeta, el proceso y el
     * vhost que ya existen en el servidor, y tomarlos del body permitiría
     * renombrar el sitio dejando huérfano lo desplegado.
     */
    contextFor(server: Server, site: WebsiteRow, body: Partial<DeployWebsiteDto> & { userEmail?: string } = {}): DeployContext {
        const safeName = toSafeName(site.name);
        return {
            server,
            safeName,
            projectPath: `/var/www/${safeName}`,
            data: {
                ...(body as DeployWebsiteDto),
                name: site.name,
                port: String(site.port ?? ''),
            },
            stackConfig: parseStackConfig(site.stack_config),
        };
    }

    /**
     * Script completo de edición de un sitio: parte del stack + Nginx común +
     * el ajuste posterior al certificado.
     *
     * El contexto se rearma con la configuración YA reconfigurada, para que
     * Nginx y el stack usen el dominio nuevo y no el que había guardado.
     */
    buildUpdateScript(ctx: DeployContext, site: WebsiteRow): string {
        const stack = this.stackOf(site);
        const next: DeployContext = { ...ctx, stackConfig: stack.reconfigure(ctx, site) };
        return [
            stack.updateAppScript(next, site),
            buildNginxScript(next, stack.serve(next)),
            stack.postNginxScript(next),
        ].join('\n');
    }

    /** `stack_config` que debe quedar guardado tras una edición. */
    reconfigureFor(ctx: DeployContext, site: WebsiteRow): Record<string, any> {
        return this.stackOf(site).reconfigure(ctx, site);
    }

    /**
     * Script de limpieza al eliminar un sitio: lo específico del stack (procesos,
     * bases de datos, archivos) más el vhost de Nginx, que es común a todos.
     */
    buildCleanupScript(ctx: DeployContext, site: WebsiteRow): string {
        const stack = this.stackOf(site);
        return `
            ${stack.cleanupScript(ctx, site)}
            sudo rm -f /etc/nginx/sites-enabled/${ctx.safeName}
            sudo rm -f /etc/nginx/sites-available/${ctx.safeName}
            sudo nginx -t && sudo systemctl reload nginx
        `;
    }

    /** Comandos de logs del stack del sitio. */
    logCommandsFor(ctx: DeployContext, site: WebsiteRow): StackLogCommands {
        return this.stackOf(site).logCommands(ctx, site);
    }

    /**
     * Primer puerto libre del rango en ese servidor. La unicidad real la impone
     * el índice UNIQUE (server_id, port): esta consulta solo elige un candidato,
     * y si dos despliegues simultáneos eligen el mismo, el INSERT de uno falla
     * en lugar de dejar dos sitios apuntando al mismo puerto.
     *
     * Si el usuario pidió un puerto concreto y está libre, se respeta.
     */
    private async allocatePort(serverId: string, preferred?: string): Promise<number> {
        const wanted = parseInt(String(preferred ?? ''), 10);
        if (Number.isInteger(wanted) && wanted > 0 && wanted < 65536) {
            const taken = await this.db.query(
                'SELECT 1 FROM websites WHERE server_id = $1 AND port = $2',
                [serverId, wanted],
            );
            if (taken.rows.length === 0) return wanted;
        }

        const res = await this.db.query(
            `SELECT p FROM generate_series($2::int, $3::int) p
             WHERE NOT EXISTS (
                 SELECT 1 FROM websites w WHERE w.server_id = $1 AND w.port = p
             )
             ORDER BY p LIMIT 1`,
            [serverId, PORT_RANGE_START, PORT_RANGE_END],
        );
        const free = res.rows[0]?.p;
        if (!free) {
            throw new Error(
                `No quedan puertos libres en el rango ${PORT_RANGE_START}-${PORT_RANGE_END} para este servidor.`,
            );
        }
        return Number(free);
    }

    /**
     * ¿Hay ya un sitio en este servidor cuyo nombre produzca el mismo safeName?
     * Es el mismo identificador que la carpeta en /var/www, el proceso de PM2 y
     * el fichero de Nginx, así que dejar pasar un duplicado equivale a que el
     * despliegue nuevo borre el sitio anterior.
     */
    private async findNameConflict(serverId: string, safeName: string): Promise<string | null> {
        const res = await this.db.query(
            `SELECT name FROM websites
             WHERE server_id = $1
               AND lower(regexp_replace(name, '[^a-zA-Z0-9_-]', '', 'g')) = $2
             LIMIT 1`,
            [serverId, safeName],
        );
        return res.rows[0]?.name ?? null;
    }

    async deploy(
        server: Server,
        userId: string,
        dto: DeployWebsiteDto,
        onData?: (chunk: string) => void,
    ): Promise<boolean> {
        const stackId = dto.stack ?? 'node';
        const stack = this.registry.get(stackId);

        const safeName = toSafeName(dto.name);
        const projectPath = `/var/www/${safeName}`;

        const emitRaw = (chunk: string) => { if (onData) onData(chunk); };

        await this.ensureWebsitesColumns();

        // 0. Requisitos propios del stack elegido.
        const missing = validateForStack(stackId, dto);
        if (missing) {
            emitRaw(`\n❌ ${missing}\n`);
            emitRaw('\n\n---DONE---\n');
            return false;
        }

        // 1. Un servidor no puede tener dos sitios con el mismo identificador.
        const conflict = await this.findNameConflict(server.id, safeName);
        if (conflict) {
            emitRaw(`\n❌ Ya existe un sitio llamado "${conflict}" en este servidor.\n`);
            emitRaw(`   Ambos usarían la misma carpeta (/var/www/${safeName}), el mismo proceso PM2\n`);
            emitRaw(`   y la misma configuración de Nginx, así que este despliegue borraría el anterior.\n`);
            emitRaw(`   Elige otro nombre, o actualiza el sitio existente desde su panel.\n`);
            emitRaw('\n\n---DONE---\n');
            return false;
        }

        // 2. Puerto interno único para este servidor. Los stacks que Nginx sirve
        //    directamente (WordPress con PHP-FPM) no escuchan en ningún puerto,
        //    así que no se les reserva ninguno: la columna queda a NULL, que el
        //    índice UNIQUE (server_id, port) admite tantas veces como haga falta.
        let port: number | null = null;
        if (stack.needsPort) {
            try {
                port = await this.allocatePort(server.id, dto.port);
            } catch (error: any) {
                emitRaw(`\n❌ ${error.message}\n`);
                emitRaw('\n\n---DONE---\n');
                return false;
            }
            if (String(port) !== String(dto.port)) {
                emitRaw(`ℹ️ Puerto interno asignado por el panel: ${port}.\n`);
            }
        }

        // 3. Inyectar token de GitHub en la URL del repo (solo en stacks que clonan)
        let repoUrlWithToken = dto.repo || '';
        let userEmail = '';
        const userRes = await this.db.query('SELECT github_token, email FROM users WHERE id = $1', [userId]);
        const userData = userRes.rows[0];
        if (stack.usesGit && userData?.github_token && repoUrlWithToken.startsWith('https://github.com/')) {
            repoUrlWithToken = repoUrlWithToken.replace('https://github.com/', `https://${userData.github_token}@github.com/`);
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

        // 4. Verificar propagación DNS si se usa Let's Encrypt
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

        // 5. Datos derivados del stack (credenciales de BD, rutas de instalación…).
        //    Se calculan UNA vez y se persisten, para que editar o eliminar el
        //    sitio más tarde use exactamente los mismos valores.
        const ctx: DeployContext = {
            server,
            safeName,
            projectPath,
            data: { ...dto, port: port === null ? '' : String(port), repo: repoUrlWithToken, userEmail },
        };
        ctx.stackConfig = stack.prepare(ctx);

        // 6. Reservar el sitio en la base de datos ANTES de desplegar. La fila es
        //    la reserva: mientras exista, ningún otro despliegue puede tomar este
        //    puerto ni este nombre. Si el despliegue falla, se retira.
        let websiteId: string;
        try {
            const inserted = await this.db.query(`
                INSERT INTO websites (server_id, user_id, repo_url, name, install_command, build_command, start_command, port, domain, entry_point, env_vars, use_letsencrypt, setup_www_alias, stack, stack_config)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING id
            `, [
                server.id, userId, dto.repo || '', dto.name, dto.installCommand, dto.buildCommand,
                dto.startCommand, port, dto.domain, dto.entryPoint, dto.envVars,
                dto.useLetsEncrypt || false, dto.setupWwwAlias || false, stackId,
                JSON.stringify(ctx.stackConfig ?? {}),
            ]);
            websiteId = inserted.rows[0].id;
        } catch (error: any) {
            this.logger.error(`No se pudo reservar el sitio ${safeName} en ${server.ip}: ${error.message}`);
            emit(`\n❌ No se pudo reservar el sitio: otro despliegue tomó el nombre o el puerto justo ahora.\n`);
            emit(`   Vuelve a intentarlo.\n`);
            emit('\n\n---DONE---\n');
            return false;
        }

        // 7. Ensamblar el script: parte de la app (según stack) + Nginx/Certbot
        //    (común) + el ajuste que solo se puede hacer sabiendo si el
        //    certificado se emitió (la URL que WordPress guarda en su BD).
        const fullScript = [
            stack.buildAppScript(ctx),
            buildNginxScript(ctx, stack.serve(ctx)),
            stack.postNginxScript(ctx),
        ].join('\n');

        // 8. Ejecutar por SSH transmitiendo logs en vivo
        try {
            await this.ssh.executeCommand(server, fullScript, emit);
            emit('\n\n---DONE---\n');
        } catch (error: any) {
            this.logger.error(`Error desplegando ${safeName} (${stackId}) en ${server.ip}: ${error.message}`);
            emit(`\n❌ Error de despliegue: ${error.message}\n`);
            // Liberar la reserva para que el nombre y el puerto vuelvan a estar libres.
            await this.db.query('DELETE FROM websites WHERE id = $1', [websiteId])
                .catch((e) => this.logger.error(`No se pudo liberar la reserva ${websiteId}: ${e}`));
            emit('\n\n---DONE---\n');
            return false;
        }

        return true;
    }

    /** Migración ad-hoc: garantiza que existan las columnas de la tabla websites. */
    async ensureWebsitesColumns(): Promise<void> {
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
                -- Datos derivados propios de cada stack (credenciales de la base
                -- de datos de WordPress, ruta de instalación, URL del sitio…).
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='websites' AND column_name='stack_config') THEN
                    ALTER TABLE websites ADD COLUMN stack_config JSONB;
                END IF;
            END $$;
        `);

        // El puerto era VARCHAR: como entero se puede comparar contra un rango y
        // se puede indexar de forma única por servidor.
        await this.db.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='websites' AND column_name='port' AND data_type <> 'integer') THEN
                    ALTER TABLE websites
                        ALTER COLUMN port TYPE INT
                        USING NULLIF(regexp_replace(port::text, '[^0-9]', '', 'g'), '')::int;
                END IF;
            END $$;
        `);

        // Las dos garantías que hacen posible el multi-sitio. Si la tabla ya
        // arrastra duplicados de antes, se avisa y se sigue: el panel funciona
        // igual, solo pierde la protección frente a despliegues simultáneos.
        await this.db.query(`
            DO $$
            BEGIN
                BEGIN
                    ALTER TABLE websites ADD CONSTRAINT websites_server_port_uniq UNIQUE (server_id, port);
                EXCEPTION
                    WHEN duplicate_table OR duplicate_object THEN NULL;
                    WHEN unique_violation THEN
                        RAISE WARNING 'websites: hay puertos duplicados en un mismo servidor; revisalos para activar websites_server_port_uniq.';
                END;
                BEGIN
                    ALTER TABLE websites ADD CONSTRAINT websites_server_name_uniq UNIQUE (server_id, name);
                EXCEPTION
                    WHEN duplicate_table OR duplicate_object THEN NULL;
                    WHEN unique_violation THEN
                        RAISE WARNING 'websites: hay nombres duplicados en un mismo servidor; revisalos para activar websites_server_name_uniq.';
                END;
            END $$;
        `);
    }
}
