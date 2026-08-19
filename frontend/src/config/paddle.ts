import type { Environments } from '@paddle/paddle-js';

export interface PaddleConfig {
    token: string;
    environment: Environments;
}

const MISSING_TOKEN =
    'Falta VITE_PADDLE_CLIENT_TOKEN. Copia frontend/.env.example a frontend/.env y ' +
    'pega el client-side token de Paddle (Developer tools > Authentication).';

/**
 * Lee la configuración de Paddle desde el entorno de Vite.
 *
 * Falla en voz alta a propósito: si el entorno no viene declarado de forma
 * explícita preferimos romper la pantalla de precios antes que hablar con la
 * cuenta de Paddle equivocada. Aquí no hay valores por defecto.
 */
export const readPaddleConfig = (): PaddleConfig => {
    const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
    const environment = import.meta.env.VITE_PADDLE_ENV;

    if (!token) throw new Error(MISSING_TOKEN);

    if (environment !== 'sandbox' && environment !== 'production') {
        throw new Error(
            `VITE_PADDLE_ENV debe valer "sandbox" o "production" (ahora vale ${JSON.stringify(environment)}).`,
        );
    }

    // Los tokens de sandbox empiezan por `test_`. Si el prefijo no cuadra con el
    // entorno declarado, Paddle.js fallaría con un error opaco: mejor cortar aquí.
    const looksLikeSandbox = token.startsWith('test_');
    if (environment === 'sandbox' && !looksLikeSandbox) {
        throw new Error('VITE_PADDLE_ENV=sandbox pero el token no empieza por "test_".');
    }
    if (environment === 'production' && looksLikeSandbox) {
        throw new Error('VITE_PADDLE_ENV=production pero el token es de sandbox ("test_...").');
    }

    return { token, environment };
};
