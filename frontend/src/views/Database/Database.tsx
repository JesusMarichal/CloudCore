import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import { tokenStorage } from '../../services/tokenStorage';
import { Database as DatabaseIcon, Plus, Play, Square, RotateCcw, Trash2, ExternalLink, Eye, EyeOff, X, HardDrive, Copy, Check, Link, Search, CheckCircle2, Server, KeyRound, Terminal } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { useT } from '../../i18n';
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

// El contenedor publica el puerto en el propio VPS, asi que las apps que
// corren en esa maquina se conectan por loopback y no por la IP publica.
const DB_LOCAL_HOST = '127.0.0.1';

const buildEnvFile = (db: DatabaseInstance) => (
    db.engine === 'mysql'
        ? `DB_HOST=${DB_LOCAL_HOST}
DB_PORT=${db.port}
DB_USERNAME=${db.dbUser}
DB_PASSWORD=${db.dbPassword}
DB_DATABASE=${db.dbName}`
        : `DATABASE_HOST=${DB_LOCAL_HOST}
DATABASE_PORT=${db.port}
DATABASE_USER=${db.dbUser}
DATABASE_PASSWORD=${db.dbPassword}
DATABASE_NAME=${db.dbName}`
);

const SECRET_MASK = '••••••••';

// La contrasena va codificada: un '@' o un ':' sin escapar parte la URI.
// `maskPassword` solo afecta a lo que se pinta; lo que se copia siempre es real.
const buildConnectionUri = (db: DatabaseInstance, maskPassword = false) => {
    const scheme = db.engine === 'mysql' ? 'mysql' : 'postgresql';
    const user = encodeURIComponent(db.dbUser);
    const pass = maskPassword ? SECRET_MASK : encodeURIComponent(db.dbPassword);
    return `${scheme}://${user}:${pass}@${DB_LOCAL_HOST}:${db.port}/${db.dbName}`;
};

const DatabaseView = () => {
    const navigate = useNavigate();
    const t = useT();
    const [servers, setServers] = useState<CreateServerData[]>([]);
    const [databases, setDatabases] = useState<DatabaseInstance[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [deployLogs, setDeployLogs] = useState('');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [showPasswords, setShowPasswords] = useState<{ [key: string]: boolean }>({});
    const [connectionModal, setConnectionModal] = useState<DatabaseInstance | null>(null);
    // Una clave por campo copiable: asi el check de "copiado" se enciende solo
    // en la fila que el usuario acaba de pulsar, no en todas a la vez.
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [connPasswordVisible, setConnPasswordVisible] = useState(false);
    const [closingConnModal, setClosingConnModal] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 5000);
    };

    const closeConnectionModal = () => {
        setClosingConnModal(true);
        setTimeout(() => {
            setConnectionModal(null);
            setClosingConnModal(false);
        }, 280);
    };

    const openConnectionModal = (db: DatabaseInstance) => {
        setConnectionModal(db);
        setCopiedKey(null);
        setConnPasswordVisible(false);
        setClosingConnModal(false);
    };

    const copyValue = async (key: string, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
        } catch {
            return;
        }
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 2000);
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

    useEffect(() => {
        const loadData = async () => {
            if (!tokenStorage.getToken()) {
                navigate('/');
                return;
            }

            try {
                const serverData = await serverService.list();
                setServers(serverData);
                if (serverData.length > 0) {
                    setFormData(prev => ({ ...prev, serverId: serverData[0].id || '' }));
                }

                // Load databases
                const dbData = await serverService.listDatabases();
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

    // Escape cierra el panel lateral, como cualquier drawer del sistema.
    useEffect(() => {
        if (!connectionModal) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeConnectionModal();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [connectionModal]);

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
        setDeployLogs(t('databases.form.starting'));

        try {
            await serverService.deployDatabase(formData.serverId, formData, (chunk: string) => {
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
            if (tokenStorage.getToken()) {
                const dbData = await serverService.listDatabases();
                setDatabases(dbData);
            }
        } catch (error) {
            console.error('Error desplegando base de datos:', error);
            alert(t('databases.msg.deployError'));
        } finally {
            setDeploying(false);
        }
    };

    const handleDbAction = async (db: DatabaseInstance, action: 'start' | 'stop' | 'restart') => {
        setActionLoading(`${db.id}-${action}`);
        try {
            await serverService.manageDatabaseContainer(db.serverId, db.id, action);
            // Reload
            if (tokenStorage.getToken()) {
                const dbData = await serverService.listDatabases();
                setDatabases(dbData);
            }
        } catch (error) {
            console.error(`Error ejecutando ${action}:`, error);
            alert(t('databases.msg.actionError', { action }));
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (db: DatabaseInstance) => {
        if (!window.confirm(t('databases.msg.deleteConfirm', { name: db.name }))) return;
        setActionLoading(`${db.id}-delete`);
        try {
            await serverService.deleteDatabase(db.serverId, db.id);
            setDatabases(databases.filter(d => d.id !== db.id));
        } catch (error) {
            console.error('Error eliminando base de datos:', error);
            alert(t('databases.msg.deleteError'));
        } finally {
            setActionLoading(null);
        }
    };

    const handleScanExisting = async () => {
        if (!tokenStorage.getToken()) return;
        setScanning(true);
        try {
            const result = await serverService.importDatabases();
            if (result.success && result.imported > 0) {
                const dbData = await serverService.listDatabases();
                setDatabases(dbData);
                showToast(t('databases.msg.scanFound', { count: result.imported }), 'success');
            } else if (result.success) {
                showToast(t('databases.scanNone'), 'info');
            } else {
                showToast(result.message || t('databases.scanError'), 'error');
            }
        } catch (error) {
            console.error('Error buscando bases de datos existentes:', error);
            showToast(t('databases.scanError'), 'error');
        } finally {
            setScanning(false);
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
                    <h1><MorphIcon icon={DatabaseIcon} size={24} className="icon-blue" /> {t('databases.title')}</h1>
                    <p className="text-muted">{t('databases.subtitle')}</p>
                </div>
                {servers.length > 0 && (
                    <div className="db-header-actions">
                        <button className="btn-secondary" onClick={handleScanExisting} disabled={scanning}>
                            <MorphIcon icon={Search} size={16} /> {scanning ? t('databases.scanning') : t('databases.scan')}
                        </button>
                        <button className="btn-primary" onClick={() => setShowForm(true)}>
                            <MorphIcon icon={Plus} size={16} /> {t('databases.newDatabase')}
                        </button>
                    </div>
                )}
            </header>

            {!showForm ? (
                loading ? (
                    <div className="db-empty-state"><p>{t('common.loading')}</p></div>
                ) : servers.length === 0 ? (
                    <div className="db-empty-state">
                        <div className="db-empty-icon">🖥️</div>
                        <h3>{t('databases.noServers')}</h3>
                        <p className="text-muted">
                            {t('databases.noServersDesc')}
                        </p>
                        <button className="btn-primary" onClick={() => navigate('/dashboard/servers')}>
                            {t('databases.goToServers')}
                        </button>
                    </div>
                ) : databases.length === 0 ? (
                    <div className="db-empty-state">
                        <div className="db-empty-icon">
                            <MorphIcon icon={DatabaseIcon} size={48} />
                        </div>
                        <h3>{t('databases.empty')}</h3>
                        <p className="text-muted">
                            {t('databases.emptyDesc', { count: servers.length })}
                        </p>
                        <button className="btn-primary" onClick={() => setShowForm(true)}>
                            <MorphIcon icon={Plus} size={16} /> {t('databases.createFirst')}
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
                                                    <MorphIcon icon={HardDrive} size={12} />
                                                    <span>{db.serverName} ({db.serverIp})</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="db-card-actions">
                                            <span className={`db-status-badge ${db.status}`}>
                                                <span className="db-status-dot"></span>
                                                {db.status === 'running' ? t('databases.active') : db.status === 'deploying' ? t('databases.deploying') : t('databases.stopped')}
                                            </span>
                                            {db.status === 'running' ? (
                                                <button
                                                    className="db-btn-action stop"
                                                    onClick={() => handleDbAction(db, 'stop')}
                                                    disabled={actionLoading === `${db.id}-stop`}
                                                    title={t('databases.stop')}
                                                >
                                                    <MorphIcon icon={Square} size={14} />
                                                </button>
                                            ) : db.status === 'stopped' ? (
                                                <button
                                                    className="db-btn-action start"
                                                    onClick={() => handleDbAction(db, 'start')}
                                                    disabled={actionLoading === `${db.id}-start`}
                                                    title={t('databases.start')}
                                                >
                                                    <MorphIcon icon={Play} size={14} />
                                                </button>
                                            ) : null}
                                            <button
                                                className="db-btn-action restart"
                                                onClick={() => handleDbAction(db, 'restart')}
                                                disabled={actionLoading?.startsWith(db.id) || false}
                                                title={t('databases.restart')}
                                            >
                                                <MorphIcon icon={RotateCcw} size={14} />
                                            </button>
                                            <button
                                                className="db-btn-action delete"
                                                onClick={() => handleDelete(db)}
                                                disabled={actionLoading?.startsWith(db.id) || false}
                                                title={t('common.delete')}
                                            >
                                                <MorphIcon icon={Trash2} size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="db-card-body">
                                        <div className="db-info-grid">
                                            <div className="db-info-item">
                                                <span className="db-label">{t('databases.form.port')}</span>
                                                <span className="db-value">{db.port}</span>
                                            </div>
                                            <div className="db-info-item">
                                                <span className="db-label">{t('databases.form.engine')}</span>
                                                <span className="db-value">{db.dbName}</span>
                                            </div>
                                            <div className="db-info-item">
                                                <span className="db-label">{t('databases.form.user')}</span>
                                                <span className="db-value">{db.dbUser}</span>
                                            </div>
                                            <div className="db-info-item db-info-connect">
                                                <button
                                                    className="db-connect-btn"
                                                    onClick={() => openConnectionModal(db)}
                                                >
                                                    <MorphIcon icon={Link} size={14} />
                                                    {t('databases.credentials.connectionData')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Admin panel link for MySQL (phpMyAdmin) */}
                                    {adminUrl && (
                                        <div className="db-card-footer">
                                            <div className="db-card-footer-left">
                                                <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    {t('databases.adminPanel')}
                                                </span>
                                            </div>
                                            <a
                                                href={adminUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="db-admin-link"
                                            >
                                                <MorphIcon icon={ExternalLink} size={14} />
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
                        <h2><MorphIcon icon={DatabaseIcon} size={20} className="icon-blue" /> {t('databases.newDatabase')}</h2>
                        <button className="btn-close" onClick={() => { setShowForm(false); setDeployLogs(''); }}>
                            <MorphIcon icon={X} size={20} />
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
                                <span className="engine-desc">{t('databases.form.mysqlDesc')}</span>
                            </div>
                            <div
                                className={`db-engine-option ${formData.engine === 'postgres' ? 'selected' : ''}`}
                                onClick={() => handleEngineChange('postgres')}
                            >
                                <span className="engine-icon">🐘</span>
                                <span className="engine-name">PostgreSQL</span>
                                <span className="engine-desc">{t('databases.form.postgresDesc')}</span>
                            </div>
                        </div>

                        <div className="db-form-section">
                            <h3>{t('databases.credentials.serverConfig')}</h3>
                            <div className="form-group">
                                <label>{t('databases.form.targetServer')}</label>
                                <select
                                    value={formData.serverId}
                                    onChange={e => setFormData({ ...formData, serverId: e.target.value })}
                                    required
                                >
                                    <option value="" disabled>{t('databases.form.selectServer')}</option>
                                    {servers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.ip})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>{t('databases.form.instanceName')}</label>
                                <input
                                    type="text"
                                    placeholder={t('databases.form.instancePlaceholder')}
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="db-form-section">
                            <h3>{t('databases.credentials.title')}</h3>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>{t('databases.form.dbName')}</label>
                                    <input
                                        type="text"
                                        placeholder={t('databases.form.dbNamePlaceholder')}
                                        value={formData.dbName}
                                        onChange={e => setFormData({ ...formData, dbName: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{t('databases.form.port')}</label>
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
                                    <label>{t('databases.form.user')}</label>
                                    <input
                                        type="text"
                                        placeholder={t('databases.form.userPlaceholder')}
                                        value={formData.dbUser}
                                        onChange={e => setFormData({ ...formData, dbUser: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{t('databases.form.password')}</label>
                                    <div className="db-password-field">
                                        <input
                                            type={showPasswords['form'] ? 'text' : 'password'}
                                            placeholder={t('databases.form.passwordPlaceholder')}
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
                                            <MorphIcon icon={showPasswords['form'] ? EyeOff : Eye} size={16} spring="snappy" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {formData.engine === 'mysql' && (
                                <div className="form-group">
                                    <label>{t('databases.form.phpmyadminPort')}</label>
                                    <input
                                        type="number"
                                        placeholder={t('databases.form.phpmyadminPortPlaceholder')}
                                        value={formData.adminPort}
                                        onChange={e => setFormData({ ...formData, adminPort: e.target.value })}
                                        required
                                    />
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                        {t('databases.phpmyadminHint', { port: formData.adminPort || '8080' })}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="form-actions">
                            <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setDeployLogs(''); }}>
                                {t('common.cancel')}
                            </button>
                            <button type="submit" className="btn-primary" disabled={deploying}>
                                {deploying ? t('databases.form.deploying') : t('databases.form.deploy')}
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
                                    <><div className="db-spinner" style={{ display: 'inline-block', marginRight: '10px' }}></div> {t('databases.msg.deployingEngine', { engine: formData.engine === 'mysql' ? 'MySQL + phpMyAdmin' : 'PostgreSQL' })}</>
                                ) : (
                                    <>✅ {t('databases.msg.deployDone')}</>
                                )}
                            </h3>
                            {!deploying && (
                                <button className="btn-close" onClick={() => { setShowForm(false); setDeployLogs(''); }}><MorphIcon icon={X} size={20} /></button>
                            )}
                        </div>
                        <div className="db-deploy-modal-body">
                            <div className="db-deploy-terminal">
                                <div className="db-deploy-terminal-header">
                                    <span className="dot" style={{ background: '#ff5f56' }}></span>
                                    <span className="dot" style={{ background: '#ffbd2e' }}></span>
                                    <span className="dot" style={{ background: '#27c93f' }}></span>
                                    <span className="title">{t('databases.terminalTitle')}</span>
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
                                    {t('databases.msg.clear')}
                                </button>
                                <button type="button" className="btn-primary" onClick={() => { setShowForm(false); setDeployLogs(''); }}>
                                    {t('databases.msg.finish')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Panel lateral de datos de conexion */}
            {connectionModal && (() => {
                const db = connectionModal;
                const envFile = buildEnvFile(db);
                const envRows = envFile.split('\n').map(line => {
                    const eq = line.indexOf('=');
                    return { key: line.slice(0, eq), value: line.slice(eq + 1) };
                });
                const uri = buildConnectionUri(db);
                const uriShown = buildConnectionUri(db, !connPasswordVisible);
                const adminUrl = getAdminUrl(db);
                const engineLabel = db.engine === 'mysql' ? 'MySQL' : 'PostgreSQL';
                const fields = [
                    { key: 'host', label: t('databases.credentials.host'), value: DB_LOCAL_HOST },
                    { key: 'port', label: t('databases.form.port'), value: db.port },
                    { key: 'dbname', label: t('databases.credentials.database'), value: db.dbName },
                    { key: 'user', label: t('databases.form.user'), value: db.dbUser },
                    { key: 'password', label: t('databases.form.password'), value: db.dbPassword, secret: true },
                ];

                return (
                    <div
                        className={`db-conn-scrim ${closingConnModal ? 'closing' : ''}`}
                        onClick={closeConnectionModal}
                    >
                        <aside
                            className={`db-conn-drawer ${closingConnModal ? 'closing' : ''}`}
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            aria-label={t('databases.credentials.connectionData')}
                        >
                            <header className="db-conn-drawer-header">
                                <div className="db-conn-identity">
                                    <div className={`db-conn-avatar ${db.engine}`}>
                                        {db.engine === 'mysql' ? '🐬' : '🐘'}
                                    </div>
                                    <div className="db-conn-identity-text">
                                        <h3>{db.name}</h3>
                                        <div className="db-conn-identity-meta">
                                            <span className={`db-engine-tag ${db.engine}`}>{engineLabel}</span>
                                            <span className={`db-conn-state ${db.status}`}>
                                                <span className="db-status-dot"></span>
                                                {db.status === 'running'
                                                    ? t('databases.active')
                                                    : db.status === 'deploying'
                                                        ? t('databases.deploying')
                                                        : t('databases.stopped')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    className="db-conn-close"
                                    onClick={closeConnectionModal}
                                    aria-label={t('common.close')}
                                >
                                    <MorphIcon icon={X} size={18} />
                                </button>
                            </header>

                            <div className="db-conn-host-strip">
                                <MorphIcon icon={Server} size={14} />
                                <span className="db-conn-host-label">{t('databases.credentials.hostedOn')}</span>
                                <strong>{db.serverName}</strong>
                                <code>{db.serverIp}</code>
                            </div>

                            <div className="db-conn-drawer-body">
                                <section className="db-conn-section" style={{ '--stagger': 1 } as React.CSSProperties}>
                                    <h4 className="db-conn-section-title">
                                        <MorphIcon icon={KeyRound} size={13} />
                                        {t('databases.credentials.sectionParams')}
                                    </h4>
                                    <div className="db-conn-fields">
                                        {fields.map(field => {
                                            const hidden = field.secret && !connPasswordVisible;
                                            return (
                                                <div className="db-conn-field" key={field.key}>
                                                    <span className="db-conn-field-label">{field.label}</span>
                                                    <span className={`db-conn-field-value ${hidden ? 'masked' : ''}`}>
                                                        {hidden ? '•'.repeat(Math.min(field.value.length || 8, 18)) : field.value}
                                                    </span>
                                                    <div className="db-conn-field-actions">
                                                        {field.secret && (
                                                            <button
                                                                className="db-conn-icon-btn"
                                                                onClick={() => setConnPasswordVisible(v => !v)}
                                                                title={connPasswordVisible
                                                                    ? t('databases.credentials.hidePassword')
                                                                    : t('databases.credentials.showPassword')}
                                                                aria-label={connPasswordVisible
                                                                    ? t('databases.credentials.hidePassword')
                                                                    : t('databases.credentials.showPassword')}
                                                            >
                                                                <MorphIcon icon={connPasswordVisible ? EyeOff : Eye} size={14} spring="snappy" />
                                                            </button>
                                                        )}
                                                        <button
                                                            className={`db-conn-icon-btn ${copiedKey === field.key ? 'ok' : ''}`}
                                                            onClick={() => copyValue(field.key, field.value)}
                                                            title={t('databases.credentials.copyValue')}
                                                            aria-label={t('databases.credentials.copyValue')}
                                                        >
                                                            <MorphIcon icon={copiedKey === field.key ? Check : Copy} size={14} spring="snappy" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>

                                <section className="db-conn-section" style={{ '--stagger': 2 } as React.CSSProperties}>
                                    <div className="db-conn-section-head">
                                        <h4 className="db-conn-section-title">
                                            <MorphIcon icon={Link} size={13} />
                                            {t('databases.credentials.connectionString')}
                                        </h4>
                                        <button
                                            className={`db-conn-copy-btn ${copiedKey === 'uri' ? 'copied' : ''}`}
                                            onClick={() => copyValue('uri', uri)}
                                        >
                                            {copiedKey === 'uri'
                                                ? <><MorphIcon icon={Check} size={13} /> {t('databases.credentials.copied')}</>
                                                : <><MorphIcon icon={Copy} size={13} /> {t('databases.credentials.copy')}</>}
                                        </button>
                                    </div>
                                    <code className="db-conn-uri">
                                        <span className="db-conn-uri-scheme">{uriShown.slice(0, uriShown.indexOf('://') + 3)}</span>
                                        {uriShown.slice(uriShown.indexOf('://') + 3)}
                                    </code>
                                </section>

                                <section className="db-conn-section" style={{ '--stagger': 3 } as React.CSSProperties}>
                                    <div className="db-conn-section-head">
                                        <h4 className="db-conn-section-title">
                                            <MorphIcon icon={Terminal} size={13} />
                                            {t('databases.credentials.envHint')}
                                        </h4>
                                        <button
                                            className={`db-conn-copy-btn ${copiedKey === 'env' ? 'copied' : ''}`}
                                            onClick={() => copyValue('env', envFile)}
                                        >
                                            {copiedKey === 'env'
                                                ? <><MorphIcon icon={Check} size={13} /> {t('databases.credentials.copied')}</>
                                                : <><MorphIcon icon={Copy} size={13} /> {t('databases.credentials.copy')}</>}
                                        </button>
                                    </div>
                                    <div className="db-conn-env-list">
                                        {envRows.map(row => {
                                            const secret = row.key.endsWith('PASSWORD') && !connPasswordVisible;
                                            return (
                                                <div className="db-conn-env-row" key={row.key}>
                                                    <span className="db-conn-env-key">{row.key}</span>
                                                    <span className="db-conn-env-eq">=</span>
                                                    <span className={`db-conn-env-val ${secret ? 'masked' : ''}`}>
                                                        {secret ? SECRET_MASK : row.value}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>

                                <div className="db-conn-hint" style={{ '--stagger': 4 } as React.CSSProperties}>
                                    <span className="db-conn-hint-icon">💡</span>
                                    {/* El HTML sale de nuestros archivos de idioma (constantes en
                                        el bundle), nunca de datos del usuario ni del servidor. */}
                                    <p dangerouslySetInnerHTML={{ __html: t('databases.credentials.hostHintFull') }} />
                                </div>
                            </div>

                            <footer className="db-conn-drawer-footer">
                                {adminUrl ? (
                                    <a
                                        href={adminUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="db-admin-link"
                                    >
                                        <MorphIcon icon={ExternalLink} size={14} />
                                        phpMyAdmin
                                    </a>
                                ) : <span />}
                                <button className="btn-secondary" onClick={closeConnectionModal}>
                                    {t('common.close')}
                                </button>
                            </footer>
                        </aside>
                    </div>
                );
            })()}

            {toast && (
                <div className={`modern-toast toast-${toast.type}`}>
                    <div className="toast-icon">
                        {toast.type === 'success' && <div className="icon-success"><MorphIcon icon={CheckCircle2} size={16} /></div>}
                        {toast.type === 'error' && <div className="icon-error"><MorphIcon icon={X} size={16} /></div>}
                        {toast.type === 'info' && <div className="icon-info">i</div>}
                    </div>
                    <div className="toast-message">{toast.message}</div>
                    <button className="toast-close" onClick={() => setToast(null)}><MorphIcon icon={X} size={14} /></button>
                </div>
            )}
        </div>
    );
};

export default DatabaseView;
