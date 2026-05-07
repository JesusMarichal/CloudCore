import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../../services/auth.service';
import { Mail, Lock, LogIn, ArrowRight, Cloud, ShieldCheck } from 'lucide-react';
import OTPInput from '../../components/OTPInput';
import './Login.css';

const Login: React.FC = () => {
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [step, setStep]         = useState<'credentials' | '2fa'>('credentials');
    const [pendingUserId, setPendingUserId] = useState('');
    const [error, setError]       = useState<string | null>(null);
    const [loading, setLoading]   = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (step === 'credentials') {
                const result = await AuthService.login({ email, password });
                if (result.success && result.require2FA) {
                    setPendingUserId(result.userId);
                    setStep('2fa');
                } else if (result.success) {
                    localStorage.setItem('user', JSON.stringify(result.user));
                    navigate('/dashboard');
                } else {
                    setError(result.message || 'Credenciales incorrectas');
                }
            } else {
                const result = await AuthService.verify2FALogin(pendingUserId, totpCode);
                if (result.success) {
                    localStorage.setItem('user', JSON.stringify(result.user));
                    navigate('/dashboard');
                } else {
                    setError(result.message || 'Código incorrecto');
                }
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message
                ?? (err?.code === 'ERR_NETWORK' ? 'No se pudo conectar al servidor. Verifica que esté en ejecución.' : null)
                ?? 'Error al procesar la solicitud';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="background-animation">
                <div className="shape shape-1" /><div className="shape shape-2" />
                <div className="shape shape-3" /><div className="shape shape-4" />
            </div>

            <div className="login-card">
                <div className="login-header">
                    <div className="auth-brand">
                        <Cloud size={32} className="auth-brand-icon" />
                        <span className="auth-brand-name">CloudCore</span>
                    </div>
                    <div className="auth-divider" />
                    {step === 'credentials' ? (
                        <>
                            <p className="auth-subtitle">Bienvenido de nuevo</p>
                            <p className="auth-desc">Infraestructura SaaS de alto rendimiento</p>
                        </>
                    ) : (
                        <>
                            <p className="auth-subtitle">Verificación en dos pasos</p>
                            <p className="auth-desc">Ingresa el código de 6 dígitos de tu app autenticadora</p>
                        </>
                    )}
                </div>

                <form onSubmit={handleSubmit}>
                    {step === 'credentials' ? (
                        <>
                            <div className="form-group">
                                <label><Mail size={15} /> Correo Electrónico</label>
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                    placeholder="nombre@ejemplo.com" required autoFocus />
                            </div>
                            <div className="form-group">
                                <label><Lock size={15} /> Contraseña</label>
                                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••••" required />
                            </div>
                        </>
                    ) : (
                        <div className="totp-group">
                            <p className="totp-hint">
                                <ShieldCheck size={14} /> Código de tu app autenticadora
                            </p>
                            <OTPInput value={totpCode} onChange={setTotpCode} />
                        </div>
                    )}

                    <button type="submit" disabled={loading || (step === '2fa' && totpCode.length < 6)}>
                        {loading ? 'Verificando...' : step === 'credentials'
                            ? <><LogIn size={17} /> Iniciar Sesión</>
                            : <><ShieldCheck size={17} /> Verificar</>
                        }
                    </button>

                    {step === '2fa' && (
                        <div className="login-footer">
                            <button type="button" className="btn-link"
                                onClick={() => { setStep('credentials'); setError(null); setTotpCode(''); }}>
                                ← Volver al inicio de sesión
                            </button>
                        </div>
                    )}

                    {step === 'credentials' && (
                        <div className="login-footer">
                            <button type="button" className="btn-link" onClick={() => navigate('/register')}>
                                ¿No tienes cuenta? Regístrate gratis <ArrowRight size={14} />
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="message error-message">{error}</div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default Login;
