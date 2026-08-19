import { useState, useEffect } from 'react';
import {
    Github, KeyRound, Save, CheckCircle2, AlertCircle,
    ShieldCheck, Lock, Eye, EyeOff, QrCode, Shield,
    AlertTriangle, X, Check, Languages, SlidersHorizontal
} from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { API_URL } from '../../config';
import { AuthService } from '../../services/auth.service';
import { authFetch } from '../../services/apiFetch';
import { tokenStorage } from '../../services/tokenStorage';
import { useI18n, useT, LANGUAGES } from '../../i18n';
import type { TranslateFn } from '../../i18n';
import OTPInput from '../../components/OTPInput';
import './Settings.css';

// ── Sección: Idioma ───────────────────────────────────────────────────────────
const LanguageSection = () => {
    const { lang, setLang, t } = useI18n();

    return (
        <div className="setting-card">
            <div className="setting-card-header">
                <div className="setting-icon sec-blue"><MorphIcon icon={Languages} size={22} /></div>
                <div className="setting-title">
                    <h3>{t('lang.title')}</h3>
                    <p>{t('lang.description')}</p>
                </div>
            </div>
            <div className="setting-form">
                <div className="form-group">
                    <label>{t('lang.label')}</label>
                    <div className="lang-options" role="radiogroup" aria-label={t('lang.label')}>
                        {LANGUAGES.map(option => (
                            <button
                                key={option.code}
                                type="button"
                                role="radio"
                                aria-checked={lang === option.code}
                                className={`lang-option${lang === option.code ? ' active' : ''}`}
                                onClick={() => setLang(option.code)}
                            >
                                <span className="lang-flag" aria-hidden="true">{option.flag}</span>
                                <span className="lang-names">
                                    <span className="lang-native">{option.nativeLabel}</span>
                                    <span className="lang-code">{option.code.toUpperCase()}</span>
                                </span>
                                {lang === option.code && (
                                    <MorphIcon icon={Check} size={16} className="lang-check" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Sección: GitHub ───────────────────────────────────────────────────────────
const GithubSection = ({ t }: { t: TranslateFn }) => {
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null; msg: string }>({ type: null, msg: '' });

    useEffect(() => {
        if (!tokenStorage.getToken()) return;
        setLoading(true);
        authFetch(`${API_URL}/github/settings`)
            .then(r => r.json())
            .then(d => { if (d.success && d.token) setToken(d.token); })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        if (!tokenStorage.getToken()) return;
        setSaving(true);
        setStatus({ type: null, msg: '' });
        try {
            const r = await authFetch(`${API_URL}/github/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            });
            const d = await r.json();
            setStatus({ type: d.success ? 'success' : 'error', msg: d.success ? t('settings.github.saved') : d.message });
        } catch {
            setStatus({ type: 'error', msg: t('common.connectionError') });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="setting-card">
            <div className="setting-card-header">
                <div className="setting-icon github"><MorphIcon icon={Github} size={24} /></div>
                <div className="setting-title">
                    <h3>{t('settings.github.title')}</h3>
                    <p>{t('settings.github.desc')}</p>
                </div>
            </div>
            <div className="setting-form">
                <div className="form-group">
                    <label>{t('settings.github.tokenLabel')}</label>
                    <div className="input-with-icon">
                        <MorphIcon icon={KeyRound} size={16} className="input-icon" />
                        <input type="password" placeholder="ghp_************************************"
                            value={token} onChange={e => setToken(e.target.value)} disabled={loading} />
                    </div>
                    <span className="help-text">
                        {t('settings.github.helpBefore')} <code>repo</code>{t('settings.github.helpAfter')}{' '}
                        <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer">
                            {t('settings.github.helpLink')}
                        </a>.
                    </span>
                </div>
                {status.type && (
                    <div className={`status-alert ${status.type}`}>
                        <MorphIcon icon={status.type === 'success' ? CheckCircle2 : AlertCircle} size={16} />
                        <span>{status.msg}</span>
                    </div>
                )}
                <div className="setting-actions">
                    <button className="btn-save" onClick={handleSave} disabled={saving || loading}>
                        {saving ? t('common.saving') : <><MorphIcon icon={Save} size={16} /> {t('common.save')}</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Sección: Cambiar contraseña ───────────────────────────────────────────────
const ChangePasswordSection = ({ t }: { t: TranslateFn }) => {
    const [form, setForm] = useState({ current: '', newPass: '', confirm: '' });
    const [show, setShow] = useState({ current: false, newPass: false, confirm: false });
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null; msg: string }>({ type: null, msg: '' });

    const strength = (p: string) => {
        let s = 0;
        if (p.length >= 8) s++;
        if (/[A-Z]/.test(p)) s++;
        if (/[0-9]/.test(p)) s++;
        if (/[^A-Za-z0-9]/.test(p)) s++;
        return s;
    };
    const str = strength(form.newPass);
    const strLabel = ['', t('settings.password.strength.weak'), t('settings.password.strength.fair'),
                      t('settings.password.strength.good'), t('settings.password.strength.strong')][str];
    const strColor = ['', '#f85149', '#d29922', '#3fb950', '#00B7B5'][str];

    const fieldLabel = (field: 'current' | 'newPass' | 'confirm') =>
        field === 'current' ? t('settings.password.current')
            : field === 'newPass' ? t('settings.password.new')
                : t('settings.password.confirm');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus({ type: null, msg: '' });
        if (form.newPass !== form.confirm) {
            setStatus({ type: 'error', msg: t('settings.password.mismatch') });
            return;
        }
        if (!tokenStorage.getToken()) return;
        setLoading(true);
        try {
            const result = await AuthService.changePassword(form.current, form.newPass);
            setStatus({ type: result.success ? 'success' : 'error', msg: result.message });
            if (result.success) setForm({ current: '', newPass: '', confirm: '' });
        } catch {
            setStatus({ type: 'error', msg: t('common.connectionError') });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="setting-card">
            <div className="setting-card-header">
                <div className="setting-icon sec-blue"><MorphIcon icon={Lock} size={22} /></div>
                <div className="setting-title">
                    <h3>{t('settings.password.title')}</h3>
                    <p>{t('settings.password.desc')}</p>
                </div>
            </div>
            <form className="setting-form" onSubmit={handleSubmit}>
                {(['current', 'newPass', 'confirm'] as const).map(field => (
                    <div className="form-group" key={field}>
                        <label>{fieldLabel(field)}</label>
                        <div className="input-with-icon">
                            <MorphIcon icon={Lock} size={16} className="input-icon" />
                            <input
                                type={show[field] ? 'text' : 'password'}
                                value={form[field]}
                                onChange={e => setForm({ ...form, [field]: e.target.value })}
                                placeholder="••••••••"
                                required
                                minLength={field === 'current' ? 1 : 8}
                            />
                            <button type="button" className="btn-eye" onClick={() => setShow({ ...show, [field]: !show[field] })}>
                                <MorphIcon icon={show[field] ? EyeOff : Eye} size={15} spring="snappy" />
                            </button>
                        </div>
                        {field === 'newPass' && form.newPass && (
                            <div className="password-strength">
                                <div className="strength-bars">
                                    {[1,2,3,4].map(i => (
                                        <div key={i} className="strength-bar" style={{ background: i <= str ? strColor : 'rgba(255,255,255,0.08)' }} />
                                    ))}
                                </div>
                                <span style={{ color: strColor, fontSize: '11px' }}>{strLabel}</span>
                            </div>
                        )}
                    </div>
                ))}
                {status.type && (
                    <div className={`status-alert ${status.type}`}>
                        <MorphIcon icon={status.type === 'success' ? CheckCircle2 : AlertCircle} size={16} />
                        <span>{status.msg}</span>
                    </div>
                )}
                <div className="setting-actions">
                    <button className="btn-save" type="submit" disabled={loading}>
                        {loading ? t('settings.password.updating') : <><MorphIcon icon={Save} size={16} /> {t('settings.password.submit')}</>}
                    </button>
                </div>
            </form>
        </div>
    );
};

// ── Sección: 2FA ──────────────────────────────────────────────────────────────
const TwoFASection = ({ t }: { t: TranslateFn }) => {
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [step, setStep]       = useState<'idle' | 'setup' | 'disable'>('idle');
    const [qrUrl, setQrUrl]     = useState('');
    const [secret, setSecret]   = useState('');
    const [code, setCode]       = useState('');
    const [password, setPassword] = useState('');
    const [status, setStatus]   = useState<{ type: 'success' | 'error' | null; msg: string }>({ type: null, msg: '' });
    const [saving, setSaving]   = useState(false);

    useEffect(() => {
        if (!tokenStorage.getToken()) return;
        AuthService.get2FAStatus()
            .then(d => setEnabled(!!d.enabled))
            .finally(() => setLoading(false));
    }, []);

    const handleGenerate = async () => {
        if (!tokenStorage.getToken()) return;
        setSaving(true);
        setStatus({ type: null, msg: '' });
        try {
            const d = await AuthService.generate2FA();
            if (d.success) {
                setSecret(d.secret);
                const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(d.otpauthUrl)}`;
                setQrUrl(qr);
                setStep('setup');
            } else {
                setStatus({ type: 'error', msg: d.message });
            }
        } catch {
            setStatus({ type: 'error', msg: t('settings.twofa.qrError') });
        } finally {
            setSaving(false);
        }
    };

    const handleEnable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tokenStorage.getToken()) return;
        setSaving(true);
        setStatus({ type: null, msg: '' });
        try {
            const d = await AuthService.enable2FA(code);
            if (d.success) {
                setEnabled(true);
                setStep('idle');
                setCode('');
                setStatus({ type: 'success', msg: t('settings.twofa.enabled') });
            } else {
                setStatus({ type: 'error', msg: d.message });
            }
        } catch {
            setStatus({ type: 'error', msg: t('settings.twofa.enableError') });
        } finally {
            setSaving(false);
        }
    };

    const handleDisable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tokenStorage.getToken()) return;
        setSaving(true);
        setStatus({ type: null, msg: '' });
        try {
            const d = await AuthService.disable2FA(password);
            if (d.success) {
                setEnabled(false);
                setStep('idle');
                setPassword('');
                setStatus({ type: 'success', msg: t('settings.twofa.disabled') });
            } else {
                setStatus({ type: 'error', msg: d.message });
            }
        } catch {
            setStatus({ type: 'error', msg: t('settings.twofa.disableError') });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="setting-card">
            <div className="setting-card-header">
                <div className={`setting-icon ${enabled ? 'sec-green' : 'sec-gray'}`}>
                    <MorphIcon icon={ShieldCheck} size={22} />
                </div>
                <div className="setting-title" style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h3>{t('settings.twofa.title')}</h3>
                        <span className={`twofa-badge ${enabled ? 'on' : 'off'}`}>
                            {enabled
                                ? <><MorphIcon icon={Check} size={12} /> {t('settings.twofa.active')}</>
                                : t('settings.twofa.inactive')}
                        </span>
                    </div>
                    <p>{t('settings.twofa.desc')}</p>
                </div>
            </div>

            <div className="setting-form">
                {status.type && (
                    <div className={`status-alert ${status.type}`}>
                        <MorphIcon icon={status.type === 'success' ? CheckCircle2 : AlertCircle} size={16} />
                        <span>{status.msg}</span>
                    </div>
                )}

                {!loading && step === 'idle' && (
                    <div className="setting-actions">
                        {!enabled ? (
                            <button className="btn-save" onClick={handleGenerate} disabled={saving}>
                                {saving ? t('settings.twofa.generating') : <><MorphIcon icon={QrCode} size={16} /> {t('settings.twofa.enable')}</>}
                            </button>
                        ) : (
                            <button className="btn-danger" onClick={() => { setStep('disable'); setStatus({ type: null, msg: '' }); }}>
                                <MorphIcon icon={X} size={16} /> {t('settings.twofa.disable')}
                            </button>
                        )}
                    </div>
                )}

                {step === 'setup' && (
                    <div className="twofa-setup">
                        <p className="twofa-step-label">{t('settings.twofa.step1')}</p>
                        <div className="twofa-qr-wrap">
                            {qrUrl && <img src={qrUrl} alt={t('settings.twofa.qrAlt')} className="twofa-qr" />}
                        </div>
                        <p className="twofa-step-label">{t('settings.twofa.manualHint')}</p>
                        <div className="twofa-secret">
                            <code>{secret}</code>
                        </div>
                        <p className="twofa-step-label">{t('settings.twofa.step2')}</p>
                        <form onSubmit={handleEnable} className="twofa-verify-form">
                            <OTPInput value={code} onChange={setCode} />
                            <div className="twofa-actions">
                                <button type="button" className="btn-ghost-sm"
                                    onClick={() => { setStep('idle'); setCode(''); setStatus({ type: null, msg: '' }); }}>
                                    {t('common.cancel')}
                                </button>
                                <button type="submit" className="btn-save" disabled={saving || code.length !== 6}>
                                    {saving ? t('settings.twofa.verifying') : <><MorphIcon icon={Check} size={16} /> {t('settings.twofa.confirmEnable')}</>}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {step === 'disable' && (
                    <form onSubmit={handleDisable} className="twofa-setup">
                        <p className="twofa-step-label">{t('settings.twofa.passwordToDisable')}</p>
                        <div className="input-with-icon" style={{ maxWidth: '340px' }}>
                            <MorphIcon icon={Lock} size={16} className="input-icon" />
                            <input type="password" value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder={t('settings.twofa.currentPasswordPlaceholder')} required autoFocus />
                        </div>
                        <div className="twofa-actions">
                            <button type="button" className="btn-ghost-sm"
                                onClick={() => { setStep('idle'); setPassword(''); }}>
                                {t('common.cancel')}
                            </button>
                            <button type="submit" className="btn-danger" disabled={saving || !password}>
                                {saving ? t('settings.twofa.disabling') : <><MorphIcon icon={X} size={16} /> {t('settings.twofa.disableShort')}</>}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

// ── Sección: Aviso de seguridad ───────────────────────────────────────────────
const SecurityTipsSection = ({ t }: { t: TranslateFn }) => (
    <div className="security-tips-card">
        <div className="security-tips-header">
            <MorphIcon icon={AlertTriangle} size={18} style={{ color: '#d29922' }} />
            <span>{t('settings.tips.title')}</span>
        </div>
        <ul className="security-tips-list">
            {(['t1', 't2', 't3', 't4', 't5'] as const).map(key => (
                <li key={key}>
                    <MorphIcon icon={Shield} size={13} /> {t(`settings.tips.${key}`)}
                </li>
            ))}
        </ul>
    </div>
);

// ── Page ──────────────────────────────────────────────────────────────────────
type SettingsTab = 'general' | 'security';

const TABS: { id: SettingsTab; labelKey: string; icon: typeof Shield }[] = [
    { id: 'general', labelKey: 'settings.tabs.general', icon: SlidersHorizontal },
    { id: 'security', labelKey: 'settings.tabs.security', icon: ShieldCheck },
];

const Settings = () => {
    const t = useT();
    const [tab, setTab] = useState<SettingsTab>('general');

    return (
        <div className="settings-container">
            <div className="settings-header">
                <h2>{t('settings.title')}</h2>
                <p className="subtitle">{t(`settings.tabs.${tab}Desc`)}</p>
            </div>

            <div className="settings-tabs" role="tablist">
                {TABS.map(({ id, labelKey, icon }) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        className={`settings-tab${tab === id ? ' active' : ''}`}
                        onClick={() => setTab(id)}
                    >
                        <MorphIcon icon={icon} size={15} />
                        {t(labelKey)}
                    </button>
                ))}
            </div>

            <div className="settings-content">
                {tab === 'general' ? (
                    <>
                        <LanguageSection />
                        <GithubSection t={t} />
                    </>
                ) : (
                    <>
                        <ChangePasswordSection t={t} />
                        <TwoFASection t={t} />
                        <SecurityTipsSection t={t} />
                    </>
                )}
            </div>
        </div>
    );
};

export default Settings;
