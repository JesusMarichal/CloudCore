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
var AuthController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const jwt_1 = require("@nestjs/jwt");
const database_service_1 = require("../database/database.service");
const mail_service_1 = require("../mail/mail.service");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const public_decorator_1 = require("../common/auth/public.decorator");
const current_user_decorator_1 = require("../common/auth/current-user.decorator");
const auth_dto_1 = require("./dto/auth.dto");
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32ToBuffer(s) {
    let bits = 0, value = 0;
    const out = [];
    for (const c of s.toUpperCase().replace(/=+$/, '')) {
        const idx = B32.indexOf(c);
        if (idx < 0)
            continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            out.push((value >> bits) & 0xff);
        }
    }
    return Buffer.from(out);
}
function generateSecret() {
    return Array.from(crypto.randomBytes(20)).map(b => B32[b % 32]).join('');
}
function getTOTP(secret, offset = 0) {
    const key = b32ToBuffer(secret);
    const t = Math.floor(Date.now() / 1000 / 30) + offset;
    const buf = Buffer.allocUnsafe(8);
    buf.writeUInt32BE(0, 0);
    buf.writeUInt32BE(t & 0xffffffff, 4);
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const o = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[o] & 0x7f) << 24) | ((hmac[o + 1] & 0xff) << 16) |
        ((hmac[o + 2] & 0xff) << 8) | (hmac[o + 3] & 0xff);
    return String(code % 1_000_000).padStart(6, '0');
}
function verifyTOTP(secret, token) {
    return [-1, 0, 1].some(w => getTOTP(secret, w) === token);
}
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const PRE_2FA_EXPIRES_IN = '5m';
const REGISTER_CODE_EXPIRES_MIN = 15;
const RESET_TOKEN_EXPIRES_MIN = 5;
let AuthController = AuthController_1 = class AuthController {
    constructor(db, jwtService, mail) {
        this.db = db;
        this.jwtService = jwtService;
        this.mail = mail;
        this.logger = new common_1.Logger(AuthController_1.name);
    }
    signToken(user) {
        const payload = {
            sub: String(user.id),
            email: user.email,
            name: user.name,
            role: user.role || 'CLIENT',
            scope: 'full',
        };
        return this.jwtService.sign(payload);
    }
    async login(body) {
        const { email, password } = body;
        try {
            const result = await this.db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
            const user = result.rows[0];
            if (!user)
                return { success: false, message: 'Credenciales inválidas' };
            if (user.locked_until && new Date(user.locked_until) > new Date()) {
                const mins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
                return { success: false, message: `Cuenta bloqueada. Intenta de nuevo en ${mins} min.` };
            }
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                try {
                    const attempts = (user.failed_attempts || 0) + 1;
                    const lock = attempts >= MAX_ATTEMPTS
                        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null;
                    await this.db.query('UPDATE users SET failed_attempts=$1, locked_until=$2 WHERE id=$3', [attempts, lock, user.id]);
                    const remaining = MAX_ATTEMPTS - attempts;
                    if (attempts >= MAX_ATTEMPTS) {
                        return { success: false, message: `Cuenta bloqueada ${LOCK_MINUTES} min por múltiples intentos fallidos.` };
                    }
                    return { success: false, message: `Credenciales inválidas. ${remaining} intento(s) restante(s).` };
                }
                catch {
                    return { success: false, message: 'Credenciales inválidas.' };
                }
            }
            try {
                await this.db.query('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=$1', [user.id]);
            }
            catch { }
            if (user.totp_enabled && user.totp_secret) {
                const preAuthToken = this.jwtService.sign({ sub: String(user.id), email: user.email, name: user.name, role: user.role || 'CLIENT', scope: 'pre2fa' }, { expiresIn: PRE_2FA_EXPIRES_IN });
                return {
                    success: true,
                    require2FA: true,
                    preAuthToken,
                    message: 'Ingresa tu código de autenticación de 6 dígitos.'
                };
            }
            const token = this.signToken(user);
            return {
                success: true,
                token,
                user: { id: String(user.id), name: user.name, email: user.email, role: user.role || 'CLIENT', avatar: user.avatar || null }
            };
        }
        catch (error) {
            this.logger.error('Error en login');
            throw new common_1.UnauthorizedException('Error al procesar la solicitud');
        }
    }
    async verify2FALogin(body) {
        const { preAuthToken, token } = body;
        let userId;
        try {
            const payload = await this.jwtService.verifyAsync(preAuthToken);
            if (payload.scope !== 'pre2fa') {
                return { success: false, message: 'Token no válido para esta operación' };
            }
            userId = payload.sub;
        }
        catch {
            return { success: false, message: 'Sesión de verificación expirada, inicia sesión de nuevo' };
        }
        try {
            const result = await this.db.query('SELECT * FROM users WHERE id=$1', [userId]);
            const user = result.rows[0];
            if (!user || !user.totp_enabled || !user.totp_secret)
                return { success: false, message: 'Usuario no válido' };
            if (!verifyTOTP(user.totp_secret, String(token)))
                return { success: false, message: 'Código 2FA incorrecto' };
            const fullToken = this.signToken(user);
            return {
                success: true,
                token: fullToken,
                user: { id: String(user.id), name: user.name, email: user.email, role: user.role || 'CLIENT', avatar: user.avatar || null }
            };
        }
        catch {
            return { success: false, message: 'Error al verificar' };
        }
    }
    async register(body) {
        const { name, email, password, avatar } = body;
        try {
            const existing = await this.db.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1)', [email]);
            if (existing.rows.length > 0)
                return { success: false, message: 'El correo ya está registrado' };
            const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
            const codeHash = await bcrypt.hash(code, 10);
            const hashedPassword = await bcrypt.hash(password, 12);
            const expiresAt = new Date(Date.now() + REGISTER_CODE_EXPIRES_MIN * 60 * 1000);
            await this.db.query(`INSERT INTO pending_registrations (email, name, password, code_hash, avatar, attempts, expires_at)
                 VALUES (LOWER($1), $2, $3, $4, $5, 0, $6)
                 ON CONFLICT (email) DO UPDATE
                 SET name = EXCLUDED.name,
                     password = EXCLUDED.password,
                     code_hash = EXCLUDED.code_hash,
                     avatar = EXCLUDED.avatar,
                     attempts = 0,
                     expires_at = EXCLUDED.expires_at,
                     created_at = NOW()`, [email, name, hashedPassword, codeHash, avatar || null, expiresAt]);
            await this.mail.sendVerificationCode(email, name, code);
            return {
                success: true,
                requiresVerification: true,
                message: 'Te enviamos un código de verificación a tu correo.',
            };
        }
        catch (error) {
            this.logger.error('Error en register: ' + error.message);
            return { success: false, message: 'No se pudo procesar el registro. Intenta de nuevo.' };
        }
    }
    async verifyRegister(body) {
        const { email, code } = body;
        try {
            const result = await this.db.query('SELECT * FROM pending_registrations WHERE LOWER(email)=LOWER($1)', [email]);
            const pending = result.rows[0];
            if (!pending)
                return { success: false, message: 'No hay un registro pendiente para este correo. Regístrate de nuevo.' };
            if (new Date(pending.expires_at) < new Date()) {
                await this.db.query('DELETE FROM pending_registrations WHERE LOWER(email)=LOWER($1)', [email]);
                return { success: false, message: 'El código expiró. Regístrate de nuevo.' };
            }
            if (pending.attempts >= MAX_ATTEMPTS) {
                await this.db.query('DELETE FROM pending_registrations WHERE LOWER(email)=LOWER($1)', [email]);
                return { success: false, message: 'Demasiados intentos incorrectos. Regístrate de nuevo.' };
            }
            const isMatch = await bcrypt.compare(code, pending.code_hash);
            if (!isMatch) {
                await this.db.query('UPDATE pending_registrations SET attempts = attempts + 1 WHERE LOWER(email)=LOWER($1)', [email]);
                const remaining = MAX_ATTEMPTS - (pending.attempts + 1);
                return { success: false, message: `Código incorrecto. ${remaining} intento(s) restante(s).` };
            }
            const dup = await this.db.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1)', [email]);
            if (dup.rows.length > 0) {
                await this.db.query('DELETE FROM pending_registrations WHERE LOWER(email)=LOWER($1)', [email]);
                return { success: false, message: 'El correo ya está registrado' };
            }
            const insertResult = await this.db.query("INSERT INTO users (name, email, password, role, avatar) VALUES ($1, LOWER($2), $3, 'CLIENT', $4) RETURNING id, name, email, role, avatar", [pending.name, email, pending.password, pending.avatar || null]);
            await this.db.query('DELETE FROM pending_registrations WHERE LOWER(email)=LOWER($1)', [email]);
            const user = insertResult.rows[0];
            const token = this.signToken(user);
            return {
                success: true,
                message: 'Cuenta verificada y creada con éxito',
                token,
                user: { id: String(user.id), name: user.name, email: user.email, role: user.role || 'CLIENT', avatar: user.avatar || null },
            };
        }
        catch (error) {
            this.logger.error('Error en verifyRegister: ' + error.message);
            return { success: false, message: 'Error al verificar el código. Intenta de nuevo.' };
        }
    }
    async forgotPassword(body) {
        const { email } = body;
        const genericResponse = {
            success: true,
            message: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.',
        };
        try {
            const result = await this.db.query('SELECT id, name, email FROM users WHERE LOWER(email)=LOWER($1)', [email]);
            const user = result.rows[0];
            if (user) {
                const token = crypto.randomBytes(32).toString('hex');
                const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
                const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_MIN * 60 * 1000);
                await this.db.query('DELETE FROM password_resets WHERE LOWER(email)=LOWER($1)', [email]);
                await this.db.query('INSERT INTO password_resets (email, token_hash, expires_at) VALUES (LOWER($1), $2, $3)', [email, tokenHash, expiresAt]);
                const origin = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',')[0].trim();
                const resetLink = `${origin}/reset-password?token=${token}`;
                await this.mail.sendPasswordResetLink(user.email, user.name, resetLink);
            }
            return genericResponse;
        }
        catch (error) {
            this.logger.error('Error en forgotPassword: ' + error.message);
            return genericResponse;
        }
    }
    async resetPassword(body) {
        const { token, newPassword } = body;
        try {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const result = await this.db.query('SELECT * FROM password_resets WHERE token_hash=$1', [tokenHash]);
            const reset = result.rows[0];
            if (!reset)
                return { success: false, message: 'El enlace no es válido o ya fue utilizado.' };
            if (new Date(reset.expires_at) < new Date()) {
                await this.db.query('DELETE FROM password_resets WHERE token_hash=$1', [tokenHash]);
                return { success: false, message: 'El enlace expiró. Solicita uno nuevo.' };
            }
            const hashed = await bcrypt.hash(newPassword, 12);
            await this.db.query('UPDATE users SET password=$1 WHERE LOWER(email)=LOWER($2)', [hashed, reset.email]);
            await this.db.query('DELETE FROM password_resets WHERE token_hash=$1', [tokenHash]);
            return { success: true, message: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
        }
        catch (error) {
            this.logger.error('Error en resetPassword: ' + error.message);
            return { success: false, message: 'No se pudo restablecer la contraseña. Intenta de nuevo.' };
        }
    }
    async changePassword(userId, body) {
        const { currentPassword, newPassword } = body;
        if (currentPassword === newPassword)
            return { success: false, message: 'La nueva contraseña debe ser diferente a la actual' };
        try {
            const result = await this.db.query('SELECT * FROM users WHERE id=$1', [userId]);
            const user = result.rows[0];
            if (!user)
                return { success: false, message: 'Usuario no encontrado' };
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch)
                return { success: false, message: 'La contraseña actual es incorrecta' };
            const hashed = await bcrypt.hash(newPassword, 12);
            await this.db.query('UPDATE users SET password=$1 WHERE id=$2', [hashed, userId]);
            return { success: true, message: 'Contraseña actualizada correctamente' };
        }
        catch {
            return { success: false, message: 'Error al actualizar la contraseña' };
        }
    }
    async generate2FA(userId) {
        try {
            const result = await this.db.query('SELECT email FROM users WHERE id=$1', [userId]);
            const user = result.rows[0];
            if (!user)
                return { success: false, message: 'Usuario no encontrado' };
            const secret = generateSecret();
            await this.db.query('UPDATE users SET totp_secret=$1, totp_enabled=false WHERE id=$2', [secret, userId]);
            const label = encodeURIComponent(`CloudCore:${user.email}`);
            const issuer = encodeURIComponent('CloudCore');
            const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
            return { success: true, secret, otpauthUrl };
        }
        catch {
            return { success: false, message: 'Error generando 2FA' };
        }
    }
    async enable2FA(userId, body) {
        const { token } = body;
        try {
            const result = await this.db.query('SELECT totp_secret FROM users WHERE id=$1', [userId]);
            const user = result.rows[0];
            if (!user?.totp_secret)
                return { success: false, message: 'Primero genera el código QR' };
            if (!verifyTOTP(user.totp_secret, String(token)))
                return { success: false, message: 'Código incorrecto. Inténtalo de nuevo.' };
            await this.db.query('UPDATE users SET totp_enabled=true WHERE id=$1', [userId]);
            return { success: true, message: '2FA activado correctamente' };
        }
        catch {
            return { success: false, message: 'Error al activar 2FA' };
        }
    }
    async disable2FA(userId, body) {
        const { password } = body;
        try {
            const result = await this.db.query('SELECT * FROM users WHERE id=$1', [userId]);
            const user = result.rows[0];
            if (!user)
                return { success: false, message: 'Usuario no encontrado' };
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch)
                return { success: false, message: 'Contraseña incorrecta' };
            await this.db.query('UPDATE users SET totp_enabled=false, totp_secret=NULL WHERE id=$1', [userId]);
            return { success: true, message: '2FA desactivado' };
        }
        catch {
            return { success: false, message: 'Error al desactivar 2FA' };
        }
    }
    async get2FAStatus(userId) {
        try {
            const result = await this.db.query('SELECT totp_enabled FROM users WHERE id=$1', [userId]);
            return { success: true, enabled: !!result.rows[0]?.totp_enabled };
        }
        catch {
            return { success: false, enabled: false };
        }
    }
    async me(userId) {
        try {
            const result = await this.db.query('SELECT id, name, email, role, avatar, created_at FROM users WHERE id=$1', [userId]);
            const user = result.rows[0];
            if (!user)
                return { success: false, message: 'Usuario no encontrado' };
            return {
                success: true,
                user: {
                    id: String(user.id),
                    name: user.name,
                    email: user.email,
                    role: user.role || 'CLIENT',
                    avatar: user.avatar || null,
                    createdAt: user.created_at,
                },
            };
        }
        catch {
            return { success: false, message: 'Error al cargar el perfil' };
        }
    }
    async updateAvatar(userId, body) {
        try {
            const result = await this.db.query('UPDATE users SET avatar=$1 WHERE id=$2 RETURNING id, name, email, role, avatar', [body.avatar, userId]);
            const user = result.rows[0];
            if (!user)
                return { success: false, message: 'Usuario no encontrado' };
            return {
                success: true,
                message: 'Foto de perfil actualizada',
                user: {
                    id: String(user.id),
                    name: user.name,
                    email: user.email,
                    role: user.role || 'CLIENT',
                    avatar: user.avatar || null,
                },
            };
        }
        catch {
            return { success: false, message: 'Error al actualizar la foto de perfil' };
        }
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.LoginDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('2fa/login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.Verify2FALoginDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verify2FALogin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RegisterDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('register/verify'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.VerifyRegisterDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyRegister", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('forgot-password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.ForgotPasswordDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('reset-password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.ResetPasswordDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resetPassword", null);
__decorate([
    (0, common_1.Post)('change-password'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, auth_dto_1.ChangePasswordDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Post)('2fa/generate'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "generate2FA", null);
__decorate([
    (0, common_1.Post)('2fa/enable'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, auth_dto_1.Enable2FADto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "enable2FA", null);
__decorate([
    (0, common_1.Post)('2fa/disable'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, auth_dto_1.Disable2FADto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "disable2FA", null);
__decorate([
    (0, common_1.Post)('2fa/status'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "get2FAStatus", null);
__decorate([
    (0, common_1.Post)('me'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
__decorate([
    (0, common_1.Post)('avatar'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, current_user_decorator_1.CurrentUser)('sub')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, auth_dto_1.UpdateAvatarDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "updateAvatar", null);
exports.AuthController = AuthController = AuthController_1 = __decorate([
    (0, common_1.Controller)('auth'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ whitelist: true, transform: true })),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        jwt_1.JwtService,
        mail_service_1.MailService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map