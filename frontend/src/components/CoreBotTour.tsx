import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { useT } from '../i18n';
import { tokenStorage } from '../services/tokenStorage';
import corebotFull from '../assets/corebot.png';
import corebotHead from '../assets/corebot-head.png';
import './CoreBotTour.css';

/**
 * Guía interactiva de CoreBot.
 *
 * Cada paso puede apuntar a un elemento real del panel mediante `target`, que es
 * un atributo `data-tour` — no una clase CSS — para que renombrar estilos no
 * rompa el recorrido. Si el elemento no está en pantalla (por ejemplo, la barra
 * lateral en móvil), el paso se muestra centrado sin foco.
 */
interface TourStep {
    /** Valor del atributo data-tour del elemento a resaltar. */
    target?: string;
    /** Ruta a la que navegar antes de mostrar el paso. */
    route?: string;
    titleKey: string;
    bodyKey: string;
}

const STEPS: TourStep[] = [
    { titleKey: 'tour.s1.title', bodyKey: 'tour.s1.body' },
    { target: 'nav-servers', route: '/dashboard/servers', titleKey: 'tour.s2.title', bodyKey: 'tour.s2.body' },
    { target: 'add-server', route: '/dashboard/servers', titleKey: 'tour.s3.title', bodyKey: 'tour.s3.body' },
    { target: 'nav-settings', route: '/dashboard/settings', titleKey: 'tour.s4.title', bodyKey: 'tour.s4.body' },
    { target: 'nav-websites', route: '/dashboard/websites', titleKey: 'tour.s5.title', bodyKey: 'tour.s5.body' },
    { target: 'deploy-project', route: '/dashboard/websites', titleKey: 'tour.s6.title', bodyKey: 'tour.s6.body' },
    { route: '/dashboard', titleKey: 'tour.s7.title', bodyKey: 'tour.s7.body' },
];

const PADDING = 8;      // margen del foco alrededor del elemento
const GAP = 14;         // separación entre el foco y la tarjeta
const CARD_W = 340;
const CARD_H_EST = 260; // alto estimado para decidir arriba/abajo

interface Rect { top: number; left: number; width: number; height: number }

interface CoreBotTourProps {
    /** Se llama tanto al terminar como al saltar: ambos cierran la guía. */
    onClose: () => void;
}

const CoreBotTour = ({ onClose }: CoreBotTourProps) => {
    const t = useT();
    const navigate = useNavigate();
    // CoreBot saluda por el nombre; los pasos que no lo usan lo ignoran.
    // Si la cuenta no tuviera nombre, cae al usuario del correo para no
    // acabar con un saludo vacío del tipo "¡Hola, !".
    const currentUser = tokenStorage.getUser();
    const name = (currentUser?.name || currentUser?.email || '').split(/[ @]/)[0];
    const location = useLocation();

    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const rafRef = useRef<number | null>(null);

    const step = STEPS[index];
    const isLast = index === STEPS.length - 1;

    // Lleva al usuario a la vista del paso antes de buscar el elemento.
    useEffect(() => {
        if (step.route && location.pathname !== step.route) navigate(step.route);
    }, [step.route, location.pathname, navigate]);

    const measure = useCallback(() => {
        if (!step.target) { setRect(null); return true; }
        const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
        if (!el) { setRect(null); return false; }
        const r = el.getBoundingClientRect();
        // Un elemento sin tamaño está oculto (p. ej. la barra lateral en móvil)
        if (r.width === 0 || r.height === 0) { setRect(null); return false; }
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        return true;
    }, [step.target]);

    // El elemento puede montarse después de navegar: se reintenta un momento.
    useLayoutEffect(() => {
        let cancelled = false;
        const started = Date.now();
        const tick = () => {
            if (cancelled) return;
            const found = measure();
            if (!found && Date.now() - started < 2000) {
                rafRef.current = requestAnimationFrame(tick);
            }
        };
        tick();
        return () => {
            cancelled = true;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [measure, index, location.pathname]);

    // Mantiene el foco pegado al elemento al redimensionar o hacer scroll.
    useEffect(() => {
        const onChange = () => measure();
        window.addEventListener('resize', onChange);
        window.addEventListener('scroll', onChange, true);
        return () => {
            window.removeEventListener('resize', onChange);
            window.removeEventListener('scroll', onChange, true);
        };
    }, [measure]);

    // Mientras la guía corre, el fondo no se desplaza.
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, []);

    // Navegación por teclado, incluido Escape para salir.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight') setIndex(i => Math.min(i + 1, STEPS.length - 1));
            else if (e.key === 'ArrowLeft') setIndex(i => Math.max(i - 1, 0));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Sitúa la tarjeta junto al foco, sin salirse de la ventana.
    const cardStyle: React.CSSProperties = (() => {
        if (!rect) return {};
        const below = rect.top + rect.height + GAP;
        const fitsBelow = below + CARD_H_EST < window.innerHeight;
        const top = fitsBelow ? below : Math.max(GAP, rect.top - CARD_H_EST - GAP);
        const left = Math.min(
            Math.max(GAP, rect.left + rect.width / 2 - CARD_W / 2),
            window.innerWidth - CARD_W - GAP,
        );
        return { top, left };
    })();

    // El pie (progreso + botones) es igual en los dos modos.
    const footer = (
        <div className="tour-footer">
            <div className="tour-dots">
                {STEPS.map((_, i) => (
                    <span
                        key={i}
                        className={`tour-dot${i === index ? ' active' : ''}${i < index ? ' done' : ''}`}
                    />
                ))}
            </div>

            <div className="tour-actions">
                {index > 0 && (
                    <button className="tour-btn ghost" onClick={() => setIndex(i => i - 1)}>
                        <MorphIcon icon={ArrowLeft} size={14} /> {t('tour.back')}
                    </button>
                )}
                {!isLast && (
                    <button className="tour-btn ghost" onClick={() => onClose()}>
                        {t('tour.skip')}
                    </button>
                )}
                <button className="tour-btn primary" onClick={() => (isLast ? onClose() : setIndex(i => i + 1))}>
                    {isLast
                        ? <><MorphIcon icon={Check} size={14} /> {t('tour.finish')}</>
                        : <>{t('tour.next')} <MorphIcon icon={ArrowRight} size={14} /></>}
                </button>
            </div>
        </div>
    );

    return (
        <div className="tour-root" role="dialog" aria-modal="true" aria-label="CoreBot">
            {rect ? (
                <>
                    {/* Bloquea cualquier interacción con el panel mientras la
                        guía está activa: solo se sale por la X o por Saltar. */}
                    <div className="tour-backdrop-catch" />
                    {/* Un solo elemento hace de máscara: el box-shadow gigante
                        oscurece todo salvo el hueco del elemento resaltado.
                        Va encima de la captura para que pulsar sobre el elemento
                        resaltado no cierre la guía por accidente. */}
                    <div
                        className="tour-spotlight"
                        onClick={e => e.stopPropagation()}
                        style={{
                            top: rect.top - PADDING,
                            left: rect.left - PADDING,
                            width: rect.width + PADDING * 2,
                            height: rect.height + PADDING * 2,
                        }}
                    />
                </>
            ) : (
                <div className="tour-backdrop" />
            )}

            {rect ? (
                /* Paso con foco: tarjeta compacta junto al elemento resaltado */
                <div className="tour-card anchored" style={cardStyle} onClick={e => e.stopPropagation()}>
                    <button className="tour-close" onClick={() => onClose()} aria-label={t('tour.skip')}>
                        <MorphIcon icon={X} size={15} />
                    </button>

                    <div className="tour-card-head">
                        <img src={corebotHead} alt="CoreBot" className="tour-avatar" />
                        <div className="tour-speech">
                            <span className="tour-name">CoreBot</span>
                            <h3 className="tour-title">{t(step.titleKey, { name })}</h3>
                        </div>
                    </div>

                    <p className="tour-body">{t(step.bodyKey, { name })}</p>
                    {footer}
                </div>
            ) : (
                /* Paso sin foco: CoreBot flotando y el mensaje como una idea suya */
                <div className="tour-idea" onClick={e => e.stopPropagation()}>
                    <div className="tour-idea-bot">
                        <img src={corebotFull} alt="CoreBot" />
                        <span className="tour-idea-shadow" aria-hidden="true" />
                    </div>

                    <div className="tour-bubble">
                        <button className="tour-close" onClick={() => onClose()} aria-label={t('tour.skip')}>
                            <MorphIcon icon={X} size={15} />
                        </button>

                        <span className="tour-name">CoreBot</span>
                        <h3 className="tour-title">{t(step.titleKey, { name })}</h3>
                        <p className="tour-body">{t(step.bodyKey, { name })}</p>
                        {footer}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CoreBotTour;
