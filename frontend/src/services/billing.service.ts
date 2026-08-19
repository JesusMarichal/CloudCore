import { httpClient } from './httpClient';

export type SubscriptionUiState =
    | 'no-subscription' | 'cancel-scheduled' | 'pause-scheduled'
    | 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled' | string;

export interface SubscriptionSummary {
    subscriptionId: string;
    status: string;
    priceId: string;
    productId: string;
    scheduledChangeAction: string | null;
    scheduledChangeAt: string | null;
    /** Fecha de corte: cuándo se cobra el siguiente periodo. */
    nextBilledAt: string | null;
}

/** Datos no sensibles de la tarjeta. Paddle nunca expone el número ni el CVC. */
export interface PaymentMethodSummary {
    type: string | null;
    cardBrand: string | null;
    cardLast4: string | null;
    cardExpiryMonth: number | null;
    cardExpiryYear: number | null;
}

export interface BillingStatus {
    hasCustomer: boolean;
    /** customer_id de Paddle (`ctm_...`) del usuario autenticado, o null. */
    customerId: string | null;
    hasAccess: boolean;
    state: SubscriptionUiState;
    subscription: SubscriptionSummary | null;
    paymentMethod: PaymentMethodSummary | null;
}

export type PortalError = 'not-authenticated' | 'no-paddle-customer';

export const BillingService = {
    /** Estado de suscripción del usuario, leído del espejo local del backend. */
    async getStatus(): Promise<BillingStatus> {
        const { data } = await httpClient.get<BillingStatus>('/billing/subscription');
        return data;
    },

    /**
     * Acuña una sesión del portal de cliente. La URL es de un solo uso y
     * caduca, así que se pide una nueva en cada clic y no se cachea.
     */
    async createPortalSession(): Promise<{ url?: string; error?: PortalError }> {
        const { data } = await httpClient.post<{ url?: string; error?: PortalError }>(
            '/billing/portal', {},
        );
        return data;
    },
};
