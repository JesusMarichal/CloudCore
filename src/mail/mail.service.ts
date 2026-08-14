import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as path from 'path';
import { buildVerificationEmailHtml } from './verification-email.template';
import { buildPasswordResetEmailHtml } from './password-reset-email.template';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private readonly transporter: nodemailer.Transporter;
    // favicon.png lives at the repo root; from dist/mail/mail.service.js,
    // '../../' lands back at the root — same math as DatabaseService's dotenv path.
    private readonly logoPath = path.join(__dirname, '../../favicon.png');

    constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
    }

    async sendVerificationCode(to: string, name: string, code: string): Promise<void> {
        const html = buildVerificationEmailHtml(name, code);
        const text =
            `Hola${name ? `, ${name}` : ''}\n\n` +
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
        } catch (error) {
            this.logger.error(`Error enviando correo de verificación a ${to}: ${error.message}`);
            throw error;
        }
    }

    async sendPasswordResetLink(to: string, name: string, resetLink: string): Promise<void> {
        const html = buildPasswordResetEmailHtml(name, resetLink);
        const text =
            `Hola${name ? `, ${name}` : ''}\n\n` +
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
        } catch (error) {
            this.logger.error(`Error enviando enlace de restablecimiento a ${to}: ${error.message}`);
            throw error;
        }
    }

    private logoAttachment() {
        return {
            filename: 'cloudcore-logo.png',
            path: this.logoPath,
            cid: 'cloudcore-logo',
            contentDisposition: 'inline' as const,
        };
    }
}
