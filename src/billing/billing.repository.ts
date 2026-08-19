import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SubscriptionRecord } from './subscription-access';

export interface SubscriptionUpsert {
    subscriptionId: string;
    customerId: string;
    status: string;
    priceId: string;
    productId: string;
    scheduledChangeAction: string | null;
    scheduledChangeAt: string | null;
    nextBilledAt: string | null;
}

export interface TransactionUpsert {
    transactionId: string;
    customerId: string | null;
    subscriptionId: string | null;
    status: string;
    amount: string | null;
    currencyCode: string | null;
    billedAt: string | null;
    paymentType: string | null;
    cardBrand: string | null;
    cardLast4: string | null;
    cardExpiryMonth: number | null;
    cardExpiryYear: number | null;
}

/** Datos no sensibles de la tarjeta con la que se pago. */
export interface PaymentMethodSummary {
    type: string | null;
    cardBrand: string | null;
    cardLast4: string | null;
    cardExpiryMonth: number | null;
    cardExpiryYear: number | null;
}

/**
 * Acceso a las tablas espejo de Paddle.
 *
 * Todas las escrituras son UPSERT sobre el ID de Paddle, así que reprocesar un
 * evento converge al mismo estado en vez de duplicar filas.
 */
@Injectable()
export class BillingRepository {
    constructor(private readonly db: DatabaseService) { }

    // ── Deduplicación de eventos ──────────────────────────────────────────

    async hasProcessedEvent(eventId: string): Promise<boolean> {
        const result = await this.db.query(
            'SELECT 1 FROM paddle_webhook_events WHERE event_id = $1',
            [eventId],
        );
        return result.rowCount !== null && result.rowCount > 0;
    }

    async recordProcessedEvent(eventId: string, eventType: string, occurredAt: string | null) {
        await this.db.query(
            `INSERT INTO paddle_webhook_events (event_id, event_type, occurred_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (event_id) DO NOTHING`,
            [eventId, eventType, occurredAt],
        );
    }

    // ── Espejo ────────────────────────────────────────────────────────────

    async upsertCustomer(customerId: string, email: string) {
        await this.db.query(
            `INSERT INTO customers (customer_id, email)
             VALUES ($1, $2)
             ON CONFLICT (customer_id) DO UPDATE
                SET email = EXCLUDED.email, updated_at = NOW()`,
            [customerId, email],
        );
    }

    /**
     * Crea una fila mínima de cliente si todavía no existe.
     *
     * Hace falta porque `subscriptions.customer_id` tiene FK a `customers` y los
     * webhooks llegan desordenados: `subscription.created` puede adelantar a
     * `customer.created`. El email queda vacío hasta que llegue el evento del
     * cliente, que lo rellena sin pisar nada.
     */
    async ensureCustomerExists(customerId: string) {
        await this.db.query(
            `INSERT INTO customers (customer_id, email)
             VALUES ($1, '')
             ON CONFLICT (customer_id) DO NOTHING`,
            [customerId],
        );
    }

    async upsertSubscription(sub: SubscriptionUpsert) {
        await this.ensureCustomerExists(sub.customerId);
        await this.db.query(
            `INSERT INTO subscriptions (
                 subscription_id, customer_id, status, price_id, product_id,
                 scheduled_change_action, scheduled_change_at, next_billed_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (subscription_id) DO UPDATE SET
                 customer_id             = EXCLUDED.customer_id,
                 status                  = EXCLUDED.status,
                 price_id                = EXCLUDED.price_id,
                 product_id              = EXCLUDED.product_id,
                 scheduled_change_action = EXCLUDED.scheduled_change_action,
                 scheduled_change_at     = EXCLUDED.scheduled_change_at,
                 next_billed_at          = EXCLUDED.next_billed_at,
                 updated_at              = NOW()`,
            [
                sub.subscriptionId, sub.customerId, sub.status, sub.priceId, sub.productId,
                sub.scheduledChangeAction, sub.scheduledChangeAt, sub.nextBilledAt,
            ],
        );
    }

    async upsertTransaction(txn: TransactionUpsert) {
        await this.db.query(
            `INSERT INTO transactions (
                 transaction_id, customer_id, subscription_id, status,
                 amount, currency_code, billed_at,
                 payment_type, card_brand, card_last4, card_expiry_month, card_expiry_year
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (transaction_id) DO UPDATE SET
                 customer_id       = EXCLUDED.customer_id,
                 subscription_id   = EXCLUDED.subscription_id,
                 status            = EXCLUDED.status,
                 amount            = EXCLUDED.amount,
                 currency_code     = EXCLUDED.currency_code,
                 billed_at         = EXCLUDED.billed_at,
                 payment_type      = EXCLUDED.payment_type,
                 card_brand        = EXCLUDED.card_brand,
                 card_last4        = EXCLUDED.card_last4,
                 card_expiry_month = EXCLUDED.card_expiry_month,
                 card_expiry_year  = EXCLUDED.card_expiry_year,
                 updated_at        = NOW()`,
            [
                txn.transactionId, txn.customerId, txn.subscriptionId, txn.status,
                txn.amount, txn.currencyCode, txn.billedAt,
                txn.paymentType, txn.cardBrand, txn.cardLast4,
                txn.cardExpiryMonth, txn.cardExpiryYear,
            ],
        );
    }

    // ── Lecturas ──────────────────────────────────────────────────────────

    /** Puente app ↔ Paddle: del email del usuario autenticado al `ctm_...`. */
    async findCustomerIdByEmail(email: string): Promise<string | null> {
        const result = await this.db.query(
            `SELECT customer_id FROM customers
             WHERE LOWER(email) = LOWER($1) AND email <> ''
             ORDER BY created_at DESC
             LIMIT 1`,
            [email],
        );
        return result.rows[0]?.customer_id ?? null;
    }

    async findSubscriptionsByCustomer(customerId: string): Promise<SubscriptionRecord[]> {
        const result = await this.db.query(
            `SELECT * FROM subscriptions WHERE customer_id = $1 ORDER BY created_at DESC`,
            [customerId],
        );
        return result.rows as SubscriptionRecord[];
    }

    /**
     * Método de pago del último cobro del cliente.
     *
     * Se lee de `transactions` y no de `subscriptions` a propósito: una
     * transacción puede llegar antes que su suscripción, y así no se pierde el
     * dato por el desorden de los webhooks.
     */
    async findLatestPaymentMethod(customerId: string): Promise<PaymentMethodSummary | null> {
        const result = await this.db.query(
            `SELECT payment_type, card_brand, card_last4, card_expiry_month, card_expiry_year
             FROM transactions
             WHERE customer_id = $1 AND card_last4 IS NOT NULL
             ORDER BY billed_at DESC NULLS LAST, created_at DESC
             LIMIT 1`,
            [customerId],
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
            type: row.payment_type,
            cardBrand: row.card_brand,
            cardLast4: row.card_last4,
            cardExpiryMonth: row.card_expiry_month,
            cardExpiryYear: row.card_expiry_year,
        };
    }

    /** La suscripción más reciente del cliente, que es la que gobierna el acceso. */
    async findLatestSubscription(customerId: string): Promise<SubscriptionRecord | null> {
        const rows = await this.findSubscriptionsByCustomer(customerId);
        return rows[0] ?? null;
    }
}
