import { initializePaddle } from '@paddle/paddle-js';
import type { Paddle } from '@paddle/paddle-js';
import { readPaddleConfig } from '../config/paddle';

let paddlePromise: Promise<Paddle> | null = null;

/**
 * Instancia única de Paddle.js.
 *
 * `initializePaddle()` solo puede llamarse una vez por página, así que
 * cacheamos la promesa. Si falla se limpia la caché para poder reintentar.
 */
export const getPaddle = (): Promise<Paddle> => {
    if (!paddlePromise) {
        paddlePromise = (async () => {
            const { token, environment } = readPaddleConfig();
            const paddle = await initializePaddle({ token, environment });
            if (!paddle) throw new Error('Paddle.js no se pudo inicializar.');
            return paddle;
        })().catch((error) => {
            paddlePromise = null;
            throw error;
        });
    }
    return paddlePromise;
};
