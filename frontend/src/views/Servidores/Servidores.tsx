import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import './Servidores.css';


const Servidores: React.FC = () => {
    const navigate = useNavigate();
    const [showForm, setShowForm] = useState(false);

    const [servers, setServers] = useState<CreateServerData[]>([]);
    const [formData, setFormData] = useState<CreateServerData>({
        name: '',
        ip: '',
        sshPort: 22,
        sshUser: 'root',
        authType: 'key',
        privateKey: '',
        password: '',
    });
    const [loading, setLoading] = useState(false);

    const getUserId = () => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            return user.id;
        }
        return null;
    };

    const loadServers = async () => {
        const userId = getUserId();
        if (!userId) {
            navigate('/');
            return;
        }

        try {
            const data = await serverService.list(userId);
            setServers(data);
        } catch (error) {
            console.error('Error cargando servidores:', error);
        }
    };

    useEffect(() => {
        loadServers();
        const interval = setInterval(loadServers, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const userId = getUserId();
        if (!userId) {
            alert('Error: No se encontró el usuario logueado');
            return;
        }

        setLoading(true);
        try {
            await serverService.create({ ...formData, userId });
            setShowForm(false);
            setFormData({
                name: '',
                ip: '',
                sshPort: 22,
                sshUser: 'root',
                authType: 'key',
                privateKey: '',
                password: '',
            });
            loadServers();
        } catch (error) {
            alert('Error: ' + (error as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async (id: string) => {
        try {
            await serverService.refresh(id);
            loadServers();
        } catch (error) {
            console.error('Error refrescando salud:', error);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'online': return '#2ea043';
            case 'offline': return '#da3633';
            case 'provisioning': return '#d29922';
            default: return 'var(--gh-text-muted)';
        }
    };

    const getMetricColor = (value: number) => {
        if (value > 80) return '#da3633';
        if (value > 60) return '#d29922';
        return '#2ea043';
    };

    return (
        <div className="servidores-container">
            <div className="header-actions">
                <div>
                    <h1>Mis Servidores</h1>
                    <p className="text-muted">Gestiona y monitorea tu infraestructura en tiempo real</p>
                </div>
                <button className="btn-primary" onClick={() => setShowForm(true)}>
                    <span className="plus-icon">+</span> Nuevo Servidor
                </button>
            </div>

            <div className="servers-list-container">
                <table className="servers-table">
                    <thead>
                        <tr>
                            <th>Nombre / IP</th>
                            <th>Estado</th>
                            <th>CPU</th>
                            <th>RAM</th>
                            <th>Disco</th>
                            <th>Temp</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {servers.map(server => (
                            <tr key={server.id} className="server-row">
                                <td>
                                    <div className="server-main-info">
                                        <span className="server-name">{server.name}</span>
                                        <code className="server-ip-mini">{server.ip}</code>
                                    </div>
                                </td>
                                <td>
                                    <div className="status-wrapper">
                                        <span
                                            className="status-dot"
                                            style={{ backgroundColor: getStatusColor(server.status!) }}
                                        ></span>
                                        <span className="status-text">{server.status}</span>
                                        {server.status === 'provisioning' && (
                                            <div className="provisioning-mini-status">
                                                <div className="spinner-mini"></div>
                                                <span>{server.provisioningStep || 'Procesando...'}</span>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="metric-cell">
                                    <div className="mini-metric">
                                        <div className="progress-bar-mini">
                                            <div
                                                className="progress-fill"
                                                style={{
                                                    width: `${server.cpuUsage || 0}%`,
                                                    backgroundColor: getMetricColor(server.cpuUsage || 0)
                                                }}
                                            ></div>
                                        </div>
                                        <span>{server.cpuUsage || 0}%</span>
                                    </div>
                                </td>
                                <td className="metric-cell">
                                    <div className="mini-metric">
                                        <div className="progress-bar-mini">
                                            <div
                                                className="progress-fill"
                                                style={{
                                                    width: `${server.ramUsage || 0}%`,
                                                    backgroundColor: getMetricColor(server.ramUsage || 0)
                                                }}
                                            ></div>
                                        </div>
                                        <span>{server.ramUsage || 0}%</span>
                                    </div>
                                </td>
                                <td className="metric-cell">
                                    <div className="mini-metric">
                                        <div className="progress-bar-mini">
                                            <div
                                                className="progress-fill"
                                                style={{
                                                    width: `${server.diskUsage || 0}%`,
                                                    backgroundColor: getMetricColor(server.diskUsage || 0)
                                                }}
                                            ></div>
                                        </div>
                                        <span>{server.diskUsage || 0}%</span>
                                    </div>
                                </td>
                                <td>
                                    <span className="temp-badge">
                                        {(server.temp !== null && server.temp !== undefined) ? `${Math.round(server.temp)}°C` : 'N/A'}
                                    </span>
                                </td>


                                <td>
                                    <div className="server-actions-list">
                                        <button
                                            className="btn-icon refresh-btn"
                                            onClick={(e) => {
                                                const btn = e.currentTarget;
                                                btn.classList.add('spinning');
                                                handleRefresh(server.id!).finally(() => {
                                                    btn.classList.remove('spinning');
                                                });
                                            }}
                                            title="Refrescar métricas"
                                        >
                                            <RefreshCw size={14} />
                                        </button>
                                        <button className="btn-secondary btn-sm">Gestionar</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {servers.length === 0 && !loading && (
                    <div className="empty-state-list">
                        <div className="empty-icon">☁️</div>
                        <h3>No hay servidores</h3>
                        <p>Agrega tu primer servidor VPS para comenzar.</p>
                        <button className="btn-primary" onClick={() => setShowForm(true)}>
                            Agregar Servidor
                        </button>
                    </div>
                )}
            </div>



            {showForm && (
                <div className="modal-overlay">
                    <div className="server-form-card">
                        <h2>Agregar Nuevo Servidor</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Nombre del Servidor</label>
                                <input
                                    type="text"
                                    placeholder="Mi VPS"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Dirección IP o Hostname</label>
                                <input
                                    type="text"
                                    placeholder="ec2-52-15... o 1.2.3.4"
                                    value={formData.ip}
                                    onChange={e => setFormData({ ...formData, ip: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Puerto SSH</label>
                                    <input
                                        type="number"
                                        value={formData.sshPort}
                                        onChange={e => setFormData({ ...formData, sshPort: parseInt(e.target.value) })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Usuario SSH</label>
                                    <input
                                        type="text"
                                        placeholder="ubuntu, root, deploy..."
                                        value={formData.sshUser}
                                        onChange={e => setFormData({ ...formData, sshUser: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Método de Autenticación</label>
                                <select
                                    value={formData.authType}
                                    onChange={e => setFormData({ ...formData, authType: e.target.value as 'key' | 'password' })}
                                >
                                    <option value="key">🔑 Private Key (.pem / .key)</option>
                                    <option value="password">🔐 Password</option>
                                </select>
                            </div>

                            {formData.authType === 'key' ? (
                                <div className="form-group">
                                    <div className="label-with-action">
                                        <label>Private Key (Contenido o archivo)</label>
                                        <label className="file-upload-link">
                                            📁 Cargar archivo .pem
                                            <input
                                                type="file"
                                                accept=".pem,.key,.txt,*"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onload = (ev) => {
                                                            setFormData({ ...formData, privateKey: ev.target?.result as string });
                                                        };
                                                        reader.readAsText(file);
                                                    }
                                                }}
                                                style={{ display: 'none' }}
                                            />
                                        </label>
                                    </div>
                                    <textarea
                                        rows={5}
                                        placeholder="-----BEGIN RSA PRIVATE KEY-----..."
                                        value={formData.privateKey}
                                        onChange={e => setFormData({ ...formData, privateKey: e.target.value })}
                                        required
                                    />
                                </div>
                            ) : (

                                <div className="form-group">
                                    <label>Password</label>
                                    <input
                                        type="password"
                                        placeholder="**********"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        required
                                    />
                                </div>
                            )}

                            <div className="form-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-primary" disabled={loading}>
                                    {loading ? 'Conectando...' : 'Conectar Servidor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Servidores;

