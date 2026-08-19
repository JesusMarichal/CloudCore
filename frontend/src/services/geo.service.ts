import { httpClient } from './httpClient';

export const GeoService = {
    /**
     * País del visitante (ISO 3166-1 alpha-2) según las cabeceras del edge,
     * o `null` si no se puede determinar.
     */
    async detectCountry(): Promise<string | null> {
        try {
            const { data } = await httpClient.get<{ countryCode: string | null }>('/billing/geo');
            return data?.countryCode ?? null;
        } catch {
            // Sin backend o sin cabecera: que Paddle deduzca el país por la IP.
            return null;
        }
    },
};
