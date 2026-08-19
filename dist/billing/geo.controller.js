"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoController = void 0;
const common_1 = require("@nestjs/common");
const public_decorator_1 = require("../common/auth/public.decorator");
const GEO_HEADERS = [
    'x-vercel-ip-country',
    'cf-ipcountry',
    'x-appengine-country',
    'x-country-code',
];
const UNKNOWN_CODES = new Set(['XX', 'T1', 'ZZ']);
let GeoController = class GeoController {
    getGeo(req) {
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
};
exports.GeoController = GeoController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('geo'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], GeoController.prototype, "getGeo", null);
exports.GeoController = GeoController = __decorate([
    (0, common_1.Controller)('billing')
], GeoController);
//# sourceMappingURL=geo.controller.js.map