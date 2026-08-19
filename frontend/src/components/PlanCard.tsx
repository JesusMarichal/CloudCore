import { Check, Sparkles } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { useT } from '../i18n';
import type { BillingFrequency, Tier } from '../config/pricing-tiers';
import './PlanCard.css';

interface FrequencyToggleProps {
    value: BillingFrequency;
    onChange: (value: BillingFrequency) => void;
}

/** Selector mensual/anual. Compartido por la landing de precios y Facturación. */
export const FrequencyToggle = ({ value, onChange }: FrequencyToggleProps) => {
    const t = useT();
    return (
        <div className="freq-toggle" role="group" aria-label={t('pricing.toggleLabel')}>
            <button
                type="button"
                className={value === 'month' ? 'active' : ''}
                onClick={() => onChange('month')}
                aria-pressed={value === 'month'}
            >
                {t('pricing.monthly')}
            </button>
            <button
                type="button"
                className={value === 'year' ? 'active' : ''}
                onClick={() => onChange('year')}
                aria-pressed={value === 'year'}
            >
                {t('pricing.yearly')}
                <span className="freq-toggle-badge">{t('pricing.yearlyBadge')}</span>
            </button>
        </div>
    );
};

interface PlanCardProps {
    tier: Tier;
    frequency: BillingFrequency;
    /** Total ya formateado por Paddle. `undefined` mientras carga. */
    formattedTotal?: string;
    loading: boolean;
    /** Marca la tarjeta como el plan que el usuario tiene contratado. */
    current?: boolean;
    /** Versión densa, para el panel de Facturación. */
    compact?: boolean;
    ctaLabel: string;
    ctaDisabled?: boolean;
    onSelect: () => void;
}

export const PlanCard = ({
    tier, frequency, formattedTotal, loading,
    current = false, compact = false, ctaLabel, ctaDisabled = false, onSelect,
}: PlanCardProps) => {
    const t = useT();
    const className = [
        'plan-card',
        tier.featured ? 'featured' : '',
        current ? 'current' : '',
        compact ? 'compact' : '',
    ].filter(Boolean).join(' ');

    return (
        <article className={className}>
            {current ? (
                <span className="plan-badge plan-badge--current">{t('billing.yourPlan')}</span>
            ) : tier.featured ? (
                <span className="plan-badge">
                    <MorphIcon icon={Sparkles} size={13} /> {t('pricing.recommended')}
                </span>
            ) : null}

            <h3 className="plan-name">{tier.name}</h3>
            {!compact && <p className="plan-desc">{tier.description}</p>}

            <p className="plan-amount">
                {loading || !formattedTotal ? (
                    <span className="plan-amount-skeleton" aria-hidden="true" />
                ) : (
                    <span className="plan-amount-value">{formattedTotal}</span>
                )}
                <span className="plan-amount-period">
                    {frequency === 'month' ? t('pricing.perMonth') : t('pricing.perYear')}
                </span>
            </p>

            {!current && <p className="plan-trial">{t('pricing.trial')}</p>}

            <ul className="plan-features">
                {tier.features.map((feature) => (
                    <li key={feature}>
                        <MorphIcon icon={Check} size={15} className="plan-check" />
                        {feature}
                    </li>
                ))}
            </ul>

            <button
                type="button"
                className="plan-cta"
                onClick={onSelect}
                disabled={ctaDisabled}
            >
                {ctaLabel}
            </button>
        </article>
    );
};
