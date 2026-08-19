import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { AUTO_DISMISS_MS, ToastContext } from './toast-context';
import type { ShowToast, ToastKind } from './toast-context';
import './Toast.css';

interface Toast {
    id: number;
    kind: ToastKind;
    text: string;
}

const ICONS = {
    error: AlertCircle,
    success: CheckCircle2,
    info: Info,
} as const;

/**
 * Avisos flotantes.
 *
 * Aquí van los fallos que el usuario no puede arreglar (servicio caído, red,
 * 500). No ensucian el formulario, no desplazan el layout y se van solos a los
 * 5 segundos. Los errores accionables —contraseña incorrecta, código caducado—
 * siguen saliendo dentro del formulario con <Alert>, porque el usuario tiene
 * que poder leerlos con calma mientras corrige el campo.
 */
export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const nextId = useRef(0);

    const dismiss = useCallback((id: number) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const showToast = useCallback<ShowToast>((text, kind = 'error') => {
        const id = nextId.current++;
        setToasts((current) => [...current, { id, kind, text }]);
    }, []);

    return (
        <ToastContext.Provider value={showToast}>
            {children}
            <div className="toast-stack" role="region" aria-live="polite">
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
                ))}
            </div>
        </ToastContext.Provider>
    );
};

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) => {
    useEffect(() => {
        const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
        return () => clearTimeout(timer);
    }, [toast.id, onDismiss]);

    return (
        <div className={`toast toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
            <MorphIcon icon={ICONS[toast.kind]} size={17} className="toast-icon" />
            <span className="toast-text">{toast.text}</span>
            <button
                type="button"
                className="toast-close"
                onClick={() => onDismiss(toast.id)}
                aria-label="Cerrar"
            >
                <MorphIcon icon={X} size={14} />
            </button>
            {/* Barra que se agota: deja ver cuánto le queda al aviso. */}
            <span className="toast-progress" />
        </div>
    );
};
