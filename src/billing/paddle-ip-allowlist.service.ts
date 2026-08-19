import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 h

/**
 * Allowlist de las IPs desde las que Paddle entrega webhooks.
 *
 * La lista se descarga de la propia API de Paddle y NO se hardcodea: Paddle la
 * puede cambiar, y el endpoint es la fuente de verdad. Sandbox y producción
 * tienen listas distintas, así que se consulta el host del entorno activo.
 *
 * Esto es defensa en profundidad, no el control principal: quien de verdad
 * autentica la petición es la verificación de firma. Por eso, si la lista no se
 * puede descargar, se deja pasar y se avisa por log — perder todos los webhooks
 * sería peor que aceptar una petición que igualmente tiene que superar la firma.
 */
@Injectable()
export class PaddleIpAllowlistService implements OnModuleInit {
    private readonly logger = new Logger(PaddleIpAllowlistService.name);
    private cidrs: string[] = [];
    private lastFetch: Date | null = null;

    onModuleInit() {
        if (!this.enabled) {
            this.logger.log('Allowlist de IPs de Paddle desactivada (solo la firma protege el endpoint).');
            return;
        }
        // No bloquea el arranque: si falla, se reintenta en el siguiente refresco.
        void this.refresh();
        setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS).unref();
    }

    /**
     * Activa por defecto solo en producción. En sandbox se desactiva porque el
     * desarrollo local pasa por túneles (ngrok, Hookdeck…) y la IP de origen que
     * ve el servidor es la del túnel, no la de Paddle. Se puede forzar con
     * PADDLE_IP_ALLOWLIST=true|false.
     */
    get enabled(): boolean {
        const flag = process.env.PADDLE_IP_ALLOWLIST?.toLowerCase();
        if (flag === 'true') return true;
        if (flag === 'false') return false;
        return process.env.PADDLE_ENV === 'production';
    }

    private get ipsUrl(): string {
        return process.env.PADDLE_ENV === 'production'
            ? 'https://api.paddle.com/ips'
            : 'https://sandbox-api.paddle.com/ips';
    }

    async refresh(): Promise<void> {
        try {
            const res = await fetch(this.ipsUrl, { signal: AbortSignal.timeout(10_000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = (await res.json()) as { data?: { ipv4_cidrs?: string[] } };
            const cidrs = body.data?.ipv4_cidrs ?? [];
            if (!cidrs.length) throw new Error('la respuesta no trae ipv4_cidrs');

            this.cidrs = cidrs;
            this.lastFetch = new Date();
            this.logger.log(`Allowlist de Paddle actualizada: ${cidrs.length} rangos desde ${this.ipsUrl}`);
        } catch (error) {
            this.logger.error(
                `No se pudo descargar la allowlist de IPs de Paddle (${error.message}). ` +
                'Se dejan pasar las peticiones; la firma sigue verificándose.',
            );
        }
    }

    /**
     * @returns `true` si hay que aceptar la petición: porque la allowlist está
     * desactivada, porque todavía no se ha podido descargar, o porque la IP
     * está dentro de alguno de los rangos.
     */
    isAllowed(ip: string | undefined): boolean {
        if (!this.enabled) return true;
        if (!this.cidrs.length) return true; // sin lista no se bloquea nada
        if (!ip) return false;

        const normalized = normalizeIpv4(ip);
        if (!normalized) return false;

        return this.cidrs.some((cidr) => ipv4InCidr(normalized, cidr));
    }

    get status() {
        return {
            enabled: this.enabled,
            source: this.ipsUrl,
            ranges: this.cidrs.length,
            lastFetch: this.lastFetch,
        };
    }
}

/** Node entrega las IPv4 como `::ffff:1.2.3.4` cuando el socket es IPv6. */
function normalizeIpv4(ip: string): string | null {
    const candidate = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(candidate) ? candidate : null;
}

function ipv4ToInt(ip: string): number | null {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Hoy Paddle publica solo /32 (IPs sueltas), pero se hace la comparación de
 * prefijo completa para no romper si algún día publican rangos más amplios.
 */
function ipv4InCidr(ip: string, cidr: string): boolean {
    const [base, bitsRaw] = cidr.split('/');
    const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

    const ipInt = ipv4ToInt(ip);
    const baseInt = ipv4ToInt(base);
    if (ipInt === null || baseInt === null) return false;

    if (bits === 0) return true;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
}
