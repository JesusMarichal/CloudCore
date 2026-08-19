import { OnModuleInit } from '@nestjs/common';
export declare class PaddleIpAllowlistService implements OnModuleInit {
    private readonly logger;
    private cidrs;
    private lastFetch;
    onModuleInit(): void;
    get enabled(): boolean;
    private get ipsUrl();
    refresh(): Promise<void>;
    isAllowed(ip: string | undefined): boolean;
    get status(): {
        enabled: boolean;
        source: string;
        ranges: number;
        lastFetch: Date;
    };
}
