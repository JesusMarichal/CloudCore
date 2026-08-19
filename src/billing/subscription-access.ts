/** Estados de suscripción que devuelve Paddle. */
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled';

/** Fila de `subscriptions` tal y como la espeja el webhook. */
export interface SubscriptionRecord {
    subscription_id: string;
    customer_id: string;
    status: SubscriptionStatus | string;
    price_id: string;
    product_id: string;
    scheduled_change_action: string | null;
    scheduled_change_at: Date | null;
    next_billed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * Estados que dan acceso de pago.
 *
 * - `active` / `trialing`: acceso pleno.
 * - `past_due`: se mantiene el acceso durante el periodo de reintentos de cobro
 *   (dunning). La UI debe enseñar un aviso para actualizar el método de pago.
 * - `paused`: sin servicio.
 * - `canceled`: estado terminal, sin servicio.
 */
const ACCESS_GRANTING: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

/**
 * Decide si una suscripción da acceso ahora mismo.
 *
 * Importante: un `scheduled_change` pendiente (cancelar o pausar al final del
 * periodo) NO quita el acceso. Mientras el estado siga siendo `active`, el
 * cliente ya ha pagado ese periodo y le corresponde usarlo. El acceso solo se
 * retira cuando Paddle manda el evento que pone el estado en `canceled`
 * (o `paused`).
 */
export const grantsAccess = (subscription: SubscriptionRecord | null | undefined): boolean => {
    if (!subscription) return false;
    return ACCESS_GRANTING.has(subscription.status);
};

/**
 * Estado para pintar en la UI: distingue "activa" de "activa pero con una
 * cancelación o pausa ya programada".
 */
export type SubscriptionUiState =
    | 'no-subscription'
    | 'cancel-scheduled'
    | 'pause-scheduled'
    | SubscriptionStatus
    | string;

export const getSubscriptionUiState = (
    subscription: SubscriptionRecord | null | undefined,
): SubscriptionUiState => {
    if (!subscription) return 'no-subscription';
    if (subscription.scheduled_change_action === 'cancel') return 'cancel-scheduled';
    if (subscription.scheduled_change_action === 'pause') return 'pause-scheduled';
    return subscription.status;
};
