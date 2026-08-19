import { Injectable, Logger } from '@nestjs/common';
import {
    EventName,
    type CustomerCreatedEvent,
    type CustomerUpdatedEvent,
    type EventEntity,
    type SubscriptionCanceledEvent,
    type SubscriptionCreatedEvent,
    type SubscriptionUpdatedEvent,
    type TransactionCompletedEvent,
} from '@paddle/paddle-node-sdk';
import { BillingRepository } from './billing.repository';

type SubscriptionEvent =
    | SubscriptionCreatedEvent
    | SubscriptionUpdatedEvent
    | SubscriptionCanceledEvent;

@Injectable()
export class PaddleWebhookService {
    private readonly logger = new Logger(PaddleWebhookService.name);

    constructor(private readonly repo: BillingRepository) { }

    /**
     * Procesa un evento ya verificado.
     *
     * Doble red de idempotencia:
     *  1. Se descarta el evento si su `event_id` ya está en el registro. Paddle
     *     reenvía el mismo id en cada reintento.
     *  2. Todos los handlers son UPSERT sobre el ID de Paddle, así que aunque
     *     se procese dos veces el resultado converge en vez de duplicar.
     *
     * El registro se escribe *después* de procesar: si el proceso se cae a
     * medias, el reintento de Paddle vuelve a ejecutar el UPSERT, que es seguro.
     */
    async processEvent(event: EventEntity): Promise<void> {
        if (await this.repo.hasProcessedEvent(event.eventId)) {
            this.logger.debug(`Evento ${event.eventId} (${event.eventType}) ya procesado; se ignora.`);
            return;
        }

        switch (event.eventType) {
            case EventName.SubscriptionCreated:
            case EventName.SubscriptionUpdated:
            case EventName.SubscriptionCanceled:
                await this.handleSubscription(event);
                break;

            case EventName.CustomerCreated:
            case EventName.CustomerUpdated:
                await this.handleCustomer(event);
                break;

            case EventName.TransactionCompleted:
                await this.handleTransactionCompleted(event);
                break;

            default:
                // Suscrito a un evento sin handler todavía: no es un error.
                this.logger.debug(`Evento ${event.eventType} sin handler; se ignora.`);
                break;
        }

        await this.repo.recordProcessedEvent(event.eventId, event.eventType, event.occurredAt ?? null);
    }

    private async handleSubscription(event: SubscriptionEvent): Promise<void> {
        const sub = event.data;
        const firstItem = sub.items?.[0];

        await this.repo.upsertSubscription({
            subscriptionId: sub.id,
            customerId: sub.customerId,
            status: sub.status,
            priceId: firstItem?.price?.id ?? '',
            productId: firstItem?.price?.productId ?? '',
            // Un cambio programado (cancelar/pausar al final del periodo) se
            // guarda pero NO quita el acceso: ver grantsAccess().
            scheduledChangeAction: sub.scheduledChange?.action ?? null,
            scheduledChangeAt: sub.scheduledChange?.effectiveAt ?? null,
            // Fecha de corte que se le enseña al usuario.
            nextBilledAt: sub.nextBilledAt ?? null,
        });

        this.logger.log(`Suscripción ${sub.id} espejada con estado "${sub.status}".`);
    }

    private async handleCustomer(event: CustomerCreatedEvent | CustomerUpdatedEvent): Promise<void> {
        const customer = event.data;
        await this.repo.upsertCustomer(customer.id, customer.email);
        this.logger.log(`Cliente ${customer.id} espejado.`);
    }

    private async handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
        const txn = event.data;

        // Datos del metodo de pago del intento que salio bien. Paddle solo
        // expone marca, ultimos 4 y caducidad: nunca el numero ni el CVC.
        const paid = txn.payments?.find((p) => p.status === 'captured') ?? txn.payments?.[0];
        const card = paid?.methodDetails?.card ?? null;

        await this.repo.upsertTransaction({
            transactionId: txn.id,
            customerId: txn.customerId ?? null,
            subscriptionId: txn.subscriptionId ?? null,
            status: txn.status,
            amount: txn.details?.totals?.total ?? null,
            currencyCode: txn.currencyCode ?? null,
            billedAt: txn.billedAt ?? null,
            paymentType: paid?.methodDetails?.type ?? null,
            cardBrand: card?.type ?? null,
            cardLast4: card?.last4 ?? null,
            cardExpiryMonth: card?.expiryMonth ?? null,
            cardExpiryYear: card?.expiryYear ?? null,
        });
        this.logger.log(`Transacción ${txn.id} completada y registrada.`);
    }
}
