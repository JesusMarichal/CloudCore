/**
 * Backfill del espejo de Paddle.
 *
 * Los webhooks solo cubren lo que pasa DESPUÉS de crear el destino de
 * notificaciones. Todo lo anterior —o lo ocurrido mientras el endpoint estuvo
 * caído más allá de la ventana de reintentos— nunca llega. Este script lee el
 * estado actual desde la API de Paddle y lo vuelca en las tablas locales.
 *
 * Es idempotente: mismos UPSERT que usa el handler de webhooks, así que se
 * puede ejecutar las veces que haga falta.
 *
 *   node scripts/paddle-backfill.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const { Environment, LogLevel, Paddle } = require('@paddle/paddle-node-sdk');

const environment = process.env.PADDLE_ENV;
if (environment !== 'sandbox' && environment !== 'production') {
    console.error(`PADDLE_ENV debe valer "sandbox" o "production" (ahora: ${environment}).`);
    process.exit(1);
}
if (!process.env.API_PADDLE) {
    console.error('Falta API_PADDLE.');
    process.exit(1);
}

const paddle = new Paddle(process.env.API_PADDLE, { environment, logLevel: LogLevel.error });

const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
});

async function upsertCustomer(id, email) {
    await pool.query(
        `INSERT INTO customers (customer_id, email)
         VALUES ($1, $2)
         ON CONFLICT (customer_id) DO UPDATE
            SET email = EXCLUDED.email, updated_at = NOW()`,
        [id, email ?? ''],
    );
}

async function upsertSubscription(sub) {
    const item = sub.items?.[0];
    await pool.query(
        `INSERT INTO customers (customer_id, email) VALUES ($1, '')
         ON CONFLICT (customer_id) DO NOTHING`,
        [sub.customerId],
    );
    await pool.query(
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
            sub.id, sub.customerId, sub.status,
            item?.price?.id ?? '', item?.price?.productId ?? '',
            sub.scheduledChange?.action ?? null,
            sub.scheduledChange?.effectiveAt ?? null,
            sub.nextBilledAt ?? null,
        ],
    );
}

async function upsertTransaction(txn) {
    // Mismos datos no sensibles de tarjeta que captura el handler de webhooks.
    const paid = txn.payments?.find((p) => p.status === 'captured') ?? txn.payments?.[0];
    const card = paid?.methodDetails?.card ?? null;

    await pool.query(
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
            txn.id, txn.customerId ?? null, txn.subscriptionId ?? null, txn.status,
            txn.details?.totals?.total ?? null, txn.currencyCode ?? null, txn.billedAt ?? null,
            paid?.methodDetails?.type ?? null, card?.type ?? null, card?.last4 ?? null,
            card?.expiryMonth ?? null, card?.expiryYear ?? null,
        ],
    );
}

(async () => {
    console.log(`Backfill contra Paddle (${environment})\n`);
    let customers = 0;
    let subscriptions = 0;
    let transactions = 0;

    for await (const customer of paddle.customers.list()) {
        await upsertCustomer(customer.id, customer.email);
        customers += 1;
    }
    console.log(`  clientes      ${customers}`);

    for await (const sub of paddle.subscriptions.list()) {
        await upsertSubscription(sub);
        subscriptions += 1;
    }
    console.log(`  suscripciones ${subscriptions}`);

    // Solo las completadas: son las que el handler de webhooks espeja.
    for await (const txn of paddle.transactions.list({ status: ['completed'] })) {
        await upsertTransaction(txn);
        transactions += 1;
    }
    console.log(`  transacciones ${transactions}`);

    console.log('\nListo. Los webhooks siguen siendo la fuente de verdad a partir de ahora.');
    await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
