export declare class MailService {
    private readonly logger;
    private readonly transporter;
    private readonly logoPath;
    constructor();
    sendVerificationCode(to: string, name: string, code: string): Promise<void>;
    sendPasswordResetLink(to: string, name: string, resetLink: string): Promise<void>;
    private logoAttachment;
}
