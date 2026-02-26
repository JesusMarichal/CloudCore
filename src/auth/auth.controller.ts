import { Controller, Post, Body, HttpCode, HttpStatus, Logger, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcrypt';

@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    constructor(private readonly db: DatabaseService) { }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() body: any) {
        const { email, password } = body;

        this.logger.log(`Intento de login para: ${email}`);

        try {
            const result = await this.db.query(
                'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
                [email]
            );

            const user = result.rows[0];

            if (!user) {
                this.logger.warn(`Usuario no encontrado: ${email}`);
                return { success: false, message: 'Usuario no encontrado' };
            }

            // Verificar contraseña
            const isMatch = await bcrypt.compare(password, user.password);

            if (isMatch) {
                this.logger.log(`Login exitoso: ${email}`);
                return {
                    success: true,
                    message: 'Login exitoso',
                    user: {
                        id: String(user.id),
                        name: user.name,
                        email: user.email
                    }
                };
            }

            this.logger.warn(`Contraseña incorrecta para: ${email}`);
            return { success: false, message: 'Credenciales inválidas' };
        } catch (error) {
            this.logger.error('Error en el proceso de login:', error.message);
            throw new UnauthorizedException('Error al procesar el inicio de sesión');
        }
    }

    @Post('register')
    async register(@Body() body: any) {
        const { name, email, password } = body;

        try {
            // Verificar si ya existe
            const checkUser = await this.db.query('SELECT * FROM users WHERE email = $1', [email]);
            if (checkUser.rows.length > 0) {
                return { success: false, message: 'El correo ya está registrado' };
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const result = await this.db.query(
                'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
                [name, email, hashedPassword]
            );

            return {
                success: true,
                message: 'Usuario registrado con éxito',
                user: result.rows[0]
            };
        } catch (error) {
            this.logger.error('Error en registro:', error.message);
            return { success: false, message: 'No se pudo crear el usuario' };
        }
    }
}
