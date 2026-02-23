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
            // Buscar usuario en la base de datos (Supabase)
            const result = await this.db.query(
                'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
                [email]
            );

            const user = result.rows[0];

            if (user) {
                // Verificar contraseña encriptada
                const isMatch = await bcrypt.compare(password, user.password);

                if (isMatch) {
                    this.logger.log('Login exitoso desde la BD');
                    return {
                        success: true,
                        message: 'Login exitoso',
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email
                        }
                    };
                }
            }

            this.logger.warn('Credenciales incorrectas');
            return { success: false, message: 'Credenciales inválidas' };

        } catch (error) {
            this.logger.error('Error en el proceso de login:', error.message);
            throw new UnauthorizedException('Error al procesar el inicio de sesión');
        }
    }
}
