import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';

/**
 * Gestión de cuentas para el equipo de la plataforma. DatabaseModule es global,
 * así que no hace falta importarlo.
 */
@Module({
    controllers: [AdminController],
})
export class AdminModule { }
