import { useEffect, useState } from 'react';
import type { Paddle, PricePreviewParams, PricePreviewResponse } from '@paddle/paddle-js';
import { PRICING_TIERS } from '../config/pricing-tiers';

/** priceId → total ya formateado por Paddle (p. ej. "$6.00", "£5.00"). */
export type PaddlePrices = Record<string, string>;

interface UsePaddlePricesResult {
    prices: PaddlePrices;
    loading: boolean;
    failed: boolean;
}

/** Resultado de una consulta, etiquetado con el país que la originó. */
interface PreviewResult {
    key: string;
    prices: PaddlePrices;
    failed: boolean;
}

/** Mensual y anual de todos los planes en una sola llamada. */
const buildLineItems = (): PricePreviewParams['items'] =>
    PRICING_TIERS.flatMap((tier) =>
        [tier.priceId.month, tier.priceId.year].map((priceId) => ({ priceId, quantity: 1 })),
    );

const totalsByPriceId = (response: PricePreviewResponse): PaddlePrices =>
    response.data.details.lineItems.reduce<PaddlePrices>((acc, item) => {
        acc[item.price.id] = item.formattedTotals.total;
        return acc;
    }, {});

/**
 * Precios localizados vía Paddle.PricePreview().
 *
 * Devolvemos `formattedTotals.total` tal cual: ya viene con símbolo de moneda,
 * separadores y los impuestos que correspondan. No se hace ninguna cuenta ni
 * se reformatea nada en el cliente.
 *
 * @param country `undefined` mientras se detecta, `null` si no se conoce.
 */
export const usePaddlePrices = (
    paddle: Paddle | null,
    country: string | null | undefined,
): UsePaddlePricesResult => {
    const [result, setResult] = useState<PreviewResult | null>(null);

    // Identifica la consulta en curso: si cambia el país, el resultado guardado
    // deja de valer y `loading` vuelve a true sin tocar estado dentro del efecto.
    const key = country ?? 'auto';

    useEffect(() => {
        // Esperamos a tener Paddle y a que termine la detección de país, así solo
        // se hace una llamada a PricePreview.
        if (!paddle || country === undefined) return;

        let cancelled = false;

        // Sin país conocido no mandamos `address`: Paddle deduce la ubicación por
        // la IP del visitante. Nunca se le pasa un centinela interno tipo 'OTHERS'.
        const params: PricePreviewParams = {
            items: buildLineItems(),
            ...(country ? { address: { countryCode: country } } : {}),
        };

        paddle.PricePreview(params)
            .then((response) => {
                if (!cancelled) setResult({ key, prices: totalsByPriceId(response), failed: false });
            })
            .catch(() => {
                if (!cancelled) setResult({ key, prices: {}, failed: true });
            });

        return () => { cancelled = true; };
    }, [paddle, country, key]);

    const isCurrent = result?.key === key;

    return {
        prices: isCurrent ? result.prices : {},
        loading: !isCurrent,
        failed: isCurrent ? result.failed : false,
    };
};
