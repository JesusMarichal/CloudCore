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
var MailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailService = void 0;
const common_1 = require("@nestjs/common");
const nodemailer = require("nodemailer");
const path = require("path");
const verification_email_template_1 = require("./verification-email.template");
const password_reset_email_template_1 = require("./password-reset-email.template");
let MailService = MailService_1 = class MailService {
    constructor() {
        this.logger = new common_1.Logger(MailService_1.name);
        this.logoPath = path.join(__dirname, '../../favicon.png');
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
    }
    async sendVerificationCode(to, name, code) {
        const html = (0, verification_email_template_1.buildVerificationEmailHtml)(name, code);
        const text = `Hola${name ? `, ${name}` : ''}\n\n` +
            `Tu código de verificación de CloudCore es: ${code}\n\n` +
            `Este código expira en 15 minutos. Si no solicitaste esta cuenta, ignora este mensaje.\n\n` +
            `— CloudCore`;
        try {
            await this.transporter.sendMail({
                from: `"CloudCore" <${process.env.EMAIL_USER}>`,
                to,
                subject: 'Tu código de verificación de CloudCore',
                text,
                html,
                attachments: [this.logoAttachment()],
            });
            this.logger.log(`Código de verificación enviado a ${to}`);
        }
        catch (error) {
            this.logger.error(`Error enviando correo de verificación a ${to}: ${error.message}`);
            throw error;
        }
    }
    async sendPasswordResetLink(to, name, resetLink) {
        const html = (0, password_reset_email_template_1.buildPasswordResetEmailHtml)(name, resetLink);
        const text = `Hola${name ? `, ${name}` : ''}\n\n` +
            `Recibimos una solicitud para restablecer tu contraseña de CloudCore.\n` +
            `Este enlace es válido por 5 minutos:\n${resetLink}\n\n` +
            `Si no solicitaste este cambio, ignora este mensaje — tu contraseña actual seguirá funcionando.\n\n` +
            `— CloudCore`;
        try {
            await this.transporter.sendMail({
                from: `"CloudCore" <${process.env.EMAIL_USER}>`,
                to,
                subject: 'Restablece tu contraseña de CloudCore',
                text,
                html,
                attachments: [this.logoAttachment()],
            });
            this.logger.log(`Enlace de restablecimiento enviado a ${to}`);
        }
        catch (error) {
            this.logger.error(`Error enviando enlace de restablecimiento a ${to}: ${error.message}`);
            throw error;
        }
    }
    logoAttachment() {
        return {
            filename: 'cloudcore-logo.png',
            path: this.logoPath,
            cid: 'cloudcore-logo',
            contentDisposition: 'inline',
        };
    }
};
exports.MailService = MailService;
exports.MailService = MailService = MailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], MailService);
//# sourceMappingURL=mail.service.js.map