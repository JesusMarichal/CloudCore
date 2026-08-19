import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { GeoController } from './geo.controller';
import { PaddleIpAllowlistService } from './paddle-ip-allowlist.service';
import { PaddleWebhookController } from './paddle-webhook.controller';
import { PaddleWebhookService } from './paddle-webhook.service';

/**
 * Facturación con Paddle: detección de país para la página de precios, destino
 * de webhooks (espejo de clientes/suscripciones/transacciones) y portal de
 * cliente. DatabaseModule es global, así que no hace falta importarlo.
 */
@Module({
    controllers: [GeoController, PaddleWebhookController, BillingController],
    providers: [BillingRepository, PaddleWebhookService, PaddleIpAllowlistService],
    exports: [BillingRepository],
})
export class BillingModule { }
