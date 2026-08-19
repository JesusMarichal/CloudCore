import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CreditCard } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { useI18n } from '../../i18n';
import { BillingService } from '../../services/billing.service';
import type { BillingStatus } from '../../services/billing.service';
import { PRICING_TIERS } from '../../config/pricing-tiers';
import type { BillingFrequency, Tier } from '../../config/pricing-tiers';
import { FrequencyToggle, PlanCard } from '../../components/PlanCard';
import { usePaddle } from '../../hooks/usePaddle';
import { usePaddlePrices } from '../../hooks/usePaddlePrices';
import { useDetectedCountry } from '../../hooks/useDetectedCountry';
import { tokenStorage } from '../../services/tokenStorage';
import './Billing.css';

/** Del price_id espejado al plan y ciclo, para no pintar un `pri_...` crudo. */
const findTier = (priceId: string): { tier: Tier; cycle: BillingFrequency } | null => {
    for (const tier of PRICING_TIERS) {
        if (tier.priceId.month === priceId) return { tier, cycle: 'month' };
        if (tier.priceId.year === priceId) return { tier, cycle: 'year' };
    }
    return null;
};

const CARD_BRANDS: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    american_express: 'American Express',
    discover: 'Discover',
    diners_club: 'Diners Club',
    jcb: 'JCB',
    union_pay: 'UnionPay',
    maestro: 'Maestro',
};

const Billing = () => {
    const { t, lang } = useI18n();
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [portalLoading, setPortalLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [frequency, setFrequency] = useState<BillingFrequency>('month');

    const { paddle, error: paddleError } = usePaddle();
    const country = useDetectedCountry();
    const { prices, loading: loadingPrices } = usePaddlePrices(paddle, country);

    const user = tokenStorage.getUser();
    const subscription = status?.subscription ?? null;
    const active = subscription ? findTier(subscription.priceId) : null;

    const loadStatus = useCallback(() => {
        setLoadingStatus(true);
        return BillingService.getStatus()
            .then(setStatus)
            .catch(() => setError(t('billing.loadError')))
            .finally(() => setLoadingStatus(false));
    }, [t]);

    useEffect(() => { void loadStatus(); }, [loadStatus]);

    // El ciclo del selector arranca en el que ya tiene contratado.
    useEffect(() => {
        if (active) setFrequency(active.cycle);
    }, [active]);

    const openCheckout = (tier: Tier) => {
        if (!paddle || !user?.email) return;
        paddle.Checkout.open({
            items: [{ priceId: tier.priceId[frequency], quantity: 1 }],
            // Aquí siempre hay sesión, así que el correo va prerrellenado y
            // bloqueado: el plan se asocia a esta cuenta de CloudCore.
            customer: { email: user.email },
            settings: {
                displayMode: 'overlay',
                variant: 'one-page',
                // Checkout en claro: la pasarela va en blanco.
                theme: 'light',
                locale: lang,
                allowLogout: false,
                successUrl: `${window.location.origin}/welcome`,
            },
        });
    };

    const openPortal = useCallback(async () => {
        setPortalLoading(true);
        setError(null);
        try {
            const result = await BillingService.createPortalSession();
            if (result.url) {
                window.location.href = result.url;
                return;
            }
            setError(
                result.error === 'no-paddle-customer'
                    ? t('billing.portalNoCustomer')
                    : t('billing.portalError'),
            );
        } catch {
            setError(t('billing.portalError'));
        } finally {
            setPortalLoading(false);
        }
    }, [t]);

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', {
            day: 'numeric', month: 'long', year: 'numeric',
        });

    const card = status?.paymentMethod ?? null;

    return (
        <div className="billing-container">
            <header className="page-header">
                <div>
                    <h1><MorphIcon icon={CreditCard} size={24} className="icon-blue" /> {t('billing.title')}</h1>
                    <p className="text-muted">{t('billing.subtitle')}</p>
                </div>
            </header>

            {error && <p className="billing-error">{error}</p>}
            {paddleError && <p className="billing-error mono">{paddleError}</p>}

            {/* ── Plan activo ───────────────────────────────────────────── */}
            {loadingStatus ? (
                <div className="billing-panel"><p className="text-muted">{t('billing.loading')}</p></div>
            ) : subscription ? (
                <section className="billing-panel">
                    <div className="billing-panel-head">
                        <div>
                            <span className="billing-label">{t('billing.currentPlan')}</span>
                            <p className="billing-plan-name">
                                {active?.tier.name ?? t('billing.unknownPlan')}
                                <span className="billing-cycle">
                                    {active?.cycle === 'year' ? t('billing.yearly') : t('billing.monthly')}
                                </span>
                            </p>
                        </div>
                        <span className={`billing-status billing-status--${status?.state}`}>
                            {t(`billing.state.${status?.state}`)}
                        </span>
                    </div>

                    <div className="billing-facts">
                        <div className="billing-fact">
                            <MorphIcon icon={CalendarClock} size={17} className="billing-fact-icon" />
                            <div>
                                <span className="billing-label">{t('billing.nextBilling')}</span>
                                <p className="billing-fact-value">
                                    {subscription.nextBilledAt
                                        ? formatDate(subscription.nextBilledAt)
                                        : t('billing.noNextBilling')}
                                </p>
                            </div>
                        </div>

                        <div className="billing-fact">
                            <MorphIcon icon={CreditCard} size={17} className="billing-fact-icon" />
                            <div>
                                <span className="billing-label">{t('billing.paymentMethod')}</span>
                                <p className="billing-fact-value">
                                    {card?.cardLast4 ? (
                                        <>
                                            {CARD_BRANDS[card.cardBrand ?? ''] ?? card.cardBrand ?? t('billing.card')}
                                            <span className="billing-card-dots">•••• {card.cardLast4}</span>
                                            {card.cardExpiryMonth && card.cardExpiryYear && (
                                                <span className="billing-card-exp">
                                                    {String(card.cardExpiryMonth).padStart(2, '0')}/
                                                    {String(card.cardExpiryYear).slice(-2)}
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        t('billing.noPaymentMethod')
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    {subscription.scheduledChangeAt && (
                        <p className="billing-scheduled">
                            {t(
                                subscription.scheduledChangeAction === 'pause'
                                    ? 'billing.pauseScheduled'
                                    : 'billing.cancelScheduled',
                                { date: formatDate(subscription.scheduledChangeAt) },
                            )}
                        </p>
                    )}

                    {status?.state === 'past_due' && (
                        <p className="billing-warning">{t('billing.pastDueNotice')}</p>
                    )}

                    <div className="billing-actions">
                        <button
                            type="button"
                            className="billing-cta"
                            onClick={openPortal}
                            disabled={portalLoading}
                        >
                            {portalLoading ? t('billing.opening') : t('billing.managePortal')}
                        </button>
                        <p className="billing-hint">{t('billing.portalHint')}</p>
                    </div>
                </section>
            ) : (
                <section className="billing-panel billing-panel--empty">
                    <h3>{t('billing.noPlanTitle')}</h3>
                    <p>{t('billing.noPlanDesc')}</p>
                </section>
            )}

            {/* ── Planes disponibles ────────────────────────────────────── */}
            <section className="billing-plans">
                <div className="billing-plans-head">
                    <h2>{subscription ? t('billing.changePlanTitle') : t('billing.choosePlanTitle')}</h2>
                    <FrequencyToggle value={frequency} onChange={setFrequency} />
                </div>

                <div className="billing-plans-grid">
                    {PRICING_TIERS.map((tier) => {
                        const isCurrent =
                            subscription?.priceId === tier.priceId[frequency] && status?.hasAccess === true;
                        return (
                            <PlanCard
                                key={tier.name}
                                tier={tier}
                                frequency={frequency}
                                formattedTotal={prices[tier.priceId[frequency]]}
                                loading={loadingPrices}
                                current={isCurrent}
                                compact
                                ctaLabel={
                                    isCurrent ? t('billing.currentPlanCta')
                                        : subscription ? t('billing.changeToPlan')
                                            : t('pricing.subscribe')
                                }
                                ctaDisabled={isCurrent || !paddle || loadingPrices || !prices[tier.priceId[frequency]]}
                                onSelect={() => openCheckout(tier)}
                            />
                        );
                    })}
                </div>

                <p className="billing-hint">{t('pricing.taxNote')}</p>
            </section>
        </div>
    );
};

export default Billing;
