import { DatabaseService } from '../database/database.service';
import { SubscriptionRecord } from './subscription-access';
export interface SubscriptionUpsert {
    subscriptionId: string;
    customerId: string;
    status: string;
    priceId: string;
    productId: string;
    scheduledChangeAction: string | null;
    scheduledChangeAt: string | null;
    nextBilledAt: string | null;
}
export interface TransactionUpsert {
    transactionId: string;
    customerId: string | null;
    subscriptionId: string | null;
    status: string;
    amount: string | null;
    currencyCode: string | null;
    billedAt: string | null;
    paymentType: string | null;
    cardBrand: string | null;
    cardLast4: string | null;
    cardExpiryMonth: number | null;
    cardExpiryYear: number | null;
}
export interface PaymentMethodSummary {
    type: string | null;
    cardBrand: string | null;
    cardLast4: string | null;
    cardExpiryMonth: number | null;
    cardExpiryYear: number | null;
}
export declare class BillingRepository {
    private readonly db;
    constructor(db: DatabaseService);
    hasProcessedEvent(eventId: string): Promise<boolean>;
    recordProcessedEvent(eventId: string, eventType: string, occurredAt: string | null): Promise<void>;
    upsertCustomer(customerId: string, email: string): Promise<void>;
    ensureCustomerExists(customerId: string): Promise<void>;
    upsertSubscription(sub: SubscriptionUpsert): Promise<void>;
    upsertTransaction(txn: TransactionUpsert): Promise<void>;
    findCustomerIdByEmail(email: string): Promise<string | null>;
    findSubscriptionsByCustomer(customerId: string): Promise<SubscriptionRecord[]>;
    findLatestPaymentMethod(customerId: string): Promise<PaymentMethodSummary | null>;
    findLatestSubscription(customerId: string): Promise<SubscriptionRecord | null>;
}
