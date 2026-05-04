import { useState, useEffect } from 'react';
import { Github, KeyRound, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { API_URL } from '../../config';
import './Settings.css';

const Settings = () => {
    const [githubToken, setGithubToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

    const getUserId = () => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            return JSON.parse(userStr).id;
        }
        return null;
    };

    useEffect(() => {
        const loadSettings = async () => {
            const userId = getUserId();
            if (!userId) return;

            setLoading(true);
            try {
                // Llamamos a la API para traer el token
                const response = await fetch(`${API_URL}/github/settings/${userId}`);
                const data = await response.json();
                if (data.success && data.token) {
                    setGithubToken(data.token);
                }
            } catch (error) {
                console.error('Error cargando ajustes:', error);
            } finally {
                setLoading(false);
            }
        };

        loadSettings();
    }, []);

    const handleSave = async () => {
        const userId = getUserId();
        if (!userId) return;

        setSaving(true);
        setStatus({ type: null, message: '' });

        try {
            const response = await fetch(`${API_URL}/github/settings/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: githubToken })
            });
            const data = await response.json();

            if (data.success) {
                setStatus({ type: 'success', message: 'Token guardado correctamente. Ahora CloudCore puede ver tus proyectos.' });
            } else {
                setStatus({ type: 'error', message: data.message || 'Error guardando token' });
            }
        } catch (error) {
            console.error('Error guardando ajustes:', error);
            setStatus({ type: 'error', message: 'Error de conexión con el servidor' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="settings-container">
            <div className="settings-header">
                <h2>Ajustes de Integración</h2>
                <p className="subtitle">Conecta tus cuentas externas para automatizar despliegues</p>
            </div>

            <div className="settings-content">
                <div className="setting-card">
                    <div className="setting-card-header">
                        <div className="setting-icon github">
                            <Github size={24} />
                        </div>
                        <div className="setting-title">
                            <h3>GitHub Integration</h3>
                            <p>Conecta CloudCore con Github usando un Personal Access Token (PAT) clásico o fine-grained para desplegar tus repositorios automáticamente.</p>
                        </div>
                    </div>

                    <div className="setting-form">
                        <div className="form-group">
                            <label>Personal Access Token</label>
                            <div className="input-with-icon">
                                <KeyRound size={16} className="input-icon" />
                                <input
                                    type="password"
                                    placeholder="ghp_************************************"
                                    value={githubToken}
                                    onChange={(e) => setGithubToken(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                            <span className="help-text">
                                Necesitas permisos de 'repo' completos. Puedes crearlo en
                                <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer"> GitHub Settings</a>.
                            </span>
                        </div>

                        {status.type && (
                            <div className={`status-alert ${status.type}`}>
                                {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                <span>{status.message}</span>
                            </div>
                        )}

                        <div className="setting-actions">
                            <button className="btn-save" onClick={handleSave} disabled={saving || loading}>
                                {saving ? 'Guardando...' : (
                                    <>
                                        <Save size={16} /> Save Changes
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
