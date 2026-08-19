import { Controller, Get, Logger, Post } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { BillingRepository } from './billing.repository';
import { getPaddleClient } from './paddle.provider';
import { getSubscriptionUiState, grantsAccess } from './subscription-access';

@Controller('billing')
export class BillingController {
    private readonly logger = new Logger(BillingController.name);

    constructor(private readonly repo: BillingRepository) { }

    /**
     * Estado de suscripción del usuario autenticado, leído del espejo local.
     *
     * El customer_id se resuelve en el servidor desde el email del JWT; nunca
     * se acepta un identificador de cliente que venga del navegador.
     */
    @Get('subscription')
    async getSubscription(@CurrentUser('email') email: string) {
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
            // Se expone al frontend a proposito: Paddle Retain necesita el
            // customer_id de Paddle en `pwCustomer` al inicializar Paddle.js.
            // Solo se devuelve el del usuario autenticado, resuelto en servidor.
            customerId,
            hasAccess: grantsAccess(subscription),
            state: getSubscriptionUiState(subscription),
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

    /**
     * Crea una sesión del portal de cliente de Paddle y devuelve SOLO la URL.
     *
     * Las URLs son de un solo uso y caducan: se acuña una nueva en cada clic,
     * nunca se cachean. Del objeto de sesión no sale nada más (lleva el
     * customer_id y los deep links, que el navegador no necesita).
     */
    @Post('portal')
    async createPortalSession(@CurrentUser('email') email: string) {
        // El guard global ya exige JWT válido; esto cubre un token sin email.
        if (!email) {
            return { error: 'not-authenticated' as const };
        }

        const customerId = await this.repo.findCustomerIdByEmail(email);
        if (!customerId) {
            // Usuario registrado que aún no ha pasado por checkout: no existe
            // cliente en Paddle. Pasarle un id vacío al SDK daría un 400 opaco.
            return { error: 'no-paddle-customer' as const };
        }

        const subscriptions = await this.repo.findSubscriptionsByCustomer(customerId);
        const subscriptionIds = subscriptions.map((s) => s.subscription_id);

        const paddle = getPaddleClient();
        const session = await paddle.customerPortalSessions.create(customerId, subscriptionIds);

        return { url: session.urls.general.overview };
    }
}
