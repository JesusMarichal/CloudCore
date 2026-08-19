export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled';
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
export declare const grantsAccess: (subscription: SubscriptionRecord | null | undefined) => boolean;
export type SubscriptionUiState = 'no-subscription' | 'cancel-scheduled' | 'pause-scheduled' | SubscriptionStatus | string;
export declare const getSubscriptionUiState: (subscription: SubscriptionRecord | null | undefined) => SubscriptionUiState;
