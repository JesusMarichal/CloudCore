import { CreditCard } from 'lucide-react';
import './Billing.css';

const Billing = () => {
    return (
        <div className="billing-container">
            <header className="page-header">
                <div>
                    <h1><CreditCard size={24} className="icon-blue" /> Facturación</h1>
                    <p className="text-muted">Gestiona tu plan, método de pago e historial de facturas.</p>
                </div>
            </header>

            <div className="billing-empty-state">
                <h3>Próximamente</h3>
                <p>
                    Aquí podrás ver tu plan actual, actualizar tu método de pago y descargar tus facturas
                    en cuanto conectemos la pasarela de pagos.
                </p>
            </div>
        </div>
    );
};

export default Billing;
