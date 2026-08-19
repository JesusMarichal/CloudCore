import type { Request } from 'express';
export declare class GeoController {
    getGeo(req: Request): {
        countryCode: string | null;
    };
}
