import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import { Database as DatabaseIcon, Plus, Play, Square, RotateCcw, Trash2, ExternalLink, Copy, Eye, EyeOff, X, HardDrive } from 'lucide-react';
import './Database.css';

interface DatabaseInstance {
    id: string;
    serverId: string;
    serverName: string;
    serverIp: string;
    name: string;
    engine: 'mysql' | 'postgres';
    port: string;
    dbName: string;
    dbUser: string;
    dbPassword: string;
    status: 'running' | 'stopped' | 'deploying';
    adminPort?: string; // phpMyAdmin port for MySQL
    createdAt: string;
}

interface DbFormData {
    serverId: string;
    name: string;
    engine: 'mysql' | 'postgres';
    port: string;
    dbName: string;
    dbUser: string;
    dbPassword: string;
    adminPort: string; // phpMyAdmin port for MySQL
}

const DatabaseView = () => {
    const navigate = useNavigate();
    const [servers, setServers] = useState<CreateServerData[]>([]);
    const [databases, setDatabases] = useState<DatabaseInstance[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [deployLogs, setDeployLogs] = useState('');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [showPasswords, setShowPasswords] = useState<{ [key: string]: boolean }>({});
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const [formData, setFormData] = useState<DbFormData>({
        serverId: '',
        name: '',
        engine: 'mysql',
        port: '3306',
        dbName: 'mydb',
        dbUser: 'admin',
        dbPassword: '',
        adminPort: '8080',
    });

    const getUserId = () => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            return user.id;
        }
        return null;
    };

    useEffect(() => {
        const loadData = async () => {
            const userId = getUserId();
            if (!userId) {
                navigate('/');
                return;
            }

            try {
                const serverData = await serverService.list(userId);
                setServers(serverData);
                if (serverData.length > 0) {
                    setFormData(prev => ({ ...prev, serverId: serverData[0].id || '' }));
                }

                // Load databases
                const dbData = await serverService.listDatabases(userId);
                setDatabases(dbData);
            } catch (error) {
                console.error('Error cargando datos:', error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [deployLogs]);

    const handleEngineChange = (engine: 'mysql' | 'postgres') => {
        setFormData(prev => ({
            ...prev,
            engine,
            port: engine === 'mysql' ? '3306' : '5432',
            adminPort: engine === 'mysql' ? '8080' : '',
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setDeploying(true);
        setDeployLogs('Iniciando despliegue de base de datos...\n');

        try {
            const userId = getUserId();
            await serverService.deployDatabase(formData.serverId, {
                ...formData,
                userId: userId || '',
            }, (chunk: string) => {
                setDeployLogs(prev => prev + chunk);
            });

            setShowForm(false);
            setFormData({
                serverId: servers[0]?.id || '',
                name: '',
                engine: 'mysql',
                port: '3306',
                dbName: 'mydb',
                dbUser: 'admin',
                dbPassword: '',
                adminPort: '8080',
            });
            setDeployLogs('');

            // Reload databases
            const userId2 = getUserId();
            if (userId2) {
                const dbData = await serverService.listDatabases(userId2);
                setDatabases(dbData);
            }
        } catch (error) {
            console.error('Error desplegando base de datos:', error);
            alert('Error al desplegar la base de datos.');
        } finally {
            setDeploying(false);
        }
    };

    const handleDbAction = async (db: DatabaseInstance, action: 'start' | 'stop' | 'restart') => {
        setActionLoading(`${db.id}-${action}`);
        try {
            await serverService.manageDatabaseContainer(db.serverId, db.id, action);
            // Reload
            const userId = getUserId();
            if (userId) {
                const dbData = await serverService.listDatabases(userId);
                setDatabases(dbData);
            }
        } catch (error) {
            console.error(`Error ejecutando ${action}:`, error);
            alert(`Error al ejecutar ${action} en la base de datos.`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (db: DatabaseInstance) => {
        if (!window.confirm(`¿Estás seguro de eliminar la base de datos "${db.name}"? Todos los datos serán eliminados permanentemente.`)) return;
        setActionLoading(`${db.id}-delete`);
        try {
            await serverService.deleteDatabase(db.serverId, db.id);
            setDatabases(databases.filter(d => d.id !== db.id));
        } catch (error) {
            console.error('Error eliminando base de datos:', error);
            alert('Error al eliminar la base de datos.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleCopy = (text: string, fieldId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldId);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const getConnectionString = (db: DatabaseInstance) => {
        if (db.engine === 'mysql') {
            return `mysql://${db.dbUser}:${db.dbPassword}@${db.serverIp}:${db.port}/${db.dbName}`;
        }
        return `postgresql://${db.dbUser}:${db.dbPassword}@${db.serverIp}:${db.port}/${db.dbName}`;
    };

    const getAdminUrl = (db: DatabaseInstance) => {
        if (db.engine === 'mysql' && db.adminPort) {
            return `http://${db.serverIp}:${db.adminPort}`;
        }
        return null;
    };

    return (
        <div className="database-container">
            <header className="page-header">
                <div>
                    <h1><DatabaseIcon size={24} className="icon-blue" /> Bases de Datos</h1>
                    <p className="text-muted">Despliega y administra bases de datos MySQL y PostgreSQL en tus servidores.</p>
                </div>
                {servers.length > 0 && (
                    <button className="btn-primary" onClick={() => setShowForm(true)}>
                        <Plus size={16} /> Nueva Base de Datos
                    </button>
                )}
            </header>

            {!showForm ? (
                loading ? (
                    <div className="db-empty-state"><p>Cargando...</p></div>
                ) : servers.length === 0 ? (
                    <div className="db-empty-state">
                        <div className="db-empty-icon">🖥️</div>
                        <h3>No tienes servidores conectados</h3>
                        <p className="text-muted">
                            Para crear una base de datos, primero debes agregar un servidor en la sección de Instancias.
                        </p>
                        <button className="btn-primary" onClick={() => navigate('/dashboard/servers')}>
                            Ir a Servidores
                        </button>
                    </div>
                ) : databases.length === 0 ? (
                    <div className="db-empty-state">
                        <div className="db-empty-icon">
                            <DatabaseIcon size={48} />
                        </div>
                        <h3>No hay bases de datos desplegadas</h3>
                        <p className="text-muted">
                            Tienes {servers.length} servidor(es) listo(s). ¡Despliega tu primera base de datos con un clic!
                        </p>
                        <button className="btn-primary" onClick={() => setShowForm(true)}>
                            <Plus size={16} /> Crear mi primera Base de Datos
                        </button>
                    </div>
                ) : (
                    <div className="db-list">
                        {databases.map(db => {
                            const adminUrl = getAdminUrl(db);
                            const connStr = getConnectionString(db);
                            return (
                                <div key={db.id} className="db-card">
                                    <div className="db-card-header">
                                        <div className="db-card-header-left">
                                            <div className={`db-engine-icon ${db.engine}`}>
                                                {db.engine === 'mysql' ? '🐬' : '🐘'}
                                            </div>
                                            <div className="db-card-title">
                                                <h3>{db.name}</h3>
                                                <div className="db-card-subtitle">
                                                    <span className={`db-engine-tag ${db.engine}`}>
                                                        {db.engine === 'mysql' ? 'MySQL' : 'PostgreSQL'}
                                                    </span>
                                                    <span>•</span>
                                                    <HardDrive size={12} />
                                                    <span>{db.serverIp}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="db-card-actions">
                                            <span className={`db-status-badge ${db.status}`}>
                                                <span className="db-status-dot"></span>
                                                {db.status === 'running' ? 'Activo' : db.status === 'deploying' ? 'Desplegando' : 'Detenido'}
                                            </span>
                                            {db.status === 'running' ? (
                                                <button
                                                    className="db-btn-action stop"
                                                    onClick={() => handleDbAction(db, 'stop')}
                                                    disabled={actionLoading === `${db.id}-stop`}
                                                    title="Detener"
                                                >
                                                    <Square size={14} />
                                                </button>
                                            ) : db.status === 'stopped' ? (
                                                <button
                                                    className="db-btn-action start"
                                                    onClick={() => handleDbAction(db, 'start')}
                                                    disabled={actionLoading === `${db.id}-start`}
                                                    title="Iniciar"
                                                >
                                                    <Play size={14} />
                                                </button>
                                            ) : null}
                                            <button
                                                className="db-btn-action restart"
                                                onClick={() => handleDbAction(db, 'restart')}
                                                disabled={actionLoading?.startsWith(db.id) || false}
                                                title="Reiniciar"
                                            >
                                                <RotateCcw size={14} />
                                            </button>
                                            <button
                                                className="db-btn-action delete"
                                                onClick={() => handleDelete(db)}
                                                disabled={actionLoading?.startsWith(db.id) || false}
                                                title="Eliminar"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="db-card-body">
                                        <div className="db-info-grid">
                                            <div className="db-info-item">
                                                <span className="db-label">Puerto</span>
                                                <span className="db-value">{db.port}</span>
                                            </div>
                                            <div className="db-info-item">
                                                <span className="db-label">Base de Datos</span>
                                                <span className="db-value">{db.dbName}</span>
                                            </div>
                                            <div className="db-info-item">
                                                <span className="db-label">Usuario</span>
                                                <span className="db-value">{db.dbUser}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Connection string */}
                                    <div style={{ padding: '0 24px 16px' }}>
                                        <div className="db-connection-string">
                                            <code>{connStr}</code>
                                            <button
                                                className="db-copy-btn"
                                                onClick={() => handleCopy(connStr, `conn-${db.id}`)}
                                            >
                                                <Copy size={12} />
                                                {copiedField === `conn-${db.id}` ? '¡Copiado!' : 'Copiar'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Admin panel link for MySQL (phpMyAdmin) */}
                                    {adminUrl && (
                                        <div className="db-card-footer">
                                            <div className="db-card-footer-left">
                                                <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    Panel de Administración
                                                </span>
                                            </div>
                                            <a
                                                href={adminUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="db-admin-link"
                                            >
                                                <ExternalLink size={14} />
                                                Abrir phpMyAdmin
                                            </a>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )
            ) : (
                <div className="db-form-card">
                    <div className="db-form-header">
                        <h2><DatabaseIcon size={20} className="icon-blue" /> Nueva Base de Datos</h2>
                        <button className="btn-close" onClick={() => { setShowForm(false); setDeployLogs(''); }}>
                            <X size={20} />
                        </button>
                    </div>
                    <form onSubmit={handleSubmit}>
                        {/* Engine selector */}
                        <div className="db-engine-selector">
                            <div
                                className={`db-engine-option ${formData.engine === 'mysql' ? 'selected' : ''}`}
                                onClick={() => handleEngineChange('mysql')}
                            >
                                <span className="engine-icon">🐬</span>
                                <span className="engine-name">MySQL</span>
                                <span className="engine-desc">Incluye phpMyAdmin para administración visual</span>
                            </div>
                            <div
                                className={`db-engine-option ${formData.engine === 'postgres' ? 'selected' : ''}`}
                                onClick={() => handleEngineChange('postgres')}
                            >
                                <span className="engine-icon">🐘</span>
                                <span className="engine-name">PostgreSQL</span>
                                <span className="engine-desc">Base de datos relacional avanzada</span>
                            </div>
                        </div>

                        <div className="db-form-section">
                            <h3>Configuración del Servidor</h3>
                            <div className="form-group">
                                <label>Servidor de destino</label>
                                <select
                                    value={formData.serverId}
                                    onChange={e => setFormData({ ...formData, serverId: e.target.value })}
                                    required
                                >
                                    <option value="" disabled>Seleccionar servidor...</option>
                                    {servers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.ip})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Nombre de la instancia</label>
                                <input
                                    type="text"
                                    placeholder="mi-base-de-datos"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="db-form-section">
                            <h3>Credenciales</h3>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Nombre de la Base de Datos</label>
                                    <input
                                        type="text"
                                        placeholder="mydb"
                                        value={formData.dbName}
                                        onChange={e => setFormData({ ...formData, dbName: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Puerto</label>
                                    <input
                                        type="number"
                                        value={formData.port}
                                        onChange={e => setFormData({ ...formData, port: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Usuario</label>
                                    <input
                                        type="text"
                                        placeholder="admin"
                                        value={formData.dbUser}
                                        onChange={e => setFormData({ ...formData, dbUser: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Contraseña</label>
                                    <div className="db-password-field">
                                        <input
                                            type={showPasswords['form'] ? 'text' : 'password'}
                                            placeholder="contraseña segura"
                                            value={formData.dbPassword}
                                            onChange={e => setFormData({ ...formData, dbPassword: e.target.value })}
                                            required
                                            style={{ paddingRight: '40px', width: '100%' }}
                                        />
                                        <button
                                            type="button"
                                            className="db-password-toggle"
                                            onClick={() => setShowPasswords(prev => ({ ...prev, form: !prev.form }))}
                                        >
                                            {showPasswords['form'] ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {formData.engine === 'mysql' && (
                                <div className="form-group">
                                    <label>Puerto de phpMyAdmin</label>
                                    <input
                                        type="number"
                                        placeholder="8080"
                                        value={formData.adminPort}
                                        onChange={e => setFormData({ ...formData, adminPort: e.target.value })}
                                        required
                                    />
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                        Accederás a phpMyAdmin desde http://[IP-del-servidor]:{formData.adminPort || '8080'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {deploying && (
                            <div className="db-deploy-progress">
                                <h4>
                                    <div className="db-spinner"></div>
                                    Desplegando {formData.engine === 'mysql' ? 'MySQL + phpMyAdmin' : 'PostgreSQL'}...
                                </h4>
                                <div className="db-deploy-logs">
                                    {deployLogs}
                                    <div ref={logsEndRef} />
                                </div>
                            </div>
                        )}

                        <div className="form-actions">
                            <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setDeployLogs(''); }}>
                                Cancelar
                            </button>
                            <button type="submit" className="btn-primary" disabled={deploying}>
                                {deploying ? 'Desplegando...' : 'Desplegar Base de Datos'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default DatabaseView;
