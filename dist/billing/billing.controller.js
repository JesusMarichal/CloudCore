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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BillingController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../common/auth/current-user.decorator");
const billing_repository_1 = require("./billing.repository");
const paddle_provider_1 = require("./paddle.provider");
const subscription_access_1 = require("./subscription-access");
let BillingController = BillingController_1 = class BillingController {
    constructor(repo) {
        this.repo = repo;
        this.logger = new common_1.Logger(BillingController_1.name);
    }
    async getSubscription(email) {
        const customerId = await this.repo.findCustomerIdByEmail(email);
        if (!customerId) {
            return {
                hasCustomer: false, customerId: null, hasAccess: false,
                state: 'no-subscription', subscription: null, paymentMethod: null,
            };
        }
        const [subscription, paymentMethod] = await Promise.all([
            this.repo.findLatestSubscription(customerId),
            this.repo.findLatestPaymentMethod(customerId),
        ]);
        return {
            hasCustomer: true,
            customerId,
            hasAccess: (0, subscription_access_1.grantsAccess)(subscription),
            state: (0, subscription_access_1.getSubscriptionUiState)(subscription),
            subscription: subscription && {
                subscriptionId: subscription.subscription_id,
                status: subscription.status,
                priceId: subscription.price_id,
                productId: subscription.product_id,
                scheduledChangeAction: subscription.scheduled_change_action,
                scheduledChangeAt: subscription.scheduled_change_at,
                nextBilledAt: subscription.next_billed_at,
            },
            paymentMethod,
        };
    }
    async createPortalSession(email) {
        if (!email) {
            return { error: 'not-authenticated' };
        }
        const customerId = await this.repo.findCustomerIdByEmail(email);
        if (!customerId) {
            return { error: 'no-paddle-customer' };
        }
        const subscriptions = await this.repo.findSubscriptionsByCustomer(customerId);
        const subscriptionIds = subscriptions.map((s) => s.subscription_id);
        const paddle = (0, paddle_provider_1.getPaddleClient)();
        const session = await paddle.customerPortalSessions.create(customerId, subscriptionIds);
        return { url: session.urls.general.overview };
    }
};
exports.BillingController = BillingController;
__decorate([
    (0, common_1.Get)('subscription'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('email')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BillingController.prototype, "getSubscription", null);
__decorate([
    (0, common_1.Post)('portal'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('email')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BillingController.prototype, "createPortalSession", null);
exports.BillingController = BillingController = BillingController_1 = __decorate([
    (0, common_1.Controller)('billing'),
    __metadata("design:paramtypes", [billing_repository_1.BillingRepository])
], BillingController);
//# sourceMappingURL=billing.controller.js.map