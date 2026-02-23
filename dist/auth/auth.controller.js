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
var AuthController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const bcrypt = require("bcrypt");
let AuthController = AuthController_1 = class AuthController {
    constructor(db) {
        this.db = db;
        this.logger = new common_1.Logger(AuthController_1.name);
    }
    async login(body) {
        const { email, password } = body;
        this.logger.log(`Intento de login para: ${email}`);
        try {
            const result = await this.db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
            const user = result.rows[0];
            if (user) {
                const isMatch = await bcrypt.compare(password, user.password);
                if (isMatch) {
                    this.logger.log('Login exitoso desde la BD');
                    return {
                        success: true,
                        message: 'Login exitoso',
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email
                        }
                    };
                }
            }
            this.logger.warn('Credenciales incorrectas');
            return { success: false, message: 'Credenciales inválidas' };
        }
        catch (error) {
            this.logger.error('Error en el proceso de login:', error.message);
            throw new common_1.UnauthorizedException('Error al procesar el inicio de sesión');
        }
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
exports.AuthController = AuthController = AuthController_1 = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map