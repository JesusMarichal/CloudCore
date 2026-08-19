import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { es } from './locales/es';
import { en } from './locales/en';

export type Lang = 'es' | 'en';

const LANG_STORAGE_KEY = 'cc_lang';

const DICTIONARIES = { es, en };

export const LANGUAGES: { code: Lang; label: string; nativeLabel: string; flag: string }[] = [
    { code: 'es', label: 'Spanish', nativeLabel: 'Español', flag: '🇪🇸' },
    { code: 'en', label: 'English', nativeLabel: 'English', flag: '🇺🇸' },
];

const loadStoredLang = (): Lang => {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'es' || stored === 'en') return stored;
    // Sin preferencia guardada: seguir el idioma del navegador, con español por defecto.
    return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es';
};

/** Resuelve 'a.b.c' dentro del diccionario. */
const resolve = (dict: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>(
        (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
        dict,
    );

export type TranslateVars = Record<string, string | number>;
export type TranslateFn = (key: string, vars?: TranslateVars) => string;

interface I18nContextValue {
    lang: Lang;
    setLang: (lang: Lang) => void;
    t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider = ({ children }: { children: ReactNode }) => {
    const [lang, setLangState] = useState<Lang>(loadStoredLang);

    useEffect(() => {
        localStorage.setItem(LANG_STORAGE_KEY, lang);
        document.documentElement.lang = lang;
    }, [lang]);

    // Mantiene sincronizadas otras pestañas abiertas.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === LANG_STORAGE_KEY && (e.newValue === 'es' || e.newValue === 'en')) {
                setLangState(e.newValue);
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const setLang = useCallback((next: Lang) => setLangState(next), []);

    const t = useCallback<TranslateFn>((key, vars) => {
        // Si falta la clave en el idioma activo, cae a español antes de mostrar la clave cruda.
        const raw = resolve(DICTIONARIES[lang], key) ?? resolve(es, key);
        if (typeof raw !== 'string') {
            if (import.meta.env.DEV) console.warn(`[i18n] Falta la traducción: "${key}"`);
            return key;
        }
        if (!vars) return raw;
        return raw.replace(/\{(\w+)\}/g, (match, name) =>
            name in vars ? String(vars[name]) : match,
        );
    }, [lang]);

    const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>');
    return ctx;
};

/** Atajo para componentes que solo necesitan traducir. */
export const useT = (): TranslateFn => useI18n().t;
