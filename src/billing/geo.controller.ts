import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/auth/public.decorator';

/**
 * Cabeceras de geolocalización que inyectan los CDN/edge más habituales.
 * Se consultan en orden: gana la primera que traiga un código válido.
 */
const GEO_HEADERS = [
    'x-vercel-ip-country',   // Vercel
    'cf-ipcountry',          // Cloudflare
    'x-appengine-country',   // Google App Engine
    'x-country-code',        // proxys genéricos / nginx con GeoIP
];

/** Cloudflare manda 'XX' cuando no sabe el país y 'T1' para tráfico Tor. */
const UNKNOWN_CODES = new Set(['XX', 'T1', 'ZZ']);

@Controller('billing')
export class GeoController {
    /**
     * País del visitante deducido de las cabeceras del edge.
     *
     * `countryCode: null` significa "no lo sabemos". En ese caso el frontend
     * NO debe mandar país a Paddle.PricePreview(): Paddle lo deduce de la IP
     * del visitante, que es más fiable que inventarse un valor por defecto.
     */
    @Public()
    @Get('geo')
    getGeo(@Req() req: Request): { countryCode: string | null } {
        for (const header of GEO_HEADERS) {
            const raw = req.headers[header];
            const value = Array.isArray(raw) ? raw[0] : raw;
            const code = value?.trim().toUpperCase();
            if (code && /^[A-Z]{2}$/.test(code) && !UNKNOWN_CODES.has(code)) {
                return { countryCode: code };
            }
        }
        return { countryCode: null };
    }
}
