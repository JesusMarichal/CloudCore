import { createContext, useContext, useMemo } from 'react';

export type ToastKind = 'error' | 'success' | 'info';

export type ShowToast = (text: string, kind?: ToastKind) => void;

/** Tiempo que un aviso permanece en pantalla antes de irse solo. */
export const AUTO_DISMISS_MS = 5000;

export const ToastContext = createContext<ShowToast | null>(null);

export const useToast = (): ShowToast => {
    const show = useContext(ToastContext);
    // Sin provider no se rompe la pantalla: el aviso simplemente no sale.
    return useMemo(() => show ?? (() => undefined), [show]);
};
