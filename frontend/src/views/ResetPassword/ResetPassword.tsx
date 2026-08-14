import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthService } from '../../services/auth.service';
import { Lock, KeyRound, CheckCircle, Circle, Eye, EyeOff, Sun, Moon, ArrowRight } from 'lucide-react';
import '../Login/Login.css';
import './ResetPassword.css';

const ResetPassword: React.FC = () => {
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
        if (score <= 2) return { level: 1, label: 'Débil', percent: 33 };
        if (score <= 4) return { level: 2, label: 'Media', percent: 66 };
        return { level: 3, label: 'Fuerte', percent: 100 };
    }, [newPassword, pwChecks]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        setLoading(true);
        try {
            const result = await AuthService.resetPassword(token, newPassword);
            if (result.success) {
                setSuccess(true);
                setTimeout(() => navigate('/login'), 2200);
            } else {
                setError(result.message || 'No se pudo restablecer la contraseña');
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message
                ?? (err?.code === 'ERR_NETWORK' ? 'No se pudo conectar al servidor.' : null)
                ?? 'Error al procesar la solicitud';
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
                    title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                    aria-label="Cambiar tema"
                >
                    <span key={isDark ? 'dark' : 'light'} className="theme-icon">
                        {isDark ? <Sun size={18} /> : <Moon size={18} />}
                    </span>
                </button>

                {!token ? (
                    <div className="reg-success">
                        <KeyRound size={44} className="reg-success-icon reset-invalid-icon" />
                        <h2>Enlace inválido</h2>
                        <p>Este enlace de recuperación no es válido o está incompleto. Solicita uno nuevo desde el login.</p>
                        <div className="login-footer">
                            <button type="button" className="btn-link" onClick={() => navigate('/login')}>
                                ← Volver al inicio de sesión
                            </button>
                        </div>
                    </div>
                ) : success ? (
                    <div className="reg-success">
                        <CheckCircle size={44} className="reg-success-icon" />
                        <h2>¡Contraseña actualizada!</h2>
                        <p>Redirigiendo al inicio de sesión...</p>
                    </div>
                ) : (
                    <>
                        <div className="login-header">
                            <div className="auth-brand">
                                <KeyRound size={32} className="auth-brand-icon" />
                                <span className="auth-brand-name">CloudCore</span>
                            </div>
                            <div className="auth-divider" />
                            <p className="auth-subtitle">Nueva contraseña</p>
                            <p className="auth-desc">Este enlace es válido por 5 minutos.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="reg-form">
                            <div className="form-group pw-group">
                                <label><Lock size={15} /> Nueva contraseña</label>
                                <div className="password-field-wrapper">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="Mínimo 8 caracteres"
                                        minLength={8}
                                        required
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        className="pw-toggle-btn"
                                        tabIndex={-1}
                                        onClick={() => setShowPassword(v => !v)}
                                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    >
                                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
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
                                            Seguridad: {passwordStrength.label}
                                        </span>

                                        <div className="pw-requirements">
                                            <ul>
                                                <li className={pwChecks.length ? 'pw-req-met' : ''}>
                                                    {pwChecks.length ? <CheckCircle size={13} /> : <Circle size={13} />}
                                                    <span>Mínimo 8 caracteres</span>
                                                </li>
                                                <li className={pwChecks.upper ? 'pw-req-met' : ''}>
                                                    {pwChecks.upper ? <CheckCircle size={13} /> : <Circle size={13} />}
                                                    <span>Una letra mayúscula</span>
                                                </li>
                                                <li className={pwChecks.lower ? 'pw-req-met' : ''}>
                                                    {pwChecks.lower ? <CheckCircle size={13} /> : <Circle size={13} />}
                                                    <span>Una letra minúscula</span>
                                                </li>
                                                <li className={pwChecks.number ? 'pw-req-met' : ''}>
                                                    {pwChecks.number ? <CheckCircle size={13} /> : <Circle size={13} />}
                                                    <span>Un número</span>
                                                </li>
                                                <li className={pwChecks.special ? 'pw-req-met' : ''}>
                                                    {pwChecks.special ? <CheckCircle size={13} /> : <Circle size={13} />}
                                                    <span>Un carácter especial</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="form-group">
                                <label><Lock size={15} /> Confirmar contraseña</label>
                                <div className="password-field-wrapper">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="Repite la contraseña"
                                        minLength={8}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="pw-toggle-btn"
                                        tabIndex={-1}
                                        onClick={() => setShowConfirmPassword(v => !v)}
                                        aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    >
                                        {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                    </button>
                                </div>
                            </div>

                            <button type="submit" disabled={loading}>
                                {loading ? 'Actualizando...' : <><KeyRound size={17} /> Restablecer contraseña</>}
                            </button>

                            <div className="login-footer">
                                <button type="button" className="btn-link" onClick={() => navigate('/login')}>
                                    ¿Ya la recordaste? Inicia sesión <ArrowRight size={14} />
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
