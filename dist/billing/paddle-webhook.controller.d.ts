import { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaddleIpAllowlistService } from './paddle-ip-allowlist.service';
import { PaddleWebhookService } from './paddle-webhook.service';
export declare class PaddleWebhookController {
    private readonly webhooks;
    private readonly allowlist;
    private readonly logger;
    constructor(webhooks: PaddleWebhookService, allowlist: PaddleIpAllowlistService);
    handle(req: RawBodyRequest<Request>, signature?: string): Promise<{
        received: boolean;
    }>;
}
