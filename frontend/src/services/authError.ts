import type { TranslateFn } from '../i18n';

interface AxiosLikeError {
    code?: string;
    message?: string;
    response?: { status?: number; data?: { message?: string } };
}

export interface DescribedError {
    text: string;
    /**
     * - `validation`: el usuario puede arreglarlo (contraseña incorrecta,
     *   código caducado, correo ya registrado). Va dentro del formulario.
     * - `unavailable`: fallo nuestro (servidor caído, 500, red, timeout).
     *   Va como aviso flotante y desaparece solo.
     */
    kind: 'validation' | 'unavailable';
}

/**
 * Traduce el fallo de una llamada de autenticación a algo que el usuario pueda
 * entender, y dice dónde debe mostrarse.
 *
 * Nunca deja salir detalles técnicos: el error real va a la consola, que es
 * donde le sirve a quien desarrolla.
 */
export const describeAuthError = (error: unknown, t: TranslateFn): DescribedError => {
    const err = error as AxiosLikeError;
    const status = err?.response?.status;
    const serverMessage = err?.response?.data?.message;

    // 4xx con mensaje: el backend ha dicho algo concreto y accionable.
    // (400 datos inválidos, 401 credenciales, 409 correo duplicado, 422…)
    if (status && status >= 400 && status < 500 && serverMessage) {
        return { text: serverMessage, kind: 'validation' };
    }

    if (import.meta.env.DEV) {
        console.error('[auth] fallo no accionable por el usuario:', error);
    }
    return { text: t('auth.unavailable'), kind: 'unavailable' };
};
