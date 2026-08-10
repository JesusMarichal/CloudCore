import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

/**
 * Módulo global de base de datos. Provee una única instancia de DatabaseService
 * (un solo pool de PostgreSQL) compartida por todos los módulos de la app.
 */
@Global()
@Module({
    providers: [DatabaseService],
    exports: [DatabaseService],
})
export class DatabaseModule { }
