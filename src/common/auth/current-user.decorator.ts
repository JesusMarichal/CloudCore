import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from './jwt-payload.interface';

export const CurrentUser = createParamDecorator(
    (field: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const user: JwtPayload = request.user;
        return field ? user?.[field] : user;
    },
);
