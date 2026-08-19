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
var PaddleWebhookController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaddleWebhookController = void 0;
const common_1 = require("@nestjs/common");
const public_decorator_1 = require("../common/auth/public.decorator");
const paddle_provider_1 = require("./paddle.provider");
const paddle_ip_allowlist_service_1 = require("./paddle-ip-allowlist.service");
const paddle_webhook_service_1 = require("./paddle-webhook.service");
let PaddleWebhookController = PaddleWebhookController_1 = class PaddleWebhookController {
    constructor(webhooks, allowlist) {
        this.webhooks = webhooks;
        this.allowlist = allowlist;
        this.logger = new common_1.Logger(PaddleWebhookController_1.name);
    }
    async handle(req, signature) {
        if (!this.allowlist.isAllowed(req.ip)) {
            this.logger.warn(`Webhook rechazado: IP de origen ${req.ip} fuera de la allowlist de Paddle.`);
            throw new common_1.ForbiddenException('Origen no permitido.');
        }
        const rawBody = req.rawBody?.toString('utf8');
        if (!signature || !rawBody) {
            throw new common_1.BadRequestException('Falta la cabecera paddle-signature o el cuerpo.');
        }
        try {
            const paddle = (0, paddle_provider_1.getPaddleClient)();
            const event = await paddle.webhooks.unmarshal(rawBody, (0, paddle_provider_1.getWebhookSecret)(), signature);
            if (event)
                await this.webhooks.processEvent(event);
            return { received: true };
        }
        catch (error) {
            this.logger.error(`Fallo procesando webhook de Paddle: ${error.message}`);
            throw new common_1.InternalServerErrorException('Webhook no procesado.');
        }
    }
};
exports.PaddleWebhookController = PaddleWebhookController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('webhook'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)('paddle-signature')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PaddleWebhookController.prototype, "handle", null);
exports.PaddleWebhookController = PaddleWebhookController = PaddleWebhookController_1 = __decorate([
    (0, common_1.Controller)('paddle'),
    __metadata("design:paramtypes", [paddle_webhook_service_1.PaddleWebhookService,
        paddle_ip_allowlist_service_1.PaddleIpAllowlistService])
], PaddleWebhookController);
//# sourceMappingURL=paddle-webhook.controller.js.map