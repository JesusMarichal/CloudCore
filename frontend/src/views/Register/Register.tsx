import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../../services/auth.service';
import { Mail, Lock, User, ArrowRight, Cloud, CheckCircle, Circle, Sun, Moon } from 'lucide-react';
import '../Login/Login.css';
import './Register.css';

const Register: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isDark, setIsDark] = useState(false); // arranca en claro (blanco) por defecto
    const navigate = useNavigate();

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await AuthService.register({ name, email, password });
            if (result.success) {
                setSuccess(true);
                setTimeout(() => navigate('/login'), 2200);
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
                    <span key={isDark ? 'dark' : 'light'} className="theme-icon">
                        {isDark ? <Sun size={18} /> : <Moon size={18} />}
                    </span>
                </button>

                {success ? (
                    <div className="reg-success">
                        <CheckCircle size={44} className="reg-success-icon" />
                        <h2>¡Cuenta creada!</h2>
                        <p>Redirigiendo al inicio de sesión...</p>
                    </div>
                ) : (
                    <>
                        <div className="login-header">
                            <div className="auth-brand">
                                <Cloud size={32} className="auth-brand-icon" />
                                <span className="auth-brand-name">CloudCore</span>
                            </div>
                            <div className="auth-divider" />
                            <p className="auth-subtitle">Crea tu cuenta</p>
                            <p className="auth-desc">Gestiona tu infraestructura cloud desde un solo lugar.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="reg-form">
                            <div className="form-group">
                                <label><User size={15} /> Nombre Completo</label>
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
                                <label><Mail size={15} /> Correo Electrónico</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="nombre@ejemplo.com"
                                    required
                                />
                            </div>
                            <div className="form-group pw-group">
                                <label><Lock size={15} /> Contraseña</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Mínimo 8 caracteres"
                                    minLength={8}
                                    required
                                />
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

                            <button type="submit" disabled={loading}>
                                {loading ? 'Creando cuenta...' : <><User size={17} /> Crear cuenta gratis</>}
                            </button>

                            <div className="login-footer">
                                <button type="button" className="btn-link" onClick={() => navigate('/login')}>
                                    ¿Ya tienes cuenta? Inicia sesión <ArrowRight size={14} />
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

export default Register;
