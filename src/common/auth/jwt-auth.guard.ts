import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly jwtService: JwtService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) return true;

        const request = context.switchToHttp().getRequest();
        const token = this.extractToken(request);
        if (!token) throw new UnauthorizedException('Token no proporcionado');

        try {
            const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
            if (payload.scope === 'pre2fa') {
                throw new UnauthorizedException('Token no válido para esta operación');
            }
            request.user = payload;
            return true;
        } catch {
            throw new UnauthorizedException('Token inválido o expirado');
        }
    }

    private extractToken(request: any): string | null {
        const header = request.headers?.authorization;
        if (!header || typeof header !== 'string') return null;
        const [type, token] = header.split(' ');
        return type === 'Bearer' && token ? token : null;
    }
}
