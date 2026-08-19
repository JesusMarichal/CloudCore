import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../../services/auth.service';
import { Mail, Lock, User, ArrowRight, Cloud, CheckCircle, Circle, ShieldCheck, Eye, EyeOff, Sun, Moon, Image as ImageIcon } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import OTPInput from '../../components/OTPInput';
import AvatarPicker from '../../components/AvatarPicker';
import { DEFAULT_AVATAR_ID, getAvatarUrl } from '../../data/avatars';
import { useT } from '../../i18n';
import { Alert } from '../../components/Alert';
import { describeAuthError } from '../../services/authError';
import { useToast } from '../../components/toast-context';
import '../Login/Login.css';
import './Register.css';

const Register: React.FC = () => {
    const t = useT();
    const showToast = useToast();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [avatar, setAvatar] = useState<string>(DEFAULT_AVATAR_ID);
    const [step, setStep] = useState<'form' | 'avatar' | 'verify'>('form');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [showPassword, setShowPassword] = useState(false);
    const [isDark, setIsDark] = useState(false); // arranca en claro (blanco) por defecto
    const navigate = useNavigate();

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setTimeout(() => setResendCooldown(s => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    const pwChecks = React.useMemo(() => ({
        length: password.length >= 8,
        upper: /[A-Z]/.test(password),
        lower: /[a-z]/.test(password),
        number: /\d/.test(password),
        special: /[^A-Za-z0-9]/.test(password),
    }), [password]);

    const passwordStrength = React.useMemo(() => {
        if (!password) return { level: 0, label: '', percent: 0 };
        const score = Object.values(pwChecks).filter(Boolean).length;
        if (score <= 2) return { level: 1, label: t('auth.strength.weak'), percent: 33 };
        if (score <= 4) return { level: 2, label: t('auth.strength.medium'), percent: 66 };
        return { level: 3, label: t('auth.strength.strong'), percent: 100 };
    }, [password, pwChecks, t]);

    // Paso 1: pide un código de verificación por correo. La cuenta todavía no existe.
    const sendCode = async () => {
        setError(null);
        setLoading(true);
        try {
            const result = await AuthService.register({ name, email, password, avatar });
            if (result.success) {
                setStep('verify');
                setCode('');
                setResendCooldown(30);
            } else {
                setError(result.message || t('register.registerError'));
            }
        } catch (err: unknown) {
            // Lo accionable se queda en el formulario; lo demás sale flotando.
            const described = describeAuthError(err, t);
            if (described.kind === 'validation') setError(described.text);
            else showToast(described.text);
        } finally {
            setLoading(false);
        }
    };

    // Paso intermedio: antes de enviar el código, el usuario elige su foto de
    // perfil del pack predeterminado.
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setStep('avatar');
    };

    const handleAvatarContinue = (e: React.FormEvent) => {
        e.preventDefault();
        sendCode();
    };

    const handleResend = () => {
        if (resendCooldown > 0 || loading) return;
        sendCode();
    };

    // Paso 2: solo aquí, si el código es correcto, el backend crea la cuenta.
    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await AuthService.verifyRegister(email, code);
            if (result.success) {
                setSuccess(true);
                setTimeout(() => navigate('/login'), 1800);
            } else {
                setError(result.message || t('login.badCode'));
            }
        } catch (err: unknown) {
            // Lo accionable se queda en el formulario; lo demás sale flotando.
            const described = describeAuthError(err, t);
            if (described.kind === 'validation') setError(described.text);
            else showToast(described.text);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`login-container ${isDark ? 'theme-dark' : 'theme-light'}`}>
            <div className="background-animation">
                <div className="shape shape-1"></div>
                <div className="shape shape-2"></div>
                <div className="shape shape-3"></div>
                <div className="shape shape-4"></div>
            </div>

            <div className={`login-card${step === 'avatar' ? ' login-card-wide' : ''}`}>
                <button
                    type="button"
                    className="theme-toggle"
                    onClick={() => setIsDark(v => !v)}
                    title={isDark ? t('dashboard.toLightMode') : t('dashboard.toDarkMode')}
                    aria-label={t('dashboard.toggleTheme')}
                >
                    <MorphIcon icon={isDark ? Sun : Moon} size={18} spring="snappy" className="theme-icon" />
                </button>

                {success ? (
                    <div className="reg-success">
                        <MorphIcon icon={CheckCircle} size={44} className="reg-success-icon" />
                        <h2>{t('register.successTitle')}</h2>
                        <p>{t('register.successDesc')}</p>
                    </div>
                ) : (
                    <>
                        <div className="login-header">
                            <div className="auth-brand">
                                <MorphIcon icon={Cloud} size={32} className="auth-brand-icon" />
                                <span className="auth-brand-name">CloudCore</span>
                            </div>
                            <div className="auth-divider" />
                            {step === 'form' ? (
                                <>
                                    <p className="auth-subtitle">{t('register.title')}</p>
                                    <p className="auth-desc">{t('register.desc')}</p>
                                </>
                            ) : step === 'avatar' ? (
                                <>
                                    <p className="auth-subtitle">{t('register.avatarTitle')}</p>
                                    <p className="auth-desc">{t('register.avatarDesc')}</p>
                                </>
                            ) : (
                                <>
                                    <p className="auth-subtitle">{t('register.verifyTitle')}</p>
                                    <p className="auth-desc">{t('register.verifyDesc', { email })}</p>
                                </>
                            )}
                        </div>

                        {step === 'form' ? (
                            <form onSubmit={handleSubmit} className="reg-form">
                                <div className="form-group">
                                    <label><MorphIcon icon={User} size={15} /> {t('register.fullName')}</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder={t('register.namePlaceholder')}
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className="form-group">
                                    <label><MorphIcon icon={Mail} size={15} /> {t('auth.email')}</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder={t('auth.emailPlaceholder')}
                                        required
                                    />
                                </div>
                                <div className="form-group pw-group">
                                    <label><MorphIcon icon={Lock} size={15} /> {t('auth.password')}</label>
                                    <div className="password-field-wrapper">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            placeholder={t('auth.minCharsPlaceholder')}
                                            minLength={8}
                                            required
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
                                    {password && (
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

                                <button type="submit">
                                    <MorphIcon icon={ImageIcon} size={17} /> {t('register.continueToAvatar')}
                                </button>

                                <div className="login-footer">
                                    <button type="button" className="btn-link" onClick={() => navigate('/login')}>
                                        {t('register.hasAccount')} <MorphIcon icon={ArrowRight} size={14} />
                                    </button>
                                </div>

                                {error && (
                                    <Alert>{error}</Alert>
                                )}
                            </form>
                        ) : step === 'avatar' ? (
                            <form onSubmit={handleAvatarContinue} className="avatar-step">
                                <div className="avatar-preview">
                                    <img src={getAvatarUrl(avatar) ?? undefined} alt={t('profile.avatar.alt')} />
                                    <div className="avatar-preview-info">
                                        <span className="avatar-preview-name">{name || t('register.yourAccount')}</span>
                                        <span className="avatar-preview-mail">{email}</span>
                                    </div>
                                </div>

                                <AvatarPicker value={avatar} onChange={setAvatar} />

                                <button type="submit" disabled={loading || !avatar}>
                                    {loading ? t('register.sendingCode') : <><MorphIcon icon={User} size={17} /> {t('register.createAccount')}</>}
                                </button>

                                <div className="login-footer">
                                    <button
                                        type="button"
                                        className="btn-link"
                                        onClick={() => { setStep('form'); setError(null); }}
                                    >
                                        {t('register.backToData')}
                                    </button>
                                </div>

                                {error && (
                                    <Alert>{error}</Alert>
                                )}
                            </form>
                        ) : (
                            <form onSubmit={handleVerify}>
                                <div className="totp-group">
                                    <p className="totp-hint">
                                        <MorphIcon icon={ShieldCheck} size={14} /> {t('register.inboxHint')}
                                    </p>
                                    <OTPInput value={code} onChange={setCode} />
                                </div>

                                <button type="submit" disabled={loading || code.length < 6}>
                                    {loading ? t('login.verifying') : <><MorphIcon icon={ShieldCheck} size={17} /> {t('register.verifyAndCreate')}</>}
                                </button>

                                <div className="login-footer">
                                    <button
                                        type="button"
                                        className="btn-link"
                                        onClick={handleResend}
                                        disabled={resendCooldown > 0 || loading}
                                    >
                                        {resendCooldown > 0 ? t('register.resendIn', { seconds: resendCooldown }) : t('register.resend')}
                                    </button>
                                </div>

                                <div className="login-footer">
                                    <button
                                        type="button"
                                        className="btn-link"
                                        onClick={() => { setStep('form'); setError(null); setCode(''); }}
                                    >
                                        {t('register.changeData')}
                                    </button>
                                </div>

                                {error && (
                                    <Alert>{error}</Alert>
                                )}
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default Register;
