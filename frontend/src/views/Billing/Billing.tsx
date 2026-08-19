import { CreditCard } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { useT } from '../../i18n';
import './Billing.css';

const Billing = () => {
    const t = useT();

    return (
        <div className="billing-container">
            <header className="page-header">
                <div>
                    <h1><MorphIcon icon={CreditCard} size={24} className="icon-blue" /> {t('billing.title')}</h1>
                    <p className="text-muted">{t('billing.subtitle')}</p>
                </div>
            </header>

            <div className="billing-empty-state">
                <h3>{t('billing.comingSoon')}</h3>
                <p>{t('billing.comingSoonDesc')}</p>
            </div>
        </div>
    );
};

export default Billing;
