"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PaddleIpAllowlistService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaddleIpAllowlistService = void 0;
const common_1 = require("@nestjs/common");
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
let PaddleIpAllowlistService = PaddleIpAllowlistService_1 = class PaddleIpAllowlistService {
    constructor() {
        this.logger = new common_1.Logger(PaddleIpAllowlistService_1.name);
        this.cidrs = [];
        this.lastFetch = null;
    }
    onModuleInit() {
        if (!this.enabled) {
            this.logger.log('Allowlist de IPs de Paddle desactivada (solo la firma protege el endpoint).');
            return;
        }
        void this.refresh();
        setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS).unref();
    }
    get enabled() {
        const flag = process.env.PADDLE_IP_ALLOWLIST?.toLowerCase();
        if (flag === 'true')
            return true;
        if (flag === 'false')
            return false;
        return process.env.PADDLE_ENV === 'production';
    }
    get ipsUrl() {
        return process.env.PADDLE_ENV === 'production'
            ? 'https://api.paddle.com/ips'
            : 'https://sandbox-api.paddle.com/ips';
    }
    async refresh() {
        try {
            const res = await fetch(this.ipsUrl, { signal: AbortSignal.timeout(10_000) });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const body = (await res.json());
            const cidrs = body.data?.ipv4_cidrs ?? [];
            if (!cidrs.length)
                throw new Error('la respuesta no trae ipv4_cidrs');
            this.cidrs = cidrs;
            this.lastFetch = new Date();
            this.logger.log(`Allowlist de Paddle actualizada: ${cidrs.length} rangos desde ${this.ipsUrl}`);
        }
        catch (error) {
            this.logger.error(`No se pudo descargar la allowlist de IPs de Paddle (${error.message}). ` +
                'Se dejan pasar las peticiones; la firma sigue verificándose.');
        }
    }
    isAllowed(ip) {
        if (!this.enabled)
            return true;
        if (!this.cidrs.length)
            return true;
        if (!ip)
            return false;
        const normalized = normalizeIpv4(ip);
        if (!normalized)
            return false;
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
};
exports.PaddleIpAllowlistService = PaddleIpAllowlistService;
exports.PaddleIpAllowlistService = PaddleIpAllowlistService = PaddleIpAllowlistService_1 = __decorate([
    (0, common_1.Injectable)()
], PaddleIpAllowlistService);
function normalizeIpv4(ip) {
    const candidate = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(candidate) ? candidate : null;
}
function ipv4ToInt(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
        return null;
    return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}
function ipv4InCidr(ip, cidr) {
    const [base, bitsRaw] = cidr.split('/');
    const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32)
        return false;
    const ipInt = ipv4ToInt(ip);
    const baseInt = ipv4ToInt(base);
    if (ipInt === null || baseInt === null)
        return false;
    if (bits === 0)
        return true;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
}
//# sourceMappingURL=paddle-ip-allowlist.service.js.map