import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { JwtPayload } from './jwt-payload.interface';

/**
 * Puerta de las rutas de administración. Corre después de JwtAuthGuard, así que
 * `request.user` ya viene del token verificado.
 *
 * El rol NO se da por bueno desde el JWT: se relee de la base de datos en cada
 * petición. El token dura 2h, así que fiarse de su `role` dejaría a un admin
 * degradado con permisos hasta que caduque su sesión. Una consulta por petición
 * es un precio barato para que quitar el rol tenga efecto inmediato.
 */
@Injectable()
export class AdminGuard implements CanActivate {
    constructor(private readonly db: DatabaseService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const user: JwtPayload | undefined = context.switchToHttp().getRequest().user;
        if (!user?.sub) throw new ForbiddenException('Requiere permisos de administrador');

        const result = await this.db.query('SELECT role FROM users WHERE id = $1', [user.sub]);
        if (result.rows[0]?.role !== 'ADMIN') {
            throw new ForbiddenException('Requiere permisos de administrador');
        }
        return true;
    }
}
