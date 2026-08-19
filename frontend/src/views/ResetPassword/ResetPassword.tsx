import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthService } from '../../services/auth.service';
import { Lock, KeyRound, CheckCircle, Circle, Eye, EyeOff, Sun, Moon, ArrowRight } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { useT } from '../../i18n';
import '../Login/Login.css';
import './ResetPassword.css';

const ResetPassword: React.FC = () => {
    const t = useT();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isDark, setIsDark] = useState(false); // arranca en claro (blanco) por defecto
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const navigate = useNavigate();

    const pwChecks = React.useMemo(() => ({
        length: newPassword.length >= 8,
        upper: /[A-Z]/.test(newPassword),
        lower: /[a-z]/.test(newPassword),
        number: /\d/.test(newPassword),
        special: /[^A-Za-z0-9]/.test(newPassword),
    }), [newPassword]);

    const passwordStrength = React.useMemo(() => {
        if (!newPassword) return { level: 0, label: '', percent: 0 };
        const score = Object.values(pwChecks).filter(Boolean).length;
        if (score <= 2) return { level: 1, label: t('auth.strength.weak'), percent: 33 };
        if (score <= 4) return { level: 2, label: t('auth.strength.medium'), percent: 66 };
        return { level: 3, label: t('auth.strength.strong'), percent: 100 };
    }, [newPassword, pwChecks, t]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (newPassword !== confirmPassword) {
            setError(t('resetPassword.mismatch'));
            return;
        }

        setLoading(true);
        try {
            const result = await AuthService.resetPassword(token, newPassword);
            if (result.success) {
                setSuccess(true);
                setTimeout(() => navigate('/login'), 2200);
            } else {
                setError(result.message || t('resetPassword.error'));
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

                {!token ? (
                    <div className="reg-success">
                        <MorphIcon icon={KeyRound} size={44} className="reg-success-icon reset-invalid-icon" />
                        <h2>{t('resetPassword.invalidTitle')}</h2>
                        <p>{t('resetPassword.invalidDesc')}</p>
                        <div className="login-footer">
                            <button type="button" className="btn-link" onClick={() => navigate('/login')}>
                                {t('auth.backToLogin')}
                            </button>
                        </div>
                    </div>
                ) : success ? (
                    <div className="reg-success">
                        <MorphIcon icon={CheckCircle} size={44} className="reg-success-icon" />
                        <h2>{t('resetPassword.successTitle')}</h2>
                        <p>{t('resetPassword.successDesc')}</p>
                    </div>
                ) : (
                    <>
                        <div className="login-header">
                            <div className="auth-brand">
                                <MorphIcon icon={KeyRound} size={32} className="auth-brand-icon" />
                                <span className="auth-brand-name">CloudCore</span>
                            </div>
                            <div className="auth-divider" />
                            <p className="auth-subtitle">{t('resetPassword.title')}</p>
                            <p className="auth-desc">{t('resetPassword.desc')}</p>
                        </div>

                        <form onSubmit={handleSubmit} className="reg-form">
                            <div className="form-group pw-group">
                                <label><MorphIcon icon={Lock} size={15} /> {t('resetPassword.newPassword')}</label>
                                <div className="password-field-wrapper">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder={t('auth.minCharsPlaceholder')}
                                        minLength={8}
                                        required
                                        autoFocus
                                    />
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
                                {newPassword && (
                                    <>
                                        <div className="pw-strength">
                                            <div
                                                className={`pw-strength-bar level-${passwordStrength.level}`}
                                                style={{ width: `${passwordStrength.percent}%` }}
                                            />
                                        </div>
                                        <span className={`pw-strength-label level-${passwordStrength.level}`}>
                                            {t('auth.strength.label', { level: passwordStrength.label })}
                                        </span>

                                        <div className="pw-requirements">
                                            <ul>
                                                <li className={pwChecks.length ? 'pw-req-met' : ''}>
                                                    <MorphIcon icon={pwChecks.length ? CheckCircle : Circle} size={13} spring="snappy" />
                                                    <span>{t('auth.requirements.length')}</span>
                                                </li>
                                                <li className={pwChecks.upper ? 'pw-req-met' : ''}>
                                                    <MorphIcon icon={pwChecks.upper ? CheckCircle : Circle} size={13} spring="snappy" />
                                                    <span>{t('auth.requirements.upper')}</span>
                                                </li>
                                                <li className={pwChecks.lower ? 'pw-req-met' : ''}>
                                                    <MorphIcon icon={pwChecks.lower ? CheckCircle : Circle} size={13} spring="snappy" />
                                                    <span>{t('auth.requirements.lower')}</span>
                                                </li>
                                                <li className={pwChecks.number ? 'pw-req-met' : ''}>
                                                    <MorphIcon icon={pwChecks.number ? CheckCircle : Circle} size={13} spring="snappy" />
                                                    <span>{t('auth.requirements.number')}</span>
                                                </li>
                                                <li className={pwChecks.special ? 'pw-req-met' : ''}>
                                                    <MorphIcon icon={pwChecks.special ? CheckCircle : Circle} size={13} spring="snappy" />
                                                    <span>{t('auth.requirements.special')}</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="form-group">
                                <label><MorphIcon icon={Lock} size={15} /> {t('resetPassword.confirmPassword')}</label>
                                <div className="password-field-wrapper">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder={t('resetPassword.confirmPlaceholder')}
                                        minLength={8}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="pw-toggle-btn"
                                        tabIndex={-1}
                                        onClick={() => setShowConfirmPassword(v => !v)}
                                        aria-label={showConfirmPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                                    >
                                        <MorphIcon icon={showConfirmPassword ? EyeOff : Eye} size={17} spring="snappy" />
                                    </button>
                                </div>
                            </div>

                            <button type="submit" disabled={loading}>
                                {loading ? t('resetPassword.updating') : <><MorphIcon icon={KeyRound} size={17} /> {t('resetPassword.submit')}</>}
                            </button>

                            <div className="login-footer">
                                <button type="button" className="btn-link" onClick={() => navigate('/login')}>
                                    {t('resetPassword.rememberedLink')} <MorphIcon icon={ArrowRight} size={14} />
                                </button>
                            </div>

                            {error && (
                                <div className="message error-message">{error}</div>
                            )}
                        </form>
                    </>
                )}
            </div>
        </div>
    );
};

export default ResetPassword;
