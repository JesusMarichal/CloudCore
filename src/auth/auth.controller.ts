import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';

@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() body: any) {
        const { email, password } = body;

        this.logger.log(`Intento de login para: ${email}`);

        // Credenciales estáticas (Email insensible a mayúsculas)
        const validEmail = 'Jesusmarichal0@gmail.com'.toLowerCase();
        const validPass = '28344112';

        if (email?.toLowerCase() === validEmail && password === validPass) {
            this.logger.log('Login exitoso');
            return { success: true, message: 'Login exitoso' };
        }

        this.logger.warn('Credenciales incorrectas');
        return { success: false, message: 'Credenciales inválidas' };
    }
}
