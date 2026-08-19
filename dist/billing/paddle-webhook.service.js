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
var PaddleWebhookService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaddleWebhookService = void 0;
const common_1 = require("@nestjs/common");
const paddle_node_sdk_1 = require("@paddle/paddle-node-sdk");
const billing_repository_1 = require("./billing.repository");
let PaddleWebhookService = PaddleWebhookService_1 = class PaddleWebhookService {
    constructor(repo) {
        this.repo = repo;
        this.logger = new common_1.Logger(PaddleWebhookService_1.name);
    }
    async processEvent(event) {
        if (await this.repo.hasProcessedEvent(event.eventId)) {
            this.logger.debug(`Evento ${event.eventId} (${event.eventType}) ya procesado; se ignora.`);
            return;
        }
        switch (event.eventType) {
            case paddle_node_sdk_1.EventName.SubscriptionCreated:
            case paddle_node_sdk_1.EventName.SubscriptionUpdated:
            case paddle_node_sdk_1.EventName.SubscriptionCanceled:
                await this.handleSubscription(event);
                break;
            case paddle_node_sdk_1.EventName.CustomerCreated:
            case paddle_node_sdk_1.EventName.CustomerUpdated:
                await this.handleCustomer(event);
                break;
            case paddle_node_sdk_1.EventName.TransactionCompleted:
                await this.handleTransactionCompleted(event);
                break;
            default:
                this.logger.debug(`Evento ${event.eventType} sin handler; se ignora.`);
                break;
        }
        await this.repo.recordProcessedEvent(event.eventId, event.eventType, event.occurredAt ?? null);
    }
    async handleSubscription(event) {
        const sub = event.data;
        const firstItem = sub.items?.[0];
        await this.repo.upsertSubscription({
            subscriptionId: sub.id,
            customerId: sub.customerId,
            status: sub.status,
            priceId: firstItem?.price?.id ?? '',
            productId: firstItem?.price?.productId ?? '',
            scheduledChangeAction: sub.scheduledChange?.action ?? null,
            scheduledChangeAt: sub.scheduledChange?.effectiveAt ?? null,
            nextBilledAt: sub.nextBilledAt ?? null,
        });
        this.logger.log(`Suscripción ${sub.id} espejada con estado "${sub.status}".`);
    }
    async handleCustomer(event) {
        const customer = event.data;
        await this.repo.upsertCustomer(customer.id, customer.email);
        this.logger.log(`Cliente ${customer.id} espejado.`);
    }
    async handleTransactionCompleted(event) {
        const txn = event.data;
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
};
exports.PaddleWebhookService = PaddleWebhookService;
exports.PaddleWebhookService = PaddleWebhookService = PaddleWebhookService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [billing_repository_1.BillingRepository])
], PaddleWebhookService);
//# sourceMappingURL=paddle-webhook.service.js.map