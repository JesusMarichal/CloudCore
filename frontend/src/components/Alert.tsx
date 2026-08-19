import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import './Alert.css';

export type AlertKind = 'error' | 'success' | 'info';

const ICONS = {
    error: AlertCircle,
    success: CheckCircle2,
    info: Info,
} as const;

interface AlertProps {
    kind?: AlertKind;
    children: ReactNode;
}

/**
 * Aviso en línea al estilo de las alertas de Laravel: banda de color a la
 * izquierda, fondo teñido, icono y texto alineado a la izquierda para que se
 * lea de corrido aunque ocupe varias líneas.
 */
export const Alert = ({ kind = 'error', children }: AlertProps) => (
    <div className={`alert alert--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
        <MorphIcon icon={ICONS[kind]} size={17} className="alert-icon" />
        <span className="alert-text">{children}</span>
    </div>
);
