import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import { Database as DatabaseIcon, Plus, Play, Square, RotateCcw, Trash2, ExternalLink, Eye, EyeOff, X, HardDrive, Copy, Check, Link } from 'lucide-react';
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
    const [connectionModal, setConnectionModal] = useState<DatabaseInstance | null>(null);
    const [copied, setCopied] = useState(false);
    const [closingConnModal, setClosingConnModal] = useState(false);

    const closeConnectionModal = () => {
        setClosingConnModal(true);
        setTimeout(() => {
            setConnectionModal(null);
            setClosingConnModal(false);
        }, 250);
    };

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

            // setShowForm(false); // Mantener el formulario abierto para ver los logs
            setFormData({
                serverId: formData.serverId, // Mantener el mismo servidor
                name: '',
                engine: 'mysql',
                port: '3306',
                dbName: 'mydb',
                dbUser: 'admin',
                dbPassword: '',
                adminPort: '8080',
            });
            // setDeployLogs(''); // No limpiar los logs automáticamente

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
                                                    <span>{db.serverName} ({db.serverIp})</span>
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
                                            <div className="db-info-item db-info-connect">
                                                <button
                                                    className="db-connect-btn"
                                                    onClick={() => { setConnectionModal(db); setCopied(false); setClosingConnModal(false); }}
                                                >
                                                    <Link size={14} />
                                                    Datos de Conexión
                                                </button>
                                            </div>
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

            {/* Modal for Deployment Progress */}
            {(deploying || deployLogs.trim() !== '') && (
                <div className="db-deploy-modal-overlay">
                    <div className="db-deploy-modal">
                        <div className="db-deploy-modal-header">
                            <h3>
                                {deploying ? (
                                    <><div className="db-spinner" style={{ display: 'inline-block', marginRight: '10px' }}></div> Desplegando {formData.engine === 'mysql' ? 'MySQL + phpMyAdmin' : 'PostgreSQL'}...</>
                                ) : (
                                    <>✅ ¡Despliegue Completado!</>
                                )}
                            </h3>
                            {!deploying && (
                                <button className="btn-close" onClick={() => { setShowForm(false); setDeployLogs(''); }}><X size={20} /></button>
                            )}
                        </div>
                        <div className="db-deploy-modal-body">
                            <div className="db-deploy-terminal">
                                <div className="db-deploy-terminal-header">
                                    <span className="dot" style={{ background: '#ff5f56' }}></span>
                                    <span className="dot" style={{ background: '#ffbd2e' }}></span>
                                    <span className="dot" style={{ background: '#27c93f' }}></span>
                                    <span className="title">Terminal - Instalación</span>
                                </div>
                                <div className="db-deploy-logs console-scroll">
                                    {deployLogs}
                                    <div ref={logsEndRef} />
                                </div>
                            </div>
                        </div>
                        {!deploying && (
                            <div className="db-deploy-modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setDeployLogs('')}>
                                    Limpiar
                                </button>
                                <button type="button" className="btn-primary" onClick={() => { setShowForm(false); setDeployLogs(''); }}>
                                    Terminar
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Connection Info Modal */}
            {connectionModal && (
                <div className={`db-conn-modal-overlay ${closingConnModal ? 'closing' : ''}`} onClick={closeConnectionModal}>
                    <div className={`db-conn-modal ${closingConnModal ? 'closing' : ''}`} onClick={(e) => e.stopPropagation()}>
                        <div className="db-conn-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div className={`db-engine-icon ${connectionModal.engine}`} style={{ width: '36px', height: '36px', fontSize: '20px' }}>
                                    {connectionModal.engine === 'mysql' ? '🐬' : '🐘'}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Datos de Conexión</h3>
                                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{connectionModal.name} • {connectionModal.engine === 'mysql' ? 'MySQL' : 'PostgreSQL'}</p>
                                </div>
                            </div>
                            <button className="btn-close" onClick={closeConnectionModal}><X size={18} /></button>
                        </div>
                        <div className="db-conn-modal-body">
                            <div className="db-conn-grid">
                                <div className="db-conn-item">
                                    <span className="db-conn-label">Host</span>
                                    <span className="db-conn-value">127.0.0.1</span>
                                </div>
                                <div className="db-conn-item">
                                    <span className="db-conn-label">Puerto</span>
                                    <span className="db-conn-value">{connectionModal.port}</span>
                                </div>
                                <div className="db-conn-item">
                                    <span className="db-conn-label">Base de Datos</span>
                                    <span className="db-conn-value">{connectionModal.dbName}</span>
                                </div>
                                <div className="db-conn-item">
                                    <span className="db-conn-label">Usuario</span>
                                    <span className="db-conn-value">{connectionModal.dbUser}</span>
                                </div>
                                <div className="db-conn-item" style={{ gridColumn: '1 / -1' }}>
                                    <span className="db-conn-label">Contraseña</span>
                                    <span className="db-conn-value">{connectionModal.dbPassword}</span>
                                </div>
                            </div>
                            <div className="db-conn-env-section">
                                <div className="db-conn-env-header">
                                    <span>Variables para tu archivo .env</span>
                                    <button
                                        className={`db-conn-copy-btn ${copied ? 'copied' : ''}`}
                                        onClick={() => {
                                            const envText = connectionModal.engine === 'mysql'
                                                ? `DB_HOST=127.0.0.1\nDB_PORT=${connectionModal.port}\nDB_USERNAME=${connectionModal.dbUser}\nDB_PASSWORD=${connectionModal.dbPassword}\nDB_DATABASE=${connectionModal.dbName}`
                                                : `DATABASE_HOST=127.0.0.1\nDATABASE_PORT=${connectionModal.port}\nDATABASE_USER=${connectionModal.dbUser}\nDATABASE_PASSWORD=${connectionModal.dbPassword}\nDATABASE_NAME=${connectionModal.dbName}`;
                                            navigator.clipboard.writeText(envText);
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2500);
                                        }}
                                    >
                                        {copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
                                    </button>
                                </div>
                                <pre className="db-connection-pre">{
                                    connectionModal.engine === 'mysql'
                                        ? `DB_HOST=127.0.0.1\nDB_PORT=${connectionModal.port}\nDB_USERNAME=${connectionModal.dbUser}\nDB_PASSWORD=${connectionModal.dbPassword}\nDB_DATABASE=${connectionModal.dbName}`
                                        : `DATABASE_HOST=127.0.0.1\nDATABASE_PORT=${connectionModal.port}\nDATABASE_USER=${connectionModal.dbUser}\nDATABASE_PASSWORD=${connectionModal.dbPassword}\nDATABASE_NAME=${connectionModal.dbName}`
                                }</pre>
                            </div>
                            <div className="db-conn-hint">
                                <span className="db-conn-hint-icon">💡</span>
                                <p>El Host es <strong>127.0.0.1</strong> porque Docker expone el puerto al servidor local. Copia estas variables y pégalas en la sección <strong>"Variables .env"</strong> de tu sitio web.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatabaseView;
