export type BillingFrequency = 'month' | 'year';

export interface Tier {
    name: 'Starter' | 'Pro' | 'Advanced';
    description: string;
    features: string[];
    priceId: { month: string; year: string };
    /** Marca la tarjeta como plan recomendado. Como mucho una. */
    featured?: boolean;
}

/**
 * Catálogo de planes. Edita libremente nombre, descripción y features.
 *
 * Los `priceId` son de la cuenta de **sandbox**: un `pri_...` de sandbox no
 * existe en producción y Paddle.js responderá "price not found" si los mezclas.
 * Al pasar a producción hay que sustituirlos por los IDs de la cuenta live.
 */
export const PRICING_TIERS: Tier[] = [
    {
        name: 'Starter',
        description: 'Para empezar: automatización básica de VPS.',
        features: [
            '1 servidor VPS conectado',
            'Despliegues ilimitados',
            'Terminal SSH en el navegador',
            'Soporte por correo',
        ],
        priceId: {
            month: 'pri_01m0c1r1f59sdz8kt9s94jwryt',
            year: 'pri_01m0c1r1h8k1k0qat2kx64b4kh',
        },
    },
    {
        name: 'Pro',
        description: 'Para equipos en crecimiento: más VPS y automatizaciones.',
        features: [
            'Hasta 5 servidores VPS',
            'Bases de datos gestionadas',
            'Certificados SSL automáticos',
            'Despliegue desde GitHub',
            'Soporte prioritario',
        ],
        priceId: {
            month: 'pri_01m0c1r1qtvgwzj032rr2cev70',
            year: 'pri_01m0c1r1sxfd48b69p90zcp05q',
        },
        featured: true,
    },
    {
        name: 'Advanced',
        description: 'Para uso intensivo: límites altos y soporte prioritario.',
        features: [
            'Servidores VPS ilimitados',
            'Métricas y alertas avanzadas',
            'Roles y permisos de equipo',
            'Webhooks y API completa',
            'Soporte prioritario 24/7',
        ],
        priceId: {
            month: 'pri_01m0c1r1zaa3n2n3qesap775f7',
            year: 'pri_01m0c1r21cxgr0qagnfw9wzsh1',
        },
    },
];
