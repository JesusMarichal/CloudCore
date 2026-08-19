import { Environment, LogLevel, Paddle } from '@paddle/paddle-node-sdk';

let client: Paddle | null = null;

/**
 * Cliente único del SDK de servidor de Paddle.
 *
 * Falla en voz alta si el entorno no está declarado: nunca se asume `sandbox`
 * por defecto, porque equivocarse de entorno significa cobrar (o no cobrar)
 * contra la cuenta que no toca.
 */
export const getPaddleClient = (): Paddle => {
    if (client) return client;

    const apiKey = process.env.API_PADDLE;
    const environment = process.env.PADDLE_ENV;

    if (!apiKey) {
        throw new Error('Falta API_PADDLE (API key de servidor de Paddle) en el .env.');
    }
    if (environment !== 'sandbox' && environment !== 'production') {
        throw new Error(
            `PADDLE_ENV debe valer "sandbox" o "production" (ahora vale ${JSON.stringify(environment)}).`,
        );
    }

    // Las API keys de sandbox llevan `_sdbx_`. Si no cuadra con el entorno
    // declarado, cortamos antes de hacer la primera llamada.
    const isSandboxKey = apiKey.includes('_sdbx_');
    if (environment === 'sandbox' && !isSandboxKey) {
        throw new Error('PADDLE_ENV=sandbox pero API_PADDLE no es una key de sandbox (`_sdbx_`).');
    }
    if (environment === 'production' && isSandboxKey) {
        throw new Error('PADDLE_ENV=production pero API_PADDLE es una key de sandbox (`_sdbx_`).');
    }

    client = new Paddle(apiKey, {
        environment: environment as Environment,
        logLevel: LogLevel.error,
    });
    return client;
};

/** Secreto de firma del destino de notificaciones. No es la API key. */
export const getWebhookSecret = (): string => {
    const secret = process.env.PADDLE_WEBHOOK_SECRET;
    if (!secret) {
        throw new Error(
            'Falta PADDLE_WEBHOOK_SECRET. Sin él no se puede verificar la firma de los webhooks.',
        );
    }
    return secret;
};
