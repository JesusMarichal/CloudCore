import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { PRICING_TIERS } from '../../config/pricing-tiers';
import type { BillingFrequency, Tier } from '../../config/pricing-tiers';
import { FrequencyToggle, PlanCard } from '../../components/PlanCard';
import { usePaddle } from '../../hooks/usePaddle';
import { usePaddlePrices } from '../../hooks/usePaddlePrices';
import { useDetectedCountry } from '../../hooks/useDetectedCountry';
import { usePaddleRetain } from '../../hooks/usePaddleRetain';
import { tokenStorage } from '../../services/tokenStorage';
import './Pricing.css';

const Pricing = () => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [frequency, setFrequency] = useState<BillingFrequency>('month');

    const { paddle, error: paddleError } = usePaddle();
    const country = useDetectedCountry();
    const { prices, loading, failed } = usePaddlePrices(paddle, country);

    // Paddle Retain: identifica al cliente si hay sesión iniciada.
    usePaddleRetain(paddle);

    const user = tokenStorage.getUser();

    /**
     * Contratar exige sesión: el plan se asocia a una cuenta de CloudCore y el
     * correo del checkout tiene que ser el del usuario. Desde aquí solo se
     * mira; la compra se hace desde Facturación, ya con sesión iniciada.
     */
    const handleSelect = (tier: Tier) => {
        navigate(user?.email ? '/dashboard/billing' : '/login', {
            state: { from: '/dashboard/billing', plan: tier.name },
        });
    };

    // La configuración de Paddle es inválida: se enseña el error crudo en vez de
    // enseñar precios que no se corresponden con ninguna cuenta.
    if (paddleError) {
        return (
            <div className="pricing-page">
                <div className="pricing-config-error">
                    <h2>{t('pricing.initErrorTitle')}</h2>
                    <p className="mono">{paddleError}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="pricing-page">
            <header className="pricing-header">
                <h1>{t('pricing.title')}</h1>
                <p className="pricing-subtitle">{t('pricing.subtitle')}</p>
                <FrequencyToggle value={frequency} onChange={setFrequency} />
            </header>

            {failed && <p className="pricing-error">{t('pricing.pricesError')}</p>}

            <div className="pricing-grid">
                {PRICING_TIERS.map((tier) => (
                    <PlanCard
                        key={tier.name}
                        tier={tier}
                        frequency={frequency}
                        formattedTotal={prices[tier.priceId[frequency]]}
                        loading={loading}
                        ctaLabel={user?.email ? t('pricing.goToBilling') : t('pricing.signInToSubscribe')}
                        onSelect={() => handleSelect(tier)}
                    />
                ))}
            </div>

            <footer className="pricing-footer">
                <p>{t('pricing.taxNote')}</p>
                <Link to="/home">{t('pricing.backHome')}</Link>
            </footer>
        </div>
    );
};

export default Pricing;
