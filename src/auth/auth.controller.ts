import { Controller, Post, Body, HttpCode, HttpStatus, Logger, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

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

@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    constructor(private readonly db: DatabaseService) { }

    // ── Login ─────────────────────────────────────────────────────────────────
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() body: any) {
        const { email, password } = body;
        if (!email || !password) return { success: false, message: 'Datos incompletos' };

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

            // Si 2FA está activo → pedir código
            if (user.totp_enabled && user.totp_secret) {
                return {
                    success: true,
                    require2FA: true,
                    userId: String(user.id),
                    message: 'Ingresa tu código de autenticación de 6 dígitos.'
                };
            }

            return {
                success: true,
                user: { id: String(user.id), name: user.name, email: user.email }
            };
        } catch (error) {
            this.logger.error('Error en login');
            throw new UnauthorizedException('Error al procesar la solicitud');
        }
    }

    // ── Verificar código 2FA durante login ────────────────────────────────────
    @Post('2fa/login')
    @HttpCode(HttpStatus.OK)
    async verify2FALogin(@Body() body: any) {
        const { userId, token } = body;
        if (!userId || !token) return { success: false, message: 'Datos incompletos' };

        try {
            const result = await this.db.query('SELECT * FROM users WHERE id=$1', [userId]);
            const user = result.rows[0];
            if (!user || !user.totp_enabled || !user.totp_secret)
                return { success: false, message: 'Usuario no válido' };

            if (!verifyTOTP(user.totp_secret, String(token)))
                return { success: false, message: 'Código 2FA incorrecto' };

            return {
                success: true,
                user: { id: String(user.id), name: user.name, email: user.email }
            };
        } catch {
            return { success: false, message: 'Error al verificar' };
        }
    }

    // ── Register ──────────────────────────────────────────────────────────────
    @Post('register')
    async register(@Body() body: any) {
        const { name, email, password } = body;
        if (!name || !email || !password)
            return { success: false, message: 'Todos los campos son obligatorios' };
        if (password.length < 8)
            return { success: false, message: 'La contraseña debe tener al menos 8 caracteres' };

        try {
            const check = await this.db.query('SELECT id FROM users WHERE email=$1', [email]);
            if (check.rows.length > 0)
                return { success: false, message: 'El correo ya está registrado' };

            const hashed = await bcrypt.hash(password, 12);
            const result = await this.db.query(
                'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
                [name, email, hashed]
            );
            return { success: true, message: 'Cuenta creada con éxito', user: result.rows[0] };
        } catch {
            return { success: false, message: 'No se pudo crear la cuenta' };
        }
    }

    // ── Cambiar contraseña ────────────────────────────────────────────────────
    @Post('change-password')
    async changePassword(@Body() body: any) {
        const { userId, currentPassword, newPassword } = body;
        if (!userId || !currentPassword || !newPassword)
            return { success: false, message: 'Datos incompletos' };
        if (newPassword.length < 8)
            return { success: false, message: 'La nueva contraseña debe tener al menos 8 caracteres' };
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
    async generate2FA(@Body() body: any) {
        const { userId } = body;
        if (!userId) return { success: false, message: 'Usuario requerido' };

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
    async enable2FA(@Body() body: any) {
        const { userId, token } = body;
        if (!userId || !token) return { success: false, message: 'Datos incompletos' };

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
    async disable2FA(@Body() body: any) {
        const { userId, password } = body;
        if (!userId || !password) return { success: false, message: 'Datos incompletos' };

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
    async get2FAStatus(@Body() body: any) {
        const { userId } = body;
        if (!userId) return { success: false };
        try {
            const result = await this.db.query(
                'SELECT totp_enabled FROM users WHERE id=$1', [userId]
            );
            return { success: true, enabled: !!result.rows[0]?.totp_enabled };
        } catch {
            return { success: false, enabled: false };
        }
    }
}
