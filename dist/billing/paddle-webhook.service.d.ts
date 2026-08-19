import { type EventEntity } from '@paddle/paddle-node-sdk';
import { BillingRepository } from './billing.repository';
export declare class PaddleWebhookService {
    private readonly repo;
    private readonly logger;
    constructor(repo: BillingRepository);
    processEvent(event: EventEntity): Promise<void>;
    private handleSubscription;
    private handleCustomer;
    private handleTransactionCompleted;
}
