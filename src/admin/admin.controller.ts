import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Delete,
    Get,
    Logger,
    NotFoundException,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AdminGuard } from '../common/auth/admin.guard';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { ListUsersQueryDto, UpdateUserDto } from './dto/admin.dto';

/**
 * Gestión de cuentas para el equipo de la plataforma.
 *
 * Todo lo de aquí exige rol ADMIN comprobado contra la base de datos en cada
 * petición (AdminGuard). Nunca se devuelven hashes de contraseña, secretos TOTP
 * ni tokens de GitHub: la vista de administración enseña estado, no credenciales.
 */
@Controller('admin')
@UseGuards(AdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AdminController {
    private readonly logger = new Logger(AdminController.name);

    constructor(private readonly db: DatabaseService) { }

    /**
     * Columnas seguras de `users`, más el recuento de instancias y la última
     * suscripción espejada de Paddle (enlazada por email, igual que hace
     * BillingRepository.findCustomerIdByEmail).
     */
    private static readonly USER_SELECT = `
        SELECT
            u.id, u.name, u.email, u.role, u.avatar, u.created_at,
            u.totp_enabled, u.failed_attempts, u.locked_until, u.onboarding_done,
            (u.github_token IS NOT NULL) AS has_github_token,
            COALESCE(srv.server_count, 0) AS server_count,
            sub.subscription_id, sub.status AS subscription_status, sub.price_id,
            sub.next_billed_at, sub.scheduled_change_action, sub.scheduled_change_at
        FROM users u
        LEFT JOIN (
            SELECT user_id, COUNT(*)::int AS server_count FROM servers GROUP BY user_id
        ) srv ON srv.user_id = u.id::text
        LEFT JOIN LATERAL (
            SELECT s.*
            FROM customers c
            JOIN subscriptions s ON s.customer_id = c.customer_id
            WHERE LOWER(c.email) = LOWER(u.email)
            ORDER BY s.updated_at DESC
            LIMIT 1
        ) sub ON true
    `;

    private toUser(row: any) {
        return {
            id: String(row.id),
            name: row.name,
            email: row.email,
            role: row.role === 'ADMIN' ? 'ADMIN' : 'CLIENT',
            avatar: row.avatar ?? null,
            createdAt: row.created_at,
            twoFactorEnabled: !!row.totp_enabled,
            failedAttempts: row.failed_attempts ?? 0,
            // Un `locked_until` ya vencido no es un bloqueo: solo cuenta si sigue en el futuro.
            lockedUntil: row.locked_until && new Date(row.locked_until) > new Date()
                ? row.locked_until
                : null,
            onboardingDone: !!row.onboarding_done,
            hasGithubToken: !!row.has_github_token,
            serverCount: row.server_count ?? 0,
            subscription: row.subscription_id
                ? {
                    subscriptionId: row.subscription_id,
                    status: row.subscription_status,
                    priceId: row.price_id,
                    nextBilledAt: row.next_billed_at,
                    scheduledChangeAction: row.scheduled_change_action,
                    scheduledChangeAt: row.scheduled_change_at,
                }
                : null,
        };
    }

    /** Relee una cuenta con el mismo shape que devuelve el listado. */
    private async findUser(id: string) {
        const result = await this.db.query(`${AdminController.USER_SELECT} WHERE u.id = $1`, [id]);
        return result.rows[0] ? this.toUser(result.rows[0]) : null;
    }

    private async countAdmins(): Promise<number> {
        const result = await this.db.query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'ADMIN'`);
        return result.rows[0].count;
    }

    // ── Listado ───────────────────────────────────────────────────────────────
    @Get('users')
    async listUsers(@Query() query: ListUsersQueryDto) {
        const filters: string[] = [];
        const params: any[] = [];

        if (query.search?.trim()) {
            params.push(`%${query.search.trim()}%`);
            filters.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
        }
        if (query.role && query.role !== 'ALL') {
            params.push(query.role);
            filters.push(`u.role = $${params.length}`);
        }

        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const result = await this.db.query(
            `${AdminController.USER_SELECT} ${where} ORDER BY u.created_at DESC`,
            params,
        );

        const users = result.rows.map((row) => this.toUser(row));
        return {
            users,
            total: users.length,
            admins: users.filter((u) => u.role === 'ADMIN').length,
            clients: users.filter((u) => u.role === 'CLIENT').length,
        };
    }

    // ── Ficha de una cuenta ───────────────────────────────────────────────────
    @Get('users/:id')
    async getUser(@Param('id', ParseUUIDPipe) id: string) {
        const user = await this.findUser(id);
        if (!user) throw new NotFoundException('Usuario no encontrado');

        const servers = await this.db.query(
            `SELECT id, name, ip, status, created_at FROM servers
              WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
            [id],
        );

        return {
            ...user,
            servers: servers.rows.map((s) => ({
                id: String(s.id),
                name: s.name,
                ip: s.ip,
                status: s.status,
                createdAt: s.created_at,
            })),
        };
    }

    // ── Edición (nombre, correo, rol) ─────────────────────────────────────────
    @Patch('users/:id')
    async updateUser(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: UpdateUserDto,
        @CurrentUser('sub') actorId: string,
    ) {
        const target = await this.db.query('SELECT id, name, email, role FROM users WHERE id = $1', [id]);
        const current = target.rows[0];
        if (!current) throw new NotFoundException('Usuario no encontrado');

        const currentRole = current.role === 'ADMIN' ? 'ADMIN' : 'CLIENT';
        const updates: string[] = [];
        const params: any[] = [];

        if (body.name !== undefined && body.name.trim() !== current.name) {
            const name = body.name.trim();
            if (!name) throw new BadRequestException('El nombre no puede quedar vacío');
            params.push(name);
            updates.push(`name = $${params.length}`);
        }

        if (body.email !== undefined && body.email.trim().toLowerCase() !== String(current.email).toLowerCase()) {
            const email = body.email.trim();
            const taken = await this.db.query(
                'SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2',
                [email, id],
            );
            if (taken.rows[0]) throw new ConflictException('Ya existe una cuenta con ese correo');
            params.push(email);
            updates.push(`email = $${params.length}`);
        }

        if (body.role !== undefined && body.role !== currentRole) {
            // Cambiarse el rol a uno mismo es la forma más fácil de perder el
            // panel sin querer: hace falta otro admin para degradarte.
            if (id === actorId) throw new BadRequestException('No puedes cambiar tu propio rol');
            // Nunca dejar la plataforma sin ningún administrador.
            if (currentRole === 'ADMIN' && (await this.countAdmins()) <= 1) {
                throw new BadRequestException('Debe quedar al menos un administrador');
            }
            params.push(body.role);
            updates.push(`role = $${params.length}`);
        }

        if (updates.length === 0) {
            return { success: true, changed: false, user: await this.findUser(id) };
        }

        params.push(id);
        await this.db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
        this.logger.log(`Cuenta ${current.email} actualizada (${updates.join(', ')}) por ${actorId}`);

        return { success: true, changed: true, user: await this.findUser(id) };
    }

    // ── Desbloqueo tras intentos fallidos ─────────────────────────────────────
    @Post('users/:id/unlock')
    async unlockUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('sub') actorId: string) {
        const result = await this.db.query(
            `UPDATE users SET failed_attempts = 0, locked_until = NULL
              WHERE id = $1 RETURNING email`,
            [id],
        );
        if (!result.rows[0]) throw new NotFoundException('Usuario no encontrado');
        this.logger.log(`Cuenta ${result.rows[0].email} desbloqueada por ${actorId}`);

        return { success: true, user: await this.findUser(id) };
    }

    // ── Baja definitiva ───────────────────────────────────────────────────────
    /**
     * Borra la cuenta y todo lo que cuelga de ella dentro del panel: avisos,
     * sitios, bases de datos, instancias, códigos de recuperación y registros a
     * medias. Va en una transacción: o cae todo, o no cae nada.
     *
     * Dos avisos importantes:
     *  - Esto NO desaprovisiona los VPS. Deja de gestionarlos el panel, pero las
     *    máquinas siguen vivas en el proveedor y hay que darlas de baja allí.
     *  - No se toca el espejo de facturación (customers/subscriptions/
     *    transactions): son datos que manda Paddle y el histórico contable.
     */
    @Delete('users/:id')
    async deleteUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('sub') actorId: string) {
        if (id === actorId) throw new BadRequestException('No puedes eliminar tu propia cuenta');

        const target = await this.db.query('SELECT id, email, role FROM users WHERE id = $1', [id]);
        const user = target.rows[0];
        if (!user) throw new NotFoundException('Usuario no encontrado');

        if (user.role === 'ADMIN' && (await this.countAdmins()) <= 1) {
            throw new BadRequestException('Debe quedar al menos un administrador');
        }

        // `user_notifications` y `database_instances` las crean otros
        // controladores de forma perezosa: pueden no existir todavía.
        const optional = await this.db.query(
            `SELECT to_regclass('public.user_notifications') IS NOT NULL AS notifications,
                    to_regclass('public.database_instances')  IS NOT NULL AS databases,
                    to_regclass('public.websites')            IS NOT NULL AS websites`,
        );
        const has = optional.rows[0];

        const removed = await this.db.transaction(async (query) => {
            if (has.notifications) {
                await query('DELETE FROM user_notifications WHERE user_id = $1', [id]);
            }
            // Los sitios y las bases pueden colgar del usuario o de una de sus
            // instancias; `websites.server_id` tiene FK, así que van antes.
            if (has.websites) {
                await query(
                    `DELETE FROM websites
                      WHERE user_id = $1
                         OR server_id IN (SELECT id FROM servers WHERE user_id = $1)`,
                    [id],
                );
            }
            if (has.databases) {
                await query(
                    `DELETE FROM database_instances
                      WHERE user_id = $1
                         OR server_id IN (SELECT id::text FROM servers WHERE user_id = $1)`,
                    [id],
                );
            }
            const servers = await query('DELETE FROM servers WHERE user_id = $1', [id]);
            await query('DELETE FROM password_resets WHERE LOWER(email) = LOWER($1)', [user.email]);
            await query('DELETE FROM pending_registrations WHERE LOWER(email) = LOWER($1)', [user.email]);
            await query('DELETE FROM users WHERE id = $1', [id]);
            return { servers: servers.rowCount ?? 0 };
        });

        this.logger.log(
            `Cuenta ${user.email} eliminada por ${actorId} (${removed.servers} instancia(s) desvinculada(s))`,
        );
        return { success: true, deletedId: id, email: user.email, removedServers: removed.servers };
    }
}
