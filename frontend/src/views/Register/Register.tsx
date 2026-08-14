import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../../services/auth.service';
import { Mail, Lock, User, ArrowRight, Cloud, CheckCircle, Circle, ShieldCheck, Eye, EyeOff, Sun, Moon } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import OTPInput from '../../components/OTPInput';
import '../Login/Login.css';
import './Register.css';

const Register: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [step, setStep] = useState<'form' | 'verify'>('form');
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
        if (score <= 2) return { level: 1, label: 'Débil', percent: 33 };
        if (score <= 4) return { level: 2, label: 'Media', percent: 66 };
        return { level: 3, label: 'Fuerte', percent: 100 };
    }, [password, pwChecks]);

    // Paso 1: pide un código de verificación por correo. La cuenta todavía no existe.
    const sendCode = async () => {
        setError(null);
        setLoading(true);
        try {
            const result = await AuthService.register({ name, email, password });
            if (result.success) {
                setStep('verify');
                setCode('');
                setResendCooldown(30);
            } else {
                setError(result.message || 'Error al registrarse');
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message
                ?? (err?.code === 'ERR_NETWORK' ? 'No se pudo conectar al servidor.' : null)
                ?? 'Error al procesar el registro';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
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
                setError(result.message || 'Código incorrecto');
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message
                ?? (err?.code === 'ERR_NETWORK' ? 'No se pudo conectar al servidor.' : null)
                ?? 'Error al verificar el código';
            setError(msg);
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

            <div className="login-card">
                <button
                    type="button"
                    className="theme-toggle"
                    onClick={() => setIsDark(v => !v)}
                    title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                    aria-label="Cambiar tema"
                >
                    <MorphIcon icon={isDark ? Sun : Moon} size={18} spring="snappy" className="theme-icon" />
                </button>

                {success ? (
                    <div className="reg-success">
                        <MorphIcon icon={CheckCircle} size={44} className="reg-success-icon" />
                        <h2>¡Cuenta verificada!</h2>
                        <p>Redirigiendo al inicio de sesión...</p>
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
                                    <p className="auth-subtitle">Crea tu cuenta</p>
                                    <p className="auth-desc">Gestiona tu infraestructura cloud desde un solo lugar.</p>
                                </>
                            ) : (
                                <>
                                    <p className="auth-subtitle">Verifica tu correo</p>
                                    <p className="auth-desc">Ingresa el código de 6 dígitos que enviamos a {email}</p>
                                </>
                            )}
                        </div>

                        {step === 'form' ? (
                            <form onSubmit={handleSubmit} className="reg-form">
                                <div className="form-group">
                                    <label><MorphIcon icon={User} size={15} /> Nombre Completo</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="Juan Pérez"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className="form-group">
                                    <label><MorphIcon icon={Mail} size={15} /> Correo Electrónico</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="nombre@ejemplo.com"
                                        required
                                    />
                                </div>
                                <div className="form-group pw-group">
                                    <label><MorphIcon icon={Lock} size={15} /> Contraseña</label>
                                    <div className="password-field-wrapper">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            placeholder="Mínimo 8 caracteres"
                                            minLength={8}
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="pw-toggle-btn"
                                            tabIndex={-1}
                                            onClick={() => setShowPassword(v => !v)}
                                            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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
                                                Seguridad: {passwordStrength.label}
                                            </span>

                                            <div className="pw-requirements">
                                                <ul>
                                                    <li className={pwChecks.length ? 'pw-req-met' : ''}>
                                                        <MorphIcon icon={pwChecks.length ? CheckCircle : Circle} size={13} spring="snappy" />
                                                        <span>Mínimo 8 caracteres</span>
                                                    </li>
                                                    <li className={pwChecks.upper ? 'pw-req-met' : ''}>
                                                        <MorphIcon icon={pwChecks.upper ? CheckCircle : Circle} size={13} spring="snappy" />
                                                        <span>Una letra mayúscula</span>
                                                    </li>
                                                    <li className={pwChecks.lower ? 'pw-req-met' : ''}>
                                                        <MorphIcon icon={pwChecks.lower ? CheckCircle : Circle} size={13} spring="snappy" />
                                                        <span>Una letra minúscula</span>
                                                    </li>
                                                    <li className={pwChecks.number ? 'pw-req-met' : ''}>
                                                        <MorphIcon icon={pwChecks.number ? CheckCircle : Circle} size={13} spring="snappy" />
                                                        <span>Un número</span>
                                                    </li>
                                                    <li className={pwChecks.special ? 'pw-req-met' : ''}>
                                                        <MorphIcon icon={pwChecks.special ? CheckCircle : Circle} size={13} spring="snappy" />
                                                        <span>Un carácter especial</span>
                                                    </li>
                                                </ul>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <button type="submit" disabled={loading}>
                                    {loading ? 'Enviando código...' : <><MorphIcon icon={User} size={17} /> Crear cuenta gratis</>}
                                </button>

                                <div className="login-footer">
                                    <button type="button" className="btn-link" onClick={() => navigate('/login')}>
                                        ¿Ya tienes cuenta? Inicia sesión <MorphIcon icon={ArrowRight} size={14} />
                                    </button>
                                </div>

                                {error && (
                                    <div className="message error-message">{error}</div>
                                )}
                            </form>
                        ) : (
                            <form onSubmit={handleVerify}>
                                <div className="totp-group">
                                    <p className="totp-hint">
                                        <MorphIcon icon={ShieldCheck} size={14} /> Revisa tu bandeja de entrada (y spam, por si acaso)
                                    </p>
                                    <OTPInput value={code} onChange={setCode} />
                                </div>

                                <button type="submit" disabled={loading || code.length < 6}>
                                    {loading ? 'Verificando...' : <><MorphIcon icon={ShieldCheck} size={17} /> Verificar y crear cuenta</>}
                                </button>

                                <div className="login-footer">
                                    <button
                                        type="button"
                                        className="btn-link"
                                        onClick={handleResend}
                                        disabled={resendCooldown > 0 || loading}
                                    >
                                        {resendCooldown > 0 ? `Reenviar código (${resendCooldown}s)` : 'Reenviar código'}
                                    </button>
                                </div>

                                <div className="login-footer">
                                    <button
                                        type="button"
                                        className="btn-link"
                                        onClick={() => { setStep('form'); setError(null); setCode(''); }}
                                    >
                                        ← Cambiar datos
                                    </button>
                                </div>

                                {error && (
                                    <div className="message error-message">{error}</div>
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
