import { useEffect } from 'react';
import type { Paddle } from '@paddle/paddle-js';
import { BillingService } from '../services/billing.service';
import { tokenStorage } from '../services/tokenStorage';

/**
 * Identifica al cliente ante Paddle Retain.
 *
 * Retain necesita el **customer_id de Paddle** (`ctm_...`), no el id interno de
 * CloudCore ni el correo. El id lo resuelve el backend a partir del JWT, así que
 * el navegador nunca elige de qué cliente se trata.
 *
 * Se hace con `paddle.Update()` en vez de pasarlo a `initializePaddle()` porque
 * Paddle.js solo se inicializa una vez por página, y en ese momento todavía no
 * sabemos quién ha iniciado sesión.
 *
 * Nota: Retain solo funciona en cuentas live. En sandbox esto no rompe nada,
 * simplemente no se carga ninguna funcionalidad de Retain.
 */
export const usePaddleRetain = (paddle: Paddle | null): void => {
    useEffect(() => {
        if (!paddle) return;
        if (!tokenStorage.getToken()) return; // visitante anónimo: nada que identificar

        let cancelled = false;
        BillingService.getStatus()
            .then((status) => {
                if (cancelled || !status.customerId) return;
                paddle.Update({ pwCustomer: { id: status.customerId } });
            })
            .catch(() => {
                // Retain es accesorio: si falla, no se toca el checkout.
            });

        return () => { cancelled = true; };
    }, [paddle]);
};
