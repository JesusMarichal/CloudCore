import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../../services/auth.service';
import { Mail, Lock, LogIn, User, ArrowRight } from 'lucide-react';
import './Login.css';

const Login: React.FC = () => {
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (isRegister) {
                const result = await AuthService.register({ name, email, password });
                if (result.success) {
                    setIsRegister(false);
                    setError("Registro exitoso. ¡Inicia sesión!");
                } else {
                    setError(result.message || "Error al registrarse");
                }
            } else {
                const result = await AuthService.login({ email, password });
                if (result.success) {
                    localStorage.setItem('user', JSON.stringify(result.user));
                    navigate('/dashboard');
                } else {
                    setError(result.message || "Credenciales incorrectas");
                }
            }
        } catch (err) {
            setError("Error de conexión con el servidor");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1>CloudCore</h1>
                    <p>{isRegister ? 'Crea tu cuenta de infraestructura' : 'Infraestructura SaaS de alto rendimiento'}</p>
                </div>

                <form onSubmit={handleSubmit}>
                    {isRegister && (
                        <div className="form-group">
                            <label>
                                <User size={16} /> Nombre Completo
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Juan Pérez"
                                required
                            />
                        </div>
                    )}
                    <div className="form-group">
                        <label>
                            <Mail size={16} /> Correo Electrónico
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="nombre@ejemplo.com"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>
                            <Lock size={16} /> Contraseña
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button type="submit" disabled={loading}>
                        {loading ? 'Procesando...' : (
                            <>
                                {isRegister ? <User size={18} /> : <LogIn size={18} />}
                                {isRegister ? 'Registrarse' : 'Iniciar Sesión'}
                            </>
                        )}
                    </button>

                    <div className="login-footer">
                        <button
                            type="button"
                            className="btn-link"
                            onClick={() => {
                                setIsRegister(!isRegister);
                                setError(null);
                            }}
                        >
                            {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate gratis'}
                            <ArrowRight size={14} />
                        </button>
                    </div>

                    {error && (
                        <div className={`message ${error.includes('exitoso') ? 'success-message' : 'error-message'}`}>
                            {error}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default Login;
