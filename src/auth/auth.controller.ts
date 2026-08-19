import { Controller, Post, Body, HttpCode, HttpStatus, Logger, UnauthorizedException, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Public } from '../common/auth/public.decorator';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { JwtPayload, UserRole } from '../common/auth/jwt-payload.interface';
import {
    LoginDto,
    Verify2FALoginDto,
    RegisterDto,
    VerifyRegisterDto,
    ForgotPasswordDto,
    ResetPasswordDto,
    ChangePasswordDto,
    Enable2FADto,
    Disable2FADto,
    UpdateAvatarDto,
} from './dto/auth.dto';

// ── TOTP (sin dependencias externas) ─────────────────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function b32ToBuffer(s: string): Buffer {
    let bits = 0, value = 0;
    const out: number[] = [];
    for (const c of s.toUpperCase().replace(/=+$/, '')) {
        const idx = B32.indexOf(c);
        if (idx < 0) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) { bits -= 8; out.push((value >> bits) & 0xff); }
    }
    return Buffer.from(out);
}

function generateSecret(): string {
    return Array.from(crypto.randomBytes(20)).map(b => B32[b % 32]).join('');
}

function getTOTP(secret: string, offset = 0): string {
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

function verifyTOTP(secret: string, token: string): boolean {
    return [-1, 0, 1].some(w => getTOTP(secret, w) === token);
}
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const PRE_2FA_EXPIRES_IN = '5m';
const REGISTER_CODE_EXPIRES_MIN = 15;
const RESET_TOKEN_EXPIRES_MIN = 5;

@Controller('auth')
@UseGuards(ThrottlerGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    constructor(
        private readonly db: DatabaseService,
        private readonly jwtService: JwtService,
        private readonly mail: MailService,
    ) { }

    private signToken(user: { id: string; name: string; email: string; role?: string }) {
        const payload: JwtPayload = {
            sub: String(user.id),
            email: user.email,
            name: user.name,
            role: (user.role as UserRole) || 'CLIENT',
            scope: 'full',
        };
        return this.jwtService.sign(payload);
    }

    // ── Login ─────────────────────────────────────────────────────────────────
    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() body: LoginDto) {
        const { email, password } = body;

        try {
            const result = await this.db.query(
                'SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]
            );
            const user = result.rows[0];
            if (!user) return { success: false, message: 'Credenciales inválidas' };

            // Bloqueo por intentos fallidos (solo si la columna existe)
            if (user.locked_until && new Date(user.locked_until) > new Date()) {
                const mins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
                return { success: false, message: `Cuenta bloqueada. Intenta de nuevo en ${mins} min.` };
            }


            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                // Intentar registrar el fallo (columnas pueden no existir aún)
                try {
                    const attempts = (user.failed_attempts || 0) + 1;
                    const lock = attempts >= MAX_ATTEMPTS
                        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null;
                    await this.db.query(
                        'UPDATE users SET failed_attempts=$1, locked_until=$2 WHERE id=$3',
                        [attempts, lock, user.id]
                    );
                    const remaining = MAX_ATTEMPTS - attempts;
                    if (attempts >= MAX_ATTEMPTS) {
                        return { success: false, message: `Cuenta bloqueada ${LOCK_MINUTES} min por múltiples intentos fallidos.` };
                    }
                    return { success: false, message: `Credenciales inválidas. ${remaining} intento(s) restante(s).` };
                } catch {
                    // Columnas de seguridad aún no migradas — devolver error genérico
                    return { success: false, message: 'Credenciales inválidas.' };
                }
            }

            // Restablecer intentos (no crítico si la columna no existe aún)
            try {
                await this.db.query(
                    'UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=$1', [user.id]
                );
            } catch { /* columnas aún no migradas, continuar */ }

            // Si 2FA está activo → pedir código, con un token de corta vida en vez del id en texto plano
            if (user.totp_enabled && user.totp_secret) {
                const preAuthToken = this.jwtService.sign(
                    { sub: String(user.id), email: user.email, name: user.name, role: user.role || 'CLIENT', scope: 'pre2fa' } as JwtPayload,
                    { expiresIn: PRE_2FA_EXPIRES_IN },
                );
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
        } catch (error) {
            this.logger.error('Error en login');
            throw new UnauthorizedException('Error al procesar la solicitud');
        }
    }

    // ── Verificar código 2FA durante login ────────────────────────────────────
    @Public()
    @Post('2fa/login')
    @HttpCode(HttpStatus.OK)
    async verify2FALogin(@Body() body: Verify2FALoginDto) {
        const { preAuthToken, token } = body;

        let userId: string;
        try {
            const payload = await this.jwtService.verifyAsync<JwtPayload>(preAuthToken);
            if (payload.scope !== 'pre2fa') {
                return { success: false, message: 'Token no válido para esta operación' };
            }
            userId = payload.sub;
        } catch {
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
        } catch {
            return { success: false, message: 'Error al verificar' };
        }
    }

    // ── Registro: paso 1, enviar código de verificación por correo ─────────────
    // La cuenta NO se crea aquí. Se guarda como "pendiente" (con el password ya
    // hasheado) hasta que el usuario confirme el código en /register/verify.
    @Public()
    @Post('register')
    async register(@Body() body: RegisterDto) {
        const { name, email, password, avatar } = body;

        try {
            const existing = await this.db.query(
                'SELECT id FROM users WHERE LOWER(email)=LOWER($1)', [email]
            );
            if (existing.rows.length > 0)
                return { success: false, message: 'El correo ya está registrado' };

            const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
            const codeHash = await bcrypt.hash(code, 10);
            const hashedPassword = await bcrypt.hash(password, 12);
            const expiresAt = new Date(Date.now() + REGISTER_CODE_EXPIRES_MIN * 60 * 1000);

            // ON CONFLICT: si ya había un registro pendiente para este correo (p. ej.
            // el usuario no recibió el código y volvió a enviar el formulario), se
            // reemplaza con un código nuevo en vez de fallar.
            await this.db.query(
                `INSERT INTO pending_registrations (email, name, password, code_hash, avatar, attempts, expires_at)
                 VALUES (LOWER($1), $2, $3, $4, $5, 0, $6)
                 ON CONFLICT (email) DO UPDATE
                 SET name = EXCLUDED.name,
                     password = EXCLUDED.password,
                     code_hash = EXCLUDED.code_hash,
                     avatar = EXCLUDED.avatar,
                     attempts = 0,
                     expires_at = EXCLUDED.expires_at,
                     created_at = NOW()`,
                [email, name, hashedPassword, codeHash, avatar || null, expiresAt]
            );

            await this.mail.sendVerificationCode(email, name, code);

            return {
                success: true,
                requiresVerification: true,
                message: 'Te enviamos un código de verificación a tu correo.',
            };
        } catch (error) {
            this.logger.error('Error en register: ' + error.message);
            return { success: false, message: 'No se pudo procesar el registro. Intenta de nuevo.' };
        }
    }

    // ── Registro: paso 2, verificar código y crear la cuenta ────────────────────
    @Public()
    @Post('register/verify')
    @HttpCode(HttpStatus.OK)
    async verifyRegister(@Body() body: VerifyRegisterDto) {
        const { email, code } = body;

        try {
            const result = await this.db.query(
                'SELECT * FROM pending_registrations WHERE LOWER(email)=LOWER($1)', [email]
            );
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
                await this.db.query(
                    'UPDATE pending_registrations SET attempts = attempts + 1 WHERE LOWER(email)=LOWER($1)', [email]
                );
                const remaining = MAX_ATTEMPTS - (pending.attempts + 1);
                return { success: false, message: `Código incorrecto. ${remaining} intento(s) restante(s).` };
            }

            // Puede haberse registrado el mismo correo por otra vía mientras esperaba el código.
            const dup = await this.db.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1)', [email]);
            if (dup.rows.length > 0) {
                await this.db.query('DELETE FROM pending_registrations WHERE LOWER(email)=LOWER($1)', [email]);
                return { success: false, message: 'El correo ya está registrado' };
            }

            const insertResult = await this.db.query(
                "INSERT INTO users (name, email, password, role, avatar) VALUES ($1, LOWER($2), $3, 'CLIENT', $4) RETURNING id, name, email, role, avatar",
                [pending.name, email, pending.password, pending.avatar || null]
            );
            await this.db.query('DELETE FROM pending_registrations WHERE LOWER(email)=LOWER($1)', [email]);

            const user = insertResult.rows[0];
            const token = this.signToken(user);
            return {
                success: true,
                message: 'Cuenta verificada y creada con éxito',
                token,
                user: { id: String(user.id), name: user.name, email: user.email, role: user.role || 'CLIENT', avatar: user.avatar || null },
            };
        } catch (error) {
            this.logger.error('Error en verifyRegister: ' + error.message);
            return { success: false, message: 'Error al verificar el código. Intenta de nuevo.' };
        }
    }

    // ── Olvidé mi contraseña: paso 1, enviar enlace por correo ──────────────────
    // Respuesta siempre genérica (éxito) exista o no el correo, para no filtrar
    // qué direcciones están registradas.
    @Public()
    @Post('forgot-password')
    @HttpCode(HttpStatus.OK)
    async forgotPassword(@Body() body: ForgotPasswordDto) {
        const { email } = body;
        const genericResponse = {
            success: true,
            message: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.',
        };

        try {
            const result = await this.db.query(
                'SELECT id, name, email FROM users WHERE LOWER(email)=LOWER($1)', [email]
            );
            const user = result.rows[0];
            if (user) {
                const token = crypto.randomBytes(32).toString('hex');
                const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
                const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_MIN * 60 * 1000);

                await this.db.query('DELETE FROM password_resets WHERE LOWER(email)=LOWER($1)', [email]);
                await this.db.query(
                    'INSERT INTO password_resets (email, token_hash, expires_at) VALUES (LOWER($1), $2, $3)',
                    [email, tokenHash, expiresAt]
                );

                const origin = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',')[0].trim();
                const resetLink = `${origin}/reset-password?token=${token}`;
                await this.mail.sendPasswordResetLink(user.email, user.name, resetLink);
            }
            return genericResponse;
        } catch (error) {
            this.logger.error('Error en forgotPassword: ' + error.message);
            return genericResponse;
        }
    }

    // ── Olvidé mi contraseña: paso 2, validar token y actualizar contraseña ─────
    @Public()
    @Post('reset-password')
    @HttpCode(HttpStatus.OK)
    async resetPassword(@Body() body: ResetPasswordDto) {
        const { token, newPassword } = body;

        try {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const result = await this.db.query(
                'SELECT * FROM password_resets WHERE token_hash=$1', [tokenHash]
            );
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
        } catch (error) {
            this.logger.error('Error en resetPassword: ' + error.message);
            return { success: false, message: 'No se pudo restablecer la contraseña. Intenta de nuevo.' };
        }
    }

    // ── Cambiar contraseña ────────────────────────────────────────────────────
    @Post('change-password')
    async changePassword(@CurrentUser('sub') userId: string, @Body() body: ChangePasswordDto) {
        const { currentPassword, newPassword } = body;
        if (currentPassword === newPassword)
            return { success: false, message: 'La nueva contraseña debe ser diferente a la actual' };

        try {
            const result = await this.db.query('SELECT * FROM users WHERE id=$1', [userId]);
            const user = result.rows[0];
            if (!user) return { success: false, message: 'Usuario no encontrado' };

            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) return { success: false, message: 'La contraseña actual es incorrecta' };

            const hashed = await bcrypt.hash(newPassword, 12);
            await this.db.query('UPDATE users SET password=$1 WHERE id=$2', [hashed, userId]);
            return { success: true, message: 'Contraseña actualizada correctamente' };
        } catch {
            return { success: false, message: 'Error al actualizar la contraseña' };
        }
    }

    // ── Generar secreto 2FA ───────────────────────────────────────────────────
    @Post('2fa/generate')
    async generate2FA(@CurrentUser('sub') userId: string) {
        try {
            const result = await this.db.query('SELECT email FROM users WHERE id=$1', [userId]);
            const user = result.rows[0];
            if (!user) return { success: false, message: 'Usuario no encontrado' };

            const secret = generateSecret();
            await this.db.query(
                'UPDATE users SET totp_secret=$1, totp_enabled=false WHERE id=$2',
                [secret, userId]
            );

            const label = encodeURIComponent(`CloudCore:${user.email}`);
            const issuer = encodeURIComponent('CloudCore');
            const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

            return { success: true, secret, otpauthUrl };
        } catch {
            return { success: false, message: 'Error generando 2FA' };
        }
    }

    // ── Activar 2FA (confirmar con código) ────────────────────────────────────
    @Post('2fa/enable')
    async enable2FA(@CurrentUser('sub') userId: string, @Body() body: Enable2FADto) {
        const { token } = body;

        try {
            const result = await this.db.query(
                'SELECT totp_secret FROM users WHERE id=$1', [userId]
            );
            const user = result.rows[0];
            if (!user?.totp_secret)
                return { success: false, message: 'Primero genera el código QR' };

            if (!verifyTOTP(user.totp_secret, String(token)))
                return { success: false, message: 'Código incorrecto. Inténtalo de nuevo.' };

            await this.db.query('UPDATE users SET totp_enabled=true WHERE id=$1', [userId]);
            return { success: true, message: '2FA activado correctamente' };
        } catch {
            return { success: false, message: 'Error al activar 2FA' };
        }
    }

    // ── Desactivar 2FA ────────────────────────────────────────────────────────
    @Post('2fa/disable')
    async disable2FA(@CurrentUser('sub') userId: string, @Body() body: Disable2FADto) {
        const { password } = body;

        try {
            const result = await this.db.query('SELECT * FROM users WHERE id=$1', [userId]);
            const user = result.rows[0];
            if (!user) return { success: false, message: 'Usuario no encontrado' };

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return { success: false, message: 'Contraseña incorrecta' };

            await this.db.query(
                'UPDATE users SET totp_enabled=false, totp_secret=NULL WHERE id=$1', [userId]
            );
            return { success: true, message: '2FA desactivado' };
        } catch {
            return { success: false, message: 'Error al desactivar 2FA' };
        }
    }

    // ── Estado 2FA ────────────────────────────────────────────────────────────
    @Post('2fa/status')
    async get2FAStatus(@CurrentUser('sub') userId: string) {
        try {
            const result = await this.db.query(
                'SELECT totp_enabled FROM users WHERE id=$1', [userId]
            );
            return { success: true, enabled: !!result.rows[0]?.totp_enabled };
        } catch {
            return { success: false, enabled: false };
        }
    }

    // ── Perfil del usuario autenticado ────────────────────────────────────────
    @Post('me')
    @HttpCode(HttpStatus.OK)
    async me(@CurrentUser('sub') userId: string) {
        try {
            const result = await this.db.query(
                'SELECT id, name, email, role, avatar, created_at FROM users WHERE id=$1', [userId]
            );
            const user = result.rows[0];
            if (!user) return { success: false, message: 'Usuario no encontrado' };

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
        } catch {
            return { success: false, message: 'Error al cargar el perfil' };
        }
    }

    // ── Cambiar foto de perfil ────────────────────────────────────────────────
    // Solo se persiste el ID del avatar (ej. 'av-07'); la imagen vive en el
    // catálogo del frontend, nunca en la base de datos.
    @Post('avatar')
    @HttpCode(HttpStatus.OK)
    async updateAvatar(@CurrentUser('sub') userId: string, @Body() body: UpdateAvatarDto) {
        try {
            const result = await this.db.query(
                'UPDATE users SET avatar=$1 WHERE id=$2 RETURNING id, name, email, role, avatar',
                [body.avatar, userId]
            );
            const user = result.rows[0];
            if (!user) return { success: false, message: 'Usuario no encontrado' };

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
        } catch {
            return { success: false, message: 'Error al actualizar la foto de perfil' };
        }
    }
}
