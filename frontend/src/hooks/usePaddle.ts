import { useEffect, useState } from 'react';
import type { Paddle } from '@paddle/paddle-js';
import { getPaddle } from '../services/paddle.service';

interface UsePaddleResult {
    paddle: Paddle | null;
    /** Mensaje de configuración inválida. Es para el desarrollador, se muestra tal cual. */
    error: string | null;
}

/** Inicializa Paddle.js una sola vez y expone la instancia. */
export const usePaddle = (): UsePaddleResult => {
    const [paddle, setPaddle] = useState<Paddle | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getPaddle()
            .then((instance) => { if (!cancelled) setPaddle(instance); })
            .catch((err: unknown) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : String(err));
            });
        return () => { cancelled = true; };
    }, []);

    return { paddle, error };
};
