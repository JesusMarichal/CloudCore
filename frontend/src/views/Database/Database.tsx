import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import { tokenStorage } from '../../services/tokenStorage';
import { Database as DatabaseIcon, Plus, Play, Square, RotateCcw, Trash2, ExternalLink, Eye, EyeOff, X, HardDrive, Copy, Check, Link, Search, CheckCircle2 } from 'lucide';
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
    const [copied, setCopied] = useState(false);
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
                                                    onClick={() => { setConnectionModal(db); setCopied(false); setClosingConnModal(false); }}
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
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{t('databases.credentials.connectionData')}</h3>
                                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{connectionModal.name} • {connectionModal.engine === 'mysql' ? 'MySQL' : 'PostgreSQL'}</p>
                                </div>
                            </div>
                            <button className="btn-close" onClick={closeConnectionModal}><MorphIcon icon={X} size={18} /></button>
                        </div>
                        <div className="db-conn-modal-body">
                            <div className="db-conn-grid">
                                <div className="db-conn-item">
                                    <span className="db-conn-label">{t('databases.credentials.host')}</span>
                                    <span className="db-conn-value">127.0.0.1</span>
                                </div>
                                <div className="db-conn-item">
                                    <span className="db-conn-label">{t('databases.form.port')}</span>
                                    <span className="db-conn-value">{connectionModal.port}</span>
                                </div>
                                <div className="db-conn-item">
                                    <span className="db-conn-label">{t('databases.form.engine')}</span>
                                    <span className="db-conn-value">{connectionModal.dbName}</span>
                                </div>
                                <div className="db-conn-item">
                                    <span className="db-conn-label">{t('databases.form.user')}</span>
                                    <span className="db-conn-value">{connectionModal.dbUser}</span>
                                </div>
                                <div className="db-conn-item" style={{ gridColumn: '1 / -1' }}>
                                    <span className="db-conn-label">{t('databases.form.password')}</span>
                                    <span className="db-conn-value">{connectionModal.dbPassword}</span>
                                </div>
                            </div>
                            <div className="db-conn-env-section">
                                <div className="db-conn-env-header">
                                    <span>{t('databases.credentials.envHint')}</span>
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
                                        {copied ? <><MorphIcon icon={Check} size={13} /> {t('databases.credentials.copied')}</> : <><MorphIcon icon={Copy} size={13} /> {t('databases.credentials.copy')}</>}
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
                                {/* El HTML sale de nuestros archivos de idioma (constantes en
                                    el bundle), nunca de datos del usuario ni del servidor. */}
                                <p dangerouslySetInnerHTML={{ __html: t('databases.credentials.hostHintFull') }} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
