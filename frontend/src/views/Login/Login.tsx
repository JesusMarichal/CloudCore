import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../../services/auth.service';
import { tokenStorage } from '../../services/tokenStorage';
import { Mail, Lock, ArrowRight, Cloud, ShieldCheck, MailCheck, Eye, EyeOff, Sun, Moon } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import OTPInput from '../../components/OTPInput';
import { useT } from '../../i18n';
import './Login.css';

// Brand logos as inline SVG (no external assets, work in light & dark)
const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
);

const GithubIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
);

const Login: React.FC = () => {
    const t = useT();
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [step, setStep]         = useState<'credentials' | '2fa' | 'forgot'>('credentials');
    const [preAuthToken, setPreAuthToken] = useState('');
    const [error, setError]       = useState<string | null>(null);
    const [loading, setLoading]   = useState(false);
    const [isDark, setIsDark]     = useState(false); // arranca en claro (blanco) por defecto
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotSent, setForgotSent]   = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (step === 'credentials') {
                const result = await AuthService.login({ email, password });
                if (result.success && result.require2FA) {
                    setPreAuthToken(result.preAuthToken);
                    setStep('2fa');
                } else if (result.success) {
                    tokenStorage.setSession(result.token, result.user);
                    navigate('/dashboard');
                } else {
                    setError(result.message || t('login.badCredentials'));
                }
            } else {
                const result = await AuthService.verify2FALogin(preAuthToken, totpCode);
                if (result.success) {
                    tokenStorage.setSession(result.token, result.user);
                    navigate('/dashboard');
                } else {
                    setError(result.message || t('login.badCode'));
                }
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message
                ?? (err?.code === 'ERR_NETWORK' ? t('auth.networkError') : null)
                ?? t('auth.genericError');
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await AuthService.forgotPassword(forgotEmail);
            if (result.success) {
                setForgotSent(true);
            } else {
                setError(result.message || t('login.resetRequestError'));
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message
                ?? (err?.code === 'ERR_NETWORK' ? t('auth.networkErrorShort') : null)
                ?? t('auth.genericError');
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const backToCredentials = () => {
        setStep('credentials');
        setError(null);
        setForgotEmail('');
        setForgotSent(false);
    };

    return (
        <div className={`login-container ${isDark ? 'theme-dark' : 'theme-light'}`}>
            <div className="background-animation">
                <div className="shape shape-1" /><div className="shape shape-2" />
                <div className="shape shape-3" /><div className="shape shape-4" />
            </div>

            <div className="login-card">
                <button
                    type="button"
                    className="theme-toggle"
                    onClick={() => setIsDark(v => !v)}
                    title={isDark ? t('dashboard.toLightMode') : t('dashboard.toDarkMode')}
                    aria-label={t('dashboard.toggleTheme')}
                >
                    <MorphIcon icon={isDark ? Sun : Moon} size={18} spring="snappy" className="theme-icon" />
                </button>

                <div className="login-header">
                    <div className="auth-brand">
                        <MorphIcon icon={Cloud} size={32} className="auth-brand-icon" />
                        <span className="auth-brand-name">CloudCore</span>
                    </div>
                    <div className="auth-divider" />
                    {step === 'credentials' ? (
                        <>
                            <p className="auth-subtitle">{t('login.welcome')}</p>
                            <p className="auth-desc">{t('auth.brandTagline')}</p>
                        </>
                    ) : step === '2fa' ? (
                        <>
                            <p className="auth-subtitle">{t('login.twofaTitle')}</p>
                            <p className="auth-desc">{t('login.twofaDesc')}</p>
                        </>
                    ) : (
                        <>
                            <p className="auth-subtitle">{t('login.forgotTitle')}</p>
                            <p className="auth-desc">
                                {forgotSent ? t('login.forgotDescSent') : t('login.forgotDesc')}
                            </p>
                        </>
                    )}
                </div>

                {step === 'forgot' ? (
                    forgotSent ? (
                        <div className="reg-success">
                            <MorphIcon icon={MailCheck} size={44} className="reg-success-icon" />
                            <h2>{t('login.resetSentTitle')}</h2>
                            <p>{t('login.resetSentDesc')}</p>
                            <div className="login-footer">
                                <button type="button" className="btn-link" onClick={backToCredentials}>
                                    {t('auth.backToLogin')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleForgotSubmit}>
                            <div className="form-group">
                                <label><MorphIcon icon={Mail} size={15} /> {t('auth.email')}</label>
                                <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                                    placeholder={t('auth.emailPlaceholder')} required autoFocus />
                            </div>

                            <button type="submit" disabled={loading}>
                                {loading ? t('login.sending') : <><MorphIcon icon={Mail} size={17} /> {t('login.sendResetLink')}</>}
                            </button>

                            <div className="login-footer">
                                <button type="button" className="btn-link" onClick={backToCredentials}>
                                    {t('auth.backToLogin')}
                                </button>
                            </div>

                            {error && (
                                <div className="message error-message">{error}</div>
                            )}
                        </form>
                    )
                ) : (
                    <form onSubmit={handleSubmit}>
                        {step === 'credentials' ? (
                            <>
                                <div className="form-group">
                                    <label><MorphIcon icon={Mail} size={15} /> {t('auth.email')}</label>
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                        placeholder={t('auth.emailPlaceholder')} required autoFocus />
                                </div>
                                <div className="form-group">
                                    <label><MorphIcon icon={Lock} size={15} /> {t('auth.password')}</label>
                                    <div className="password-field-wrapper">
                                        <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                                            placeholder="••••••••" required />
                                        <button
                                            type="button"
                                            className="pw-toggle-btn"
                                            tabIndex={-1}
                                            onClick={() => setShowPassword(v => !v)}
                                            aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                                        >
                                            <MorphIcon icon={showPassword ? EyeOff : Eye} size={17} spring="snappy" />
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-link forgot-password-link"
                                        onClick={() => { setStep('forgot'); setError(null); }}
                                    >
                                        {t('login.forgotLink')}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="totp-group">
                                <p className="totp-hint">
                                    <MorphIcon icon={ShieldCheck} size={14} /> {t('login.totpHint')}
                                </p>
                                <OTPInput value={totpCode} onChange={setTotpCode} />
                            </div>
                        )}

                        <button type="submit" disabled={loading || (step === '2fa' && totpCode.length < 6)}>
                            {loading ? t('login.verifying') : step === 'credentials'
                                ? t('login.submit')
                                : <><MorphIcon icon={ShieldCheck} size={17} /> {t('login.verify')}</>
                            }
                        </button>

                        {step === 'credentials' && (
                            <>
                                <div className="social-divider"><span>{t('login.continueWith')}</span></div>
                                <div className="social-buttons">
                                    <button type="button" className="social-btn" onClick={() => { /* TODO: auth Google */ }}>
                                        <GoogleIcon /> Google
                                    </button>
                                    <button type="button" className="social-btn" onClick={() => { /* TODO: auth GitHub */ }}>
                                        <GithubIcon /> GitHub
                                    </button>
                                </div>
                            </>
                        )}

                        {step === '2fa' && (
                            <div className="login-footer">
                                <button type="button" className="btn-link"
                                    onClick={() => { setStep('credentials'); setError(null); setTotpCode(''); }}>
                                    {t('auth.backToLogin')}
                                </button>
                            </div>
                        )}

                        {step === 'credentials' && (
                            <div className="login-footer">
                                <button type="button" className="btn-link" onClick={() => navigate('/register')}>
                                    {t('login.noAccount')} <MorphIcon icon={ArrowRight} size={14} />
                                </button>
                            </div>
                        )}

                        {error && (
                            <div className="message error-message">{error}</div>
                        )}
                    </form>
                )}
            </div>
        </div>
    );
};

export default Login;
