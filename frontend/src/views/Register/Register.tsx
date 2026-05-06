import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../../services/auth.service';
import { Mail, Lock, User, ArrowRight, Cloud, CheckCircle } from 'lucide-react';
import '../Login/Login.css';
import './Register.css';

const Register: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

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

                        <form onSubmit={handleSubmit}>
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
                            <div className="form-group">
                                <label><Lock size={15} /> Contraseña</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Mínimo 8 caracteres"
                                    minLength={8}
                                    required
                                />
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
