"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingRepository = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
let BillingRepository = class BillingRepository {
    constructor(db) {
        this.db = db;
    }
    async hasProcessedEvent(eventId) {
        const result = await this.db.query('SELECT 1 FROM paddle_webhook_events WHERE event_id = $1', [eventId]);
        return result.rowCount !== null && result.rowCount > 0;
    }
    async recordProcessedEvent(eventId, eventType, occurredAt) {
        await this.db.query(`INSERT INTO paddle_webhook_events (event_id, event_type, occurred_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (event_id) DO NOTHING`, [eventId, eventType, occurredAt]);
    }
    async upsertCustomer(customerId, email) {
        await this.db.query(`INSERT INTO customers (customer_id, email)
             VALUES ($1, $2)
             ON CONFLICT (customer_id) DO UPDATE
                SET email = EXCLUDED.email, updated_at = NOW()`, [customerId, email]);
    }
    async ensureCustomerExists(customerId) {
        await this.db.query(`INSERT INTO customers (customer_id, email)
             VALUES ($1, '')
             ON CONFLICT (customer_id) DO NOTHING`, [customerId]);
    }
    async upsertSubscription(sub) {
        await this.ensureCustomerExists(sub.customerId);
        await this.db.query(`INSERT INTO subscriptions (
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
                 updated_at              = NOW()`, [
            sub.subscriptionId, sub.customerId, sub.status, sub.priceId, sub.productId,
            sub.scheduledChangeAction, sub.scheduledChangeAt, sub.nextBilledAt,
        ]);
    }
    async upsertTransaction(txn) {
        await this.db.query(`INSERT INTO transactions (
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
                 updated_at        = NOW()`, [
            txn.transactionId, txn.customerId, txn.subscriptionId, txn.status,
            txn.amount, txn.currencyCode, txn.billedAt,
            txn.paymentType, txn.cardBrand, txn.cardLast4,
            txn.cardExpiryMonth, txn.cardExpiryYear,
        ]);
    }
    async findCustomerIdByEmail(email) {
        const result = await this.db.query(`SELECT customer_id FROM customers
             WHERE LOWER(email) = LOWER($1) AND email <> ''
             ORDER BY created_at DESC
             LIMIT 1`, [email]);
        return result.rows[0]?.customer_id ?? null;
    }
    async findSubscriptionsByCustomer(customerId) {
        const result = await this.db.query(`SELECT * FROM subscriptions WHERE customer_id = $1 ORDER BY created_at DESC`, [customerId]);
        return result.rows;
    }
    async findLatestPaymentMethod(customerId) {
        const result = await this.db.query(`SELECT payment_type, card_brand, card_last4, card_expiry_month, card_expiry_year
             FROM transactions
             WHERE customer_id = $1 AND card_last4 IS NOT NULL
             ORDER BY billed_at DESC NULLS LAST, created_at DESC
             LIMIT 1`, [customerId]);
        const row = result.rows[0];
        if (!row)
            return null;
        return {
            type: row.payment_type,
            cardBrand: row.card_brand,
            cardLast4: row.card_last4,
            cardExpiryMonth: row.card_expiry_month,
            cardExpiryYear: row.card_expiry_year,
        };
    }
    async findLatestSubscription(customerId) {
        const rows = await this.findSubscriptionsByCustomer(customerId);
        return rows[0] ?? null;
    }
};
exports.BillingRepository = BillingRepository;
exports.BillingRepository = BillingRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], BillingRepository);
//# sourceMappingURL=billing.repository.js.map