import {
    BadRequestException,
    Controller,
    ForbiddenException,
    Headers,
    HttpCode,
    InternalServerErrorException,
    Logger,
    Post,
    RawBodyRequest,
    Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/auth/public.decorator';
import { getPaddleClient, getWebhookSecret } from './paddle.provider';
import { PaddleIpAllowlistService } from './paddle-ip-allowlist.service';
import { PaddleWebhookService } from './paddle-webhook.service';

@Controller('paddle')
export class PaddleWebhookController {
    private readonly logger = new Logger(PaddleWebhookController.name);

    constructor(
        private readonly webhooks: PaddleWebhookService,
        private readonly allowlist: PaddleIpAllowlistService,
    ) { }

    /**
     * Destino de notificaciones de Paddle.
     *
     * Contrato de entrega: Paddle solo da por entregado un 2xx. Cualquier otra
     * respuesta se reintenta. Por eso aquí NUNCA se devuelve 2xx si la firma no
     * valida o si el procesado revienta: eso marcaría el evento como entregado
     * y se perdería para siempre.
     */
    @Public()
    @Post('webhook')
    @HttpCode(200)
    async handle(
        @Req() req: RawBodyRequest<Request>,
        @Headers('paddle-signature') signature?: string,
    ) {
        // Primer filtro: origen. Solo se aplica si la allowlist está activa y
        // descargada (ver PaddleIpAllowlistService). Si rechaza aquí, Paddle
        // reintenta, así que un falso negativo por proxy mal configurado se
        // nota en los logs sin perder el evento de inmediato.
        if (!this.allowlist.isAllowed(req.ip)) {
            this.logger.warn(`Webhook rechazado: IP de origen ${req.ip} fuera de la allowlist de Paddle.`);
            throw new ForbiddenException('Origen no permitido.');
        }

        // El cuerpo CRUDO, no el JSON parseado: la firma se calcula sobre los
        // bytes exactos que mandó Paddle. Requiere `rawBody: true` en main.ts.
        const rawBody = req.rawBody?.toString('utf8');

        if (!signature || !rawBody) {
            throw new BadRequestException('Falta la cabecera paddle-signature o el cuerpo.');
        }

        try {
            const paddle = getPaddleClient();
            // Lanza si la firma no cuadra, si el timestamp caducó o si el
            // payload está mal formado. Verificar va SIEMPRE antes de tocar nada.
            const event = await paddle.webhooks.unmarshal(rawBody, getWebhookSecret(), signature);

            if (event) await this.webhooks.processEvent(event);

            return { received: true };
        } catch (error) {
            // No se puede distinguir "firma falsificada" de "secreto rotado" ni
            // de "fallo transitorio": todas lanzan igual. Se devuelve un único
            // no-2xx para que Paddle reintente y el caso recuperable se arregle solo.
            this.logger.error(`Fallo procesando webhook de Paddle: ${error.message}`);
            throw new InternalServerErrorException('Webhook no procesado.');
        }
    }
}
