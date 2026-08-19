import { BillingRepository } from './billing.repository';
export declare class BillingController {
    private readonly repo;
    private readonly logger;
    constructor(repo: BillingRepository);
    getSubscription(email: string): Promise<{
        hasCustomer: boolean;
        customerId: string;
        hasAccess: boolean;
        state: string;
        subscription: {
            subscriptionId: string;
            status: string;
            priceId: string;
            productId: string;
            scheduledChangeAction: string;
            scheduledChangeAt: Date;
            nextBilledAt: Date;
        };
        paymentMethod: import("./billing.repository").PaymentMethodSummary;
    }>;
    createPortalSession(email: string): Promise<{
        error: "not-authenticated";
        url?: undefined;
    } | {
        error: "no-paddle-customer";
        url?: undefined;
    } | {
        url: string;
        error?: undefined;
    }>;
}
