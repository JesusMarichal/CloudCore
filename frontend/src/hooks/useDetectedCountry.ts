import { useEffect, useState } from 'react';
import { GeoService } from '../services/geo.service';

/**
 * País detectado en el servidor a partir de las cabeceras del edge.
 *
 * - `undefined` → todavía se está resolviendo.
 * - `null`      → no se pudo determinar; no hay que mandarle país a Paddle.
 * - `'ES'`      → código ISO 3166-1 alpha-2.
 */
export const useDetectedCountry = (): string | null | undefined => {
    const [country, setCountry] = useState<string | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        GeoService.detectCountry().then((code) => {
            if (!cancelled) setCountry(code);
        });
        return () => { cancelled = true; };
    }, []);

    return country;
};
