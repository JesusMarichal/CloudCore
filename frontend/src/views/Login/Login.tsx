import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../../services/auth.service';
import { Mail, Lock, LogIn, ArrowRight, Cloud } from 'lucide-react';
import './Login.css';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await AuthService.login({ email, password });
            if (result.success) {
                localStorage.setItem('user', JSON.stringify(result.user));
                navigate('/dashboard');
            } else {
                setError(result.message || 'Credenciales incorrectas');
            }
        } catch {
            setError('Error de conexión con el servidor');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="background-animation">
                <div className="shape shape-1"></div>
                <div className="shape shape-2"></div>
                <div className="shape shape-3"></div>
                <div className="shape shape-4"></div>
            </div>

            <div className="login-card">
                <div className="login-header">
                    <div className="auth-brand">
                        <Cloud size={32} className="auth-brand-icon" />
                        <span className="auth-brand-name">CloudCore</span>
                    </div>
                    <div className="auth-divider" />
                    <p className="auth-subtitle">Bienvenido de nuevo</p>
                    <p className="auth-desc">Infraestructura SaaS de alto rendimiento</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label><Mail size={15} /> Correo Electrónico</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="nombre@ejemplo.com"
                            required
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label><Lock size={15} /> Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button type="submit" disabled={loading}>
                        {loading ? 'Iniciando sesión...' : <><LogIn size={17} /> Iniciar Sesión</>}
                    </button>

                    <div className="login-footer">
                        <button type="button" className="btn-link" onClick={() => navigate('/register')}>
                            ¿No tienes cuenta? Regístrate gratis <ArrowRight size={14} />
                        </button>
                    </div>

                    {error && (
                        <div className="message error-message">{error}</div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default Login;
