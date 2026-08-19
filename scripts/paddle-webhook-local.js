/**
 * Arnés local de webhooks de Paddle.
 *
 * Paddle solo entrega a URLs públicas HTTPS, así que en local no puede llegarte
 * nada suyo. Este script firma payloads con el MISMO algoritmo y el MISMO
 * secreto (PADDLE_WEBHOOK_SECRET) y los manda a tu servidor: recorren
 * exactamente el mismo camino que un webhook real — cuerpo crudo, verificación
 * de firma, enrutado y UPSERT — sin necesidad de túnel.
 *
 * No sustituye a una prueba con Paddle de verdad (los payloads los construye
 * este script, no ellos), pero sirve para desarrollar el handler sin salir del
 * portátil.
 *
 * Uso:
 *   node scripts/paddle-webhook-local.js --dry     solo imprime, no envía nada
 *   node scripts/paddle-webhook-local.js           envía la secuencia completa
 *   node scripts/paddle-webhook-local.js --tamper  comprueba que se rechaza lo manipulado
 *
 * OJO: sin --dry esto escribe filas en customers / subscriptions / transactions
 * con IDs marcados como "localtest". Son datos de prueba: bórralos a mano si no
 * los quieres en el espejo.
 */
require('dotenv').config();
const crypto = require('crypto');

const ENDPOINT = process.env.WEBHOOK_URL || 'http://localhost:3000/paddle/webhook';
const SECRET = process.env.PADDLE_WEBHOOK_SECRET;
const DRY = process.argv.includes('--dry');
const TAMPER = process.argv.includes('--tamper');

if (!SECRET) {
    console.error('Falta PADDLE_WEBHOOK_SECRET en .env');
    process.exit(1);
}

/** IDs con la forma que usa Paddle (prefijo + 26 caracteres) pero marcados. */
const id = (prefix, n) => `${prefix}_01localtest${String(n).padStart(15, '0')}`;

const CUSTOMER = id('ctm', 1);
const SUBSCRIPTION = id('sub', 1);
const TRANSACTION = id('txn', 1);
const PRICE = 'pri_01m0c1r1qtvgwzj032rr2cev70';   // Pro mensual (sandbox)
const PRODUCT = 'pro_01m0c1r1mn892b85v3h2824q0h'; // Pro (sandbox)

const now = () => new Date().toISOString();
const plusDays = (d) => new Date(Date.now() + d * 864e5).toISOString();

const subscription = (status, scheduledChange = null) => ({
    id: SUBSCRIPTION,
    status,
    customer_id: CUSTOMER,
    address_id: id('add', 1),
    business_id: null,
    currency_code: 'USD',
    created_at: now(),
    updated_at: now(),
    started_at: now(),
    first_billed_at: now(),
    next_billed_at: plusDays(30),
    paused_at: null,
    canceled_at: status === 'canceled' ? now() : null,
    collection_mode: 'automatic',
    billing_details: null,
    current_billing_period: { starts_at: now(), ends_at: plusDays(30) },
    billing_cycle: { interval: 'month', frequency: 1 },
    scheduled_change: scheduledChange,
    items: [{
        status: 'active',
        quantity: 1,
        recurring: true,
        created_at: now(),
        updated_at: now(),
        previously_billed_at: now(),
        next_billed_at: plusDays(30),
        trial_dates: null,
        price: {
            id: PRICE,
            product_id: PRODUCT,
            description: 'Pro monthly USD',
            name: 'Mensual',
            type: 'standard',
            billing_cycle: { interval: 'month', frequency: 1 },
            trial_period: { interval: 'day', frequency: 7 },
            tax_mode: 'account_setting',
            unit_price: { amount: '800', currency_code: 'USD' },
            unit_price_overrides: [],
            quantity: { minimum: 1, maximum: 100 },
            status: 'active',
            custom_data: null,
        },
    }],
    custom_data: null,
    discount: null,
    management_urls: null,
});

/** Secuencia realista: alta en prueba, activa, cancelación programada, cancelada. */
const SEQUENCE = [
    ['customer.created', {
        id: CUSTOMER,
        email: 'localtest@cloudcore.lat',
        name: 'Local Test',
        status: 'active',
        marketing_consent: false,
        locale: 'es',
        custom_data: null,
        created_at: now(),
        updated_at: now(),
    }],
    ['subscription.created', subscription('trialing')],
    ['transaction.completed', {
        id: TRANSACTION,
        status: 'completed',
        customer_id: CUSTOMER,
        subscription_id: SUBSCRIPTION,
        address_id: id('add', 1),
        business_id: null,
        custom_data: null,
        currency_code: 'USD',
        origin: 'web',
        collection_mode: 'automatic',
        discount_id: null,
        billing_details: null,
        billing_period: { starts_at: now(), ends_at: plusDays(30) },
        items: [],
        details: {
            totals: {
                subtotal: '800', discount: '0', tax: '0', total: '800',
                credit: '0', balance: '0', grand_total: '800',
                fee: null, earnings: null, currency_code: 'USD',
            },
            // El SDK hace .map() sobre estos dos sin comprobar que existan:
            // si faltan, unmarshal revienta con un TypeError.
            tax_rates_used: [],
            line_items: [],
        },
        payments: [],
        checkout: null,
        created_at: now(),
        updated_at: now(),
        billed_at: now(),
    }],
    ['subscription.updated', subscription('active')],
    ['subscription.updated', subscription('active', {
        action: 'cancel', effective_at: plusDays(30), resume_at: null,
    })],
    ['subscription.canceled', subscription('canceled')],
];

const envelope = (type, data, n) => JSON.stringify({
    event_id: id('evt', 100 + n),
    event_type: type,
    occurred_at: now(),
    notification_id: id('ntf', 100 + n),
    data,
});

const sign = (raw) => {
    const ts = Math.floor(Date.now() / 1000);
    const h1 = crypto.createHmac('sha256', SECRET).update(`${ts}:${raw}`).digest('hex');
    return `ts=${ts};h1=${h1}`;
};

async function send(raw, signature) {
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'paddle-signature': signature },
        body: raw,
    });
    return `${res.status} ${(await res.text()).slice(0, 80)}`;
}

(async () => {
    if (TAMPER) {
        const raw = envelope('customer.updated', SEQUENCE[0][1], 999);
        console.log('firma invalida  ->', await send(raw, 'ts=1;h1=deadbeef'));
        console.log('body manipulado ->', await send(raw.replace('Local Test', 'Hacked'), sign(raw)));
        console.log('\nAmbos deben dar un codigo distinto de 2xx. Un 2xx aqui seria un fallo');
        console.log('grave: Paddle daria el evento por entregado y dejaria de reintentarlo.');
        return;
    }

    console.log(`Destino: ${ENDPOINT}${DRY ? '  (modo --dry, no se envia nada)' : ''}\n`);

    for (const [index, [type, data]] of SEQUENCE.entries()) {
        const raw = envelope(type, data, index);
        if (DRY) {
            console.log(`${String(index + 1).padStart(2)}. ${type.padEnd(24)} ${raw.length} bytes`);
            continue;
        }
        console.log(`${String(index + 1).padStart(2)}. ${type.padEnd(24)} -> ${await send(raw, sign(raw))}`);
    }

    if (!DRY) {
        console.log('\nReenviando el primer evento para comprobar la idempotencia...');
        const raw = envelope(SEQUENCE[0][0], SEQUENCE[0][1], 0);
        console.log(`    reenvio -> ${await send(raw, sign(raw))} (debe ser 200 y no duplicar filas)`);
    }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
