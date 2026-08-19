import { Link } from 'react-router-dom';
import { CheckCircle, CalendarClock, CreditCard } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { useT } from '../../i18n';
import { tokenStorage } from '../../services/tokenStorage';
import './Welcome.css';

/**
 * Destino del `successUrl` del checkout de Paddle.
 *
 * Reutiliza la misma tarjeta y las mismas animaciones que la pantalla de
 * registro completado (`.login-card` + `.reg-success`), para que terminar un
 * pago se sienta igual que terminar un alta. Va siempre en claro, a juego con
 * la pasarela de pago, que también se abre en tema claro.
 *
 * Es solo una confirmación: el alta real del plan la hace el webhook de Paddle
 * en el backend, que es lo que se puede reintentar y firmar. Por eso aquí no se
 * afirma nada del estado de la suscripción — se manda al usuario a Facturación,
 * que lee el espejo ya actualizado.
 */
const Welcome = () => {
    const t = useT();
    const isSignedIn = Boolean(tokenStorage.getToken());

    return (
        <div className="login-container theme-light welcome-container">
            <div className="background-animation">
                <div className="shape shape-1" /><div className="shape shape-2" />
                <div className="shape shape-3" /><div className="shape shape-4" />
            </div>

            <div className="login-card">
                <div className="reg-success">
                    <MorphIcon icon={CheckCircle} size={44} className="reg-success-icon" />
                    <h2>{t('welcome.title')}</h2>
                    <p>{t('welcome.body')}</p>

                    <ul className="welcome-next">
                        <li>
                            <MorphIcon icon={CalendarClock} size={16} className="welcome-next-icon" />
                            {t('welcome.trialNote')}
                        </li>
                        <li>
                            <MorphIcon icon={CreditCard} size={16} className="welcome-next-icon" />
                            {t('welcome.manageNote')}
                        </li>
                    </ul>

                    <Link className="welcome-cta" to={isSignedIn ? '/dashboard/billing' : '/login'}>
                        {isSignedIn ? t('welcome.goBilling') : t('welcome.goLogin')}
                    </Link>

                    <p className="welcome-note">{t('welcome.note')}</p>
                </div>
            </div>
        </div>
    );
};

export default Welcome;
