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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AdminController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const admin_guard_1 = require("../common/auth/admin.guard");
const current_user_decorator_1 = require("../common/auth/current-user.decorator");
const admin_dto_1 = require("./dto/admin.dto");
let AdminController = AdminController_1 = class AdminController {
    constructor(db) {
        this.db = db;
        this.logger = new common_1.Logger(AdminController_1.name);
    }
    toUser(row) {
        return {
            id: String(row.id),
            name: row.name,
            email: row.email,
            role: row.role === 'ADMIN' ? 'ADMIN' : 'CLIENT',
            avatar: row.avatar ?? null,
            createdAt: row.created_at,
            twoFactorEnabled: !!row.totp_enabled,
            failedAttempts: row.failed_attempts ?? 0,
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
    async findUser(id) {
        const result = await this.db.query(`${AdminController_1.USER_SELECT} WHERE u.id = $1`, [id]);
        return result.rows[0] ? this.toUser(result.rows[0]) : null;
    }
    async countAdmins() {
        const result = await this.db.query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'ADMIN'`);
        return result.rows[0].count;
    }
    async listUsers(query) {
        const filters = [];
        const params = [];
        if (query.search?.trim()) {
            params.push(`%${query.search.trim()}%`);
            filters.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
        }
        if (query.role && query.role !== 'ALL') {
            params.push(query.role);
            filters.push(`u.role = $${params.length}`);
        }
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const result = await this.db.query(`${AdminController_1.USER_SELECT} ${where} ORDER BY u.created_at DESC`, params);
        const users = result.rows.map((row) => this.toUser(row));
        return {
            users,
            total: users.length,
            admins: users.filter((u) => u.role === 'ADMIN').length,
            clients: users.filter((u) => u.role === 'CLIENT').length,
        };
    }
    async getUser(id) {
        const user = await this.findUser(id);
        if (!user)
            throw new common_1.NotFoundException('Usuario no encontrado');
        const servers = await this.db.query(`SELECT id, name, ip, status, created_at FROM servers
              WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [id]);
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
    async updateUser(id, body, actorId) {
        const target = await this.db.query('SELECT id, name, email, role FROM users WHERE id = $1', [id]);
        const current = target.rows[0];
        if (!current)
            throw new common_1.NotFoundException('Usuario no encontrado');
        const currentRole = current.role === 'ADMIN' ? 'ADMIN' : 'CLIENT';
        const updates = [];
        const params = [];
        if (body.name !== undefined && body.name.trim() !== current.name) {
            const name = body.name.trim();
            if (!name)
                throw new common_1.BadRequestException('El nombre no puede quedar vacío');
            params.push(name);
            updates.push(`name = $${params.length}`);
        }
        if (body.email !== undefined && body.email.trim().toLowerCase() !== String(current.email).toLowerCase()) {
            const email = body.email.trim();
            const taken = await this.db.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2', [email, id]);
            if (taken.rows[0])
                throw new common_1.ConflictException('Ya existe una cuenta con ese correo');
            params.push(email);
            updates.push(`email = $${params.length}`);
        }
        if (body.role !== undefined && body.role !== currentRole) {
            if (id === actorId)
                throw new common_1.BadRequestException('No puedes cambiar tu propio rol');
            if (currentRole === 'ADMIN' && (await this.countAdmins()) <= 1) {
                throw new common_1.BadRequestException('Debe quedar al menos un administrador');
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
    async unlockUser(id, actorId) {
        const result = await this.db.query(`UPDATE users SET failed_attempts = 0, locked_until = NULL
              WHERE id = $1 RETURNING email`, [id]);
        if (!result.rows[0])
            throw new common_1.NotFoundException('Usuario no encontrado');
        this.logger.log(`Cuenta ${result.rows[0].email} desbloqueada por ${actorId}`);
        return { success: true, user: await this.findUser(id) };
    }
    async deleteUser(id, actorId) {
        if (id === actorId)
            throw new common_1.BadRequestException('No puedes eliminar tu propia cuenta');
        const target = await this.db.query('SELECT id, email, role FROM users WHERE id = $1', [id]);
        const user = target.rows[0];
        if (!user)
            throw new common_1.NotFoundException('Usuario no encontrado');
        if (user.role === 'ADMIN' && (await this.countAdmins()) <= 1) {
            throw new common_1.BadRequestException('Debe quedar al menos un administrador');
        }
        const optional = await this.db.query(`SELECT to_regclass('public.user_notifications') IS NOT NULL AS notifications,
                    to_regclass('public.database_instances')  IS NOT NULL AS databases,
                    to_regclass('public.websites')            IS NOT NULL AS websites`);
        const has = optional.rows[0];
        const removed = await this.db.transaction(async (query) => {
            if (has.notifications) {
                await query('DELETE FROM user_notifications WHERE user_id = $1', [id]);
            }
            if (has.websites) {
                await query(`DELETE FROM websites
                      WHERE user_id = $1
                         OR server_id IN (SELECT id FROM servers WHERE user_id = $1)`, [id]);
            }
            if (has.databases) {
                await query(`DELETE FROM database_instances
                      WHERE user_id = $1
                         OR server_id IN (SELECT id::text FROM servers WHERE user_id = $1)`, [id]);
            }
            const servers = await query('DELETE FROM servers WHERE user_id = $1', [id]);
            await query('DELETE FROM password_resets WHERE LOWER(email) = LOWER($1)', [user.email]);
            await query('DELETE FROM pending_registrations WHERE LOWER(email) = LOWER($1)', [user.email]);
            await query('DELETE FROM users WHERE id = $1', [id]);
            return { servers: servers.rowCount ?? 0 };
        });
        this.logger.log(`Cuenta ${user.email} eliminada por ${actorId} (${removed.servers} instancia(s) desvinculada(s))`);
        return { success: true, deletedId: id, email: user.email, removedServers: removed.servers };
    }
};
exports.AdminController = AdminController;
AdminController.USER_SELECT = `
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
__decorate([
    (0, common_1.Get)('users'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_dto_1.ListUsersQueryDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listUsers", null);
__decorate([
    (0, common_1.Get)('users/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getUser", null);
__decorate([
    (0, common_1.Patch)('users/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, admin_dto_1.UpdateUserDto, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateUser", null);
__decorate([
    (0, common_1.Post)('users/:id/unlock'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "unlockUser", null);
__decorate([
    (0, common_1.Delete)('users/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteUser", null);
exports.AdminController = AdminController = AdminController_1 = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true, transform: true })),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map