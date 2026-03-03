import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import { Globe, Plus, X, ExternalLink, HardDrive, Settings, GitCommit, RefreshCw, CloudUpload, Terminal, RotateCcw } from 'lucide-react';
import './Websites.css';

interface WebsiteFormData {
    serverId: string;
    name: string;
    repo: string;
    installCommand: string;
    buildCommand: string;
    startCommand: string;
    entryPoint: string;
    port: string;
    domain: string;
    envVars: string;
    userId: string;
}



const Websites = () => {
    const navigate = useNavigate();
    const [servers, setServers] = useState<CreateServerData[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [githubRepos, setGithubRepos] = useState<any[]>([]);
    const [hasGithub, setHasGithub] = useState(false);
    const [websites, setWebsites] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewingLogs, setViewingLogs] = useState<string | null>(null);
    const [logsSiteName, setLogsSiteName] = useState('');
    const [logsContent, setLogsContent] = useState<any>({ out: '', error: '', nginx: '', diag: '' });
    const [activeLogTab, setActiveLogTab] = useState<'out' | 'error' | 'nginx' | 'diag'>('out');
    const [closingLogsModal, setClosingLogsModal] = useState(false);
    const [editingSite, setEditingSite] = useState<any>(null);
    const [showEnvModal, setShowEnvModal] = useState(false);
    const [envList, setEnvList] = useState<{ key: string, value: string }[]>([]);
    const [deployLogs, setDeployLogs] = useState('');
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [deployLogs]);

    // New states for commits and deploying updates
    const [commits, setCommits] = useState<{ [key: string]: { hash: string, message: string, author: string, time: string, isOutdated?: boolean, latestHash?: string } | null }>({});
    const [deployingSites, setDeployingSites] = useState<{ [key: string]: boolean }>({});

    // Toast and Confirm System
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const [formData, setFormData] = useState<WebsiteFormData>({
        serverId: '',
        name: '',
        repo: '',
        installCommand: 'npm install',
        buildCommand: '',
        startCommand: 'npm start',
        entryPoint: 'index.js',
        port: '3000',
        domain: '',
        envVars: '',
        userId: ''
    });

    useEffect(() => {
        const loadServers = async () => {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const data = await serverService.list(user.id);
                setServers(data);
                if (data.length > 0) {
                    setFormData(prev => ({ ...prev, serverId: data[0].id || '', userId: user.id }));
                }

                try {
                    const reposRes = await fetch(`http://localhost:3000/github/repos/${user.id}`);
                    const reposData = await reposRes.json();
                    if (reposData.success && reposData.repos) {
                        setGithubRepos(reposData.repos);
                        setHasGithub(true);
                    } else if (reposData.message?.includes('No hay token')) {
                        setHasGithub(false);
                    }
                } catch (error) {
                    console.error('Error cargando repos:', error);
                }

                try {
                    const sites = await serverService.listWebsites(user.id);
                    setWebsites(sites);

                    // Cargar commits de cada sitio en background
                    sites.forEach((site: any) => {
                        serverService.getWebsiteCommit(site.server_id, site.id)
                            .then(res => {
                                if (res.success && res.commit) {
                                    setCommits(prev => ({ ...prev, [site.id]: res.commit }));
                                }
                            })
                            .catch(err => console.error(err));
                    });

                } catch (error) {
                    console.error('Error cargando sitios:', error);
                } finally {
                    setLoading(false);
                }
            }
        };
        loadServers();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setDeploying(true);
        try {
            const userStr = localStorage.getItem('user');
            const currentUser = userStr ? JSON.parse(userStr) : null;
            const currentUserId = currentUser?.id || '';

            if (editingSite) {
                await serverService.updateWebsite(formData.serverId, editingSite.id, formData);
                showToast('¡Configuración actualizada con éxito!', 'success');
                setShowForm(false);
            } else {
                setDeployLogs('Iniciando despliegue de sitio web...\n');
                await serverService.deployWebsite(formData.serverId, { ...formData, userId: currentUserId }, (chunk) => {
                    setDeployLogs(prev => prev + chunk);
                });
                // showToast('¡Sitio web desplegado con éxito!', 'success'); // Omitir para mostrar la terminal completada
            }

            setFormData({
                serverId: formData.serverId, // Mantener servidor seleccionado
                name: '',
                repo: '',
                installCommand: 'npm install',
                buildCommand: '',
                startCommand: 'npm start',
                entryPoint: 'index.js',
                port: '3000',
                domain: '',
                envVars: '',
                userId: currentUserId
            });
            setEditingSite(null);
        } catch (error) {
            console.error('Error desplegando el sitio:', error);
            showToast('Hubo un error al procesar el sitio.', 'error');
        } finally {
            setDeploying(false);
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const sites = await serverService.listWebsites(user.id);
                setWebsites(sites);
            }
        }
    };

    const handleEdit = (site: any) => {
        setEditingSite(site);
        setFormData({
            serverId: site.server_id,
            name: site.name,
            repo: site.repo_url,
            installCommand: site.install_command || 'npm install',
            buildCommand: site.build_command || '',
            startCommand: site.start_command || 'npm start',
            entryPoint: site.entry_point || 'index.js',
            port: site.port || '3000',
            domain: site.domain || '',
            envVars: site.env_vars || '',
            userId: site.user_id
        });
        setShowForm(true);
    };

    const handleOpenEnvModal = async (site: any) => {
        setEditingSite(site);
        setShowEnvModal(true);
        // Intentar usar lo que hay en DB primero
        let envString = site.env_vars || '';

        // Si está vacío, intentar traerlo del servidor real por SSH
        if (!envString) {
            try {
                const res = await serverService.getWebsiteEnv(site.server_id, site.id);
                if (res.success && res.env) {
                    envString = res.env;
                }
            } catch (error) {
                console.error("Error trayendo env del servidor:", error);
            }
        }

        const envs = envString.split('\n')
            .filter((line: string) => line.includes('='))
            .map((line: string) => {
                const [key, ...valueParts] = line.split('=');
                return { key: key.trim(), value: valueParts.join('=').trim() };
            });

        setEnvList(envs.length > 0 ? envs : [{ key: '', value: '' }]);
    };

    const handleSaveEnv = async () => {
        if (!editingSite) return;
        setDeploying(true);
        try {
            const envString = envList
                .filter(e => e.key.trim() !== '')
                .map(e => `${e.key.trim()}=${e.value.trim()}`)
                .join('\n');

            const updatedData = {
                serverId: editingSite.server_id,
                name: editingSite.name,
                repo: editingSite.repo_url,
                installCommand: editingSite.install_command,
                buildCommand: editingSite.build_command,
                startCommand: editingSite.start_command,
                entryPoint: editingSite.entry_point,
                port: editingSite.port,
                domain: editingSite.domain,
                envVars: envString,
                userId: editingSite.user_id
            };

            await serverService.updateWebsite(editingSite.server_id, editingSite.id, updatedData);
            showToast('¡Variables de entorno actualizadas y sitio reiniciado!', 'success');
            setShowEnvModal(false);

            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const sites = await serverService.listWebsites(user.id);
                setWebsites(sites);
            }
        } catch (error) {
            console.error('Error saving env:', error);
            showToast('Error al guardar variables', 'error');
        } finally {
            setDeploying(false);
        }
    };

    const handleDelete = async (serverId: string, websiteId: string) => {
        setConfirmDialog({
            message: '¿Estás seguro de que deseas eliminar este sitio web?',
            onConfirm: async () => {
                setConfirmDialog(null);
                try {
                    await serverService.deleteWebsite(serverId, websiteId);
                    setWebsites(websites.filter(w => w.id !== websiteId));
                    showToast('Sitio web eliminado correctamente.', 'success');
                } catch (error) {
                    console.error('Error eliminando sitio:', error);
                    showToast('No se pudo eliminar el sitio web.', 'error');
                }
            }
        });
    };

    const handleViewLogs = async (serverId: string, websiteId: string, siteName: string) => {
        if (viewingLogs !== websiteId) {
            setActiveLogTab('out');
        }
        setViewingLogs(websiteId);
        setLogsSiteName(siteName);
        setLogsContent((prev: any) => ({ ...prev, out: 'Cargando logs...', error: 'Cargando logs...', nginx: 'Cargando logs...' }));
        setClosingLogsModal(false);
        try {
            const res = await serverService.getWebsiteLogs(serverId, websiteId);
            setLogsContent((prev: any) => ({
                ...prev,
                out: res.logs?.out || 'Logs de salida vacíos.',
                error: res.logs?.error || 'Logs de errores vacíos.',
                nginx: res.logs?.nginx || 'Logs de nginx vacíos.'
            }));
        } catch (error) {
            setLogsContent((prev: any) => ({ ...prev, out: 'Error al obtener logs.', error: 'Error al obtener logs.', nginx: 'Error al obtener logs.' }));
        }
    };

    const closeLogsModal = () => {
        setClosingLogsModal(true);
        setTimeout(() => {
            setViewingLogs(null);
            setClosingLogsModal(false);
        }, 250);
    };

    const handleRunDiagnostic = async (serverId: string, siteName: string) => {
        setLogsContent((prev: any) => ({ ...prev, diag: 'Ejecutando diagnóstico del servidor...\n\n' }));
        const safeName = siteName.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
        const diagCmd = `echo "=== DOCKER CONTAINERS ==="
echo "---"
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Docker no instalado o sin contenedores."
echo ""
echo "=== PM2 STATUS ==="
echo "---"
pm2 list 2>/dev/null || echo "PM2 no instalado."
echo ""
echo "=== ARCHIVO .ENV ==="
echo "---"
cat /var/www/${safeName}/.env 2>/dev/null || echo "No existe archivo .env en /var/www/${safeName}/"
echo ""
echo "=== PUERTO APP ==="
echo "---"
ss -tlnp | grep ':3000\|:3306' || echo "NADA escucha en los puertos 3000/3306"
echo ""
echo "=== DOCKER NETWORK (MySQL IP) ==="
echo "---"
sudo docker network inspect bridge --format '{{range .Containers}}{{.Name}}: {{.IPv4Address}}{{println}}{{end}}' 2>/dev/null || echo "Sin red Docker bridge."
echo ""
echo "=== ARCHIVOS DE LOG PM2 ==="
echo "---"
ls -la ~/.pm2/logs/ 2>/dev/null | grep ${safeName} || echo "No se encontraron archivos de log para ${safeName}"
echo ""
echo "=== ARCHIVOS EN /var/www/${safeName}/ ==="
echo "---"
ls -la /var/www/${safeName}/ 2>/dev/null | head -20 || echo "Carpeta no existe."
echo ""
echo "=== DIAGNÓSTICO COMPLETADO ==="`;
        try {
            const res = await serverService.executeCommand(serverId, diagCmd);
            setLogsContent((prev: any) => ({ ...prev, diag: res.output || res.message || 'Sin resultado.' }));
        } catch (error) {
            setLogsContent((prev: any) => ({ ...prev, diag: 'Error ejecutando diagnóstico.' }));
        }
    };

    const handleDeployLatest = async (serverId: string, websiteId: string) => {
        setConfirmDialog({
            message: '¿Obtener el último commit de tu repositorio y hacer un re-despliegue ahora mismo?',
            onConfirm: async () => {
                setConfirmDialog(null);
                setDeployingSites(prev => ({ ...prev, [websiteId]: true }));
                try {
                    const res = await serverService.deployLatestCommit(serverId, websiteId);
                    if (res.success) {
                        showToast('¡Sitio reconstruido y actualizado exitosamente al último commit!', 'success');
                        const commitRes = await serverService.getWebsiteCommit(serverId, websiteId);
                        if (commitRes.success && commitRes.commit) {
                            setCommits(prev => ({ ...prev, [websiteId]: commitRes.commit }));
                        }
                    } else {
                        showToast('Error al desplegar commit: ' + (res.message || 'Error desconocido'), 'error');
                    }
                } catch (error) {
                    console.error('Error deploy latest:', error);
                    showToast('Error al ejecutar el despliegue del último commit.', 'error');
                } finally {
                    setDeployingSites(prev => ({ ...prev, [websiteId]: false }));
                }
            }
        });
    };

    return (
        <div className="websites-container">
            <header className="page-header">
                <div>
                    <h1><Globe size={24} className="icon-blue" /> Gestión de Sitios Web</h1>
                    <p className="text-muted">Despliega tus proyectos Node.js, React o estáticos fácilmente.</p>
                </div>
                {servers.length > 0 && (
                    <button className="btn-primary" onClick={() => setShowForm(true)}>
                        <Plus size={16} /> Deployar Proyecto
                    </button>
                )}
            </header>

            {!showForm ? (
                loading ? (
                    <div className="empty-state"><p>Cargando...</p></div>
                ) : servers.length === 0 ? (
                    <div className="empty-state-list">
                        <div className="empty-icon">🖥️</div>
                        <h3>No tienes servidores conectados</h3>
                        <p className="text-muted">Para desplegar un sitio web, primero debes agregar un servidor en la sección de Instancias.</p>
                        <button className="btn-primary" onClick={() => navigate('/dashboard/servers')}>
                            Ir a Servidores
                        </button>
                    </div>
                ) : websites.length === 0 ? (
                    <div className="empty-state-list">
                        <div className="empty-icon">
                            <Globe size={48} />
                        </div>
                        <h3>No hay sitios web desplegados</h3>
                        <p className="text-muted">
                            Tienes {servers.length} servidor(es) listo(s). ¡Es hora de poner tu primera aplicación en línea!
                        </p>
                        <button className="btn-primary" onClick={() => setShowForm(true)}>
                            <Plus size={16} /> Desplegar mi primer Proyecto
                        </button>
                    </div>
                ) : (
                    <div className="website-list">
                        {websites.map(site => (
                            <div key={site.id}>
                                <div className={`website-card ${deployingSites[site.id] ? 'deploying' : (commits[site.id]?.isOutdated ? 'outdated' : '')}`}>
                                    <div className="website-info">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <h3>{site.name}</h3>
                                            <span className={`status-badge ${site.status || 'online'}`}>
                                                {site.status === 'error' ? 'Error' : 'Activo'}
                                            </span>
                                        </div>
                                        <div className="website-meta">
                                            <div className="meta-item"><HardDrive size={14} /> {site.serverIp}</div>
                                            <div className="meta-item"><ExternalLink size={14} /> Port {site.port}</div>
                                            {site.domain ? (
                                                <div className="meta-item"><Globe size={14} /> {site.domain}</div>
                                            ) : (
                                                <div className="meta-item" style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => handleEdit(site)} title="Haga clic para agregar un dominio">
                                                    <Globe size={14} /> <span style={{ fontStyle: 'italic', textDecoration: 'underline' }}>Sin dominio registrado</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="card-links">
                                            <a href={site.domain ? `http://${site.domain}` : `http://${site.serverIp}`} target="_blank" rel="noopener noreferrer" className="site-link-premium">
                                                <ExternalLink size={14} /> Abrir Sitio
                                            </a>
                                        </div>
                                    </div>
                                    <div className="website-commit-info" style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.02)', padding: '12px 16px', border: '1px solid var(--gh-border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <GitCommit size={14} color="var(--primary)" /> Último Commit
                                            </span>
                                            <button
                                                className="btn-ghost"
                                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                                onClick={() => handleDeployLatest(site.server_id, site.id)}
                                                disabled={deployingSites[site.id]}
                                            >
                                                {deployingSites[site.id] ? (
                                                    <><RefreshCw size={12} className="spinning" /> Desplegando...</>
                                                ) : (
                                                    <><CloudUpload size={12} /> Desplegar Último</>
                                                )}
                                            </button>
                                        </div>
                                        {commits[site.id] ? (
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                <div style={{ fontWeight: 500, color: 'var(--text-main)', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {commits[site.id]!.message}
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span className="mono" style={{ color: 'var(--gh-text-link)', display: 'flex', alignItems: 'center' }}>
                                                        {commits[site.id]!.hash}
                                                        {commits[site.id]!.isOutdated && (
                                                            <span
                                                                style={{ color: '#ff7b72', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', background: 'rgba(255,123,114,0.1)', padding: '2px 6px', borderRadius: '10px', marginLeft: '8px' }}
                                                                title={`Commit remoto disponible: ${commits[site.id]!.latestHash}`}
                                                            >
                                                                <RefreshCw size={10} className="spinning" /> Desactualizado
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span>{commits[site.id]!.time}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                                                Detectando commit... (Asegúrate de que sea un repositorio Git)
                                            </div>
                                        )}
                                    </div>
                                    <div className="website-actions" style={{ flexDirection: 'column', borderTop: 'none', paddingTop: 0, paddingLeft: '15px', borderLeft: '1px solid rgba(255, 255, 255, 0.05)', gap: '10px' }}>
                                        <button className="btn-action" onClick={() => handleViewLogs(site.server_id, site.id, site.name)} title="Ver Logs"><Terminal size={18} /></button>
                                        <button className="btn-action" onClick={() => handleOpenEnvModal(site)} title="Variables .env"><Globe size={18} /></button>
                                        <button className="btn-action" onClick={() => handleEdit(site)} title="Configuración"><Settings size={18} /></button>
                                        <button className="btn-action-danger" onClick={() => handleDelete(site.server_id, site.id)} title="Eliminar"><X size={18} /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                <div className="form-container">
                    <div className="form-card">
                        <div className="form-header">
                            <h2>{editingSite ? `Editando: ${editingSite.name}` : 'Nuevo Despliegue'}</h2>
                            <button className="btn-close" onClick={() => { setShowForm(false); setEditingSite(null); }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-section">
                                <div className="form-group">
                                    <label>Servidor</label>
                                    <select value={formData.serverId} onChange={(e) => setFormData({ ...formData, serverId: e.target.value })} required disabled={!!editingSite}>
                                        <option value="" disabled>Seleccionar...</option>
                                        {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.ip})</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Nombre App</label>
                                    <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Repositorio Git</label>
                                    {hasGithub ? (
                                        <select value={formData.repo} onChange={(e) => setFormData({ ...formData, repo: e.target.value })} required>
                                            <option value="" disabled>Seleccionar repo...</option>
                                            {githubRepos.map(r => <option key={r.id} value={r.clone_url}>{r.full_name}</option>)}
                                            <option value="custom">URL manual</option>
                                        </select>
                                    ) : null}
                                    {(!hasGithub || formData.repo === 'custom') && (
                                        <input type="url" placeholder="https://..." value={formData.repo === 'custom' ? '' : formData.repo} onChange={(e) => setFormData({ ...formData, repo: e.target.value })} required />
                                    )}
                                </div>
                            </div>
                            <div className="form-section">
                                <h3>Configuración</h3>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Comando Instalación</label>
                                        <input type="text" placeholder="npm install" value={formData.installCommand} onChange={(e) => setFormData({ ...formData, installCommand: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Comando Build</label>
                                        <input type="text" placeholder="npm run build (opcional)" value={formData.buildCommand} onChange={(e) => setFormData({ ...formData, buildCommand: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Archivo de Entrada</label>
                                        <input type="text" placeholder="index.js / dist/main.js" value={formData.entryPoint} onChange={(e) => setFormData({ ...formData, entryPoint: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Comando Inicio (PM2)</label>
                                        <input type="text" placeholder="npm start" value={formData.startCommand} onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })} />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Puerto</label>
                                        <input type="number" placeholder="3000" value={formData.port} onChange={(e) => setFormData({ ...formData, port: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Dominio (Opcional)</label>
                                        <input type="text" placeholder="ejemplo.com" value={formData.domain} onChange={(e) => setFormData({ ...formData, domain: e.target.value })} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Variables de Entorno (.env)</label>
                                    <textarea
                                        rows={5}
                                        placeholder="KEY=VALUE&#10;DATABASE_URL=postgres://..."
                                        className="mono"
                                        value={formData.envVars}
                                        onChange={(e) => setFormData({ ...formData, envVars: e.target.value })}
                                    />
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Pega aquí el contenido de tu archivo .env para el despliegue inicial.
                                    </span>
                                </div>
                            </div>
                            <div className="form-actions">
                                <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditingSite(null); setDeployLogs(''); }}>Cancelar</button>
                                <button type="submit" className="btn-primary" disabled={deploying}>
                                    {deploying ? 'Procesando...' : (editingSite ? 'Guardar' : 'Desplegar')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showEnvModal && (
                <div className="modal-overlay">
                    <div className="env-modal">
                        <div className="env-modal-header">
                            <h3>🔍 Variables .env - {editingSite?.name}</h3>
                            <button className="btn-close" onClick={() => setShowEnvModal(false)}><X size={20} /></button>
                        </div>
                        <div className="env-modal-body">
                            <div className="env-editor">
                                {envList.map((env, index) => (
                                    <div key={index} className="env-row">
                                        <input type="text" placeholder="KEY" value={env.key} onChange={(e) => {
                                            const newList = [...envList];
                                            newList[index].key = e.target.value;
                                            setEnvList(newList);
                                        }} />
                                        <input type="text" placeholder="VALUE" value={env.value} onChange={(e) => {
                                            const newList = [...envList];
                                            newList[index].value = e.target.value;
                                            setEnvList(newList);
                                        }} />
                                        <button type="button" className="btn-delete-env" onClick={() => setEnvList(envList.filter((_, i) => i !== index))}><X size={16} /></button>
                                    </div>
                                ))}
                                <button type="button" className="btn-add-env" onClick={() => setEnvList([...envList, { key: '', value: '' }])}>
                                    <Plus size={14} /> Nueva Variable
                                </button>
                            </div>
                        </div>
                        <div className="env-modal-footer">
                            <button className="btn-secondary" onClick={() => setShowEnvModal(false)}>Cancelar</button>
                            <button className="btn-primary" onClick={handleSaveEnv} disabled={deploying}>
                                {deploying ? 'Guardando...' : 'Aplicar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal for Deployment Progress */}
            {(!editingSite && (deploying || deployLogs.trim() !== '')) && (
                <div className="site-deploy-modal-overlay">
                    <div className="site-deploy-modal">
                        <div className="site-deploy-modal-header">
                            <h3>
                                {deploying ? (
                                    <><div className="db-spinner" style={{ display: 'inline-block', marginRight: '10px' }}></div> Desplegando {formData.name || 'Proyecto'}...</>
                                ) : (
                                    <>✅ ¡Despliegue Completado!</>
                                )}
                            </h3>
                            {!deploying && (
                                <button className="btn-close" onClick={() => { setShowForm(false); setDeployLogs(''); }}><X size={20} /></button>
                            )}
                        </div>
                        <div className="site-deploy-modal-body">
                            <div className="site-deploy-terminal">
                                <div className="site-deploy-terminal-header">
                                    <span className="dot" style={{ background: '#ff5f56' }}></span>
                                    <span className="dot" style={{ background: '#ffbd2e' }}></span>
                                    <span className="dot" style={{ background: '#27c93f' }}></span>
                                    <span className="title">Terminal - Instalación</span>
                                </div>
                                <div className="site-deploy-logs console-scroll">
                                    {deployLogs}
                                    <div ref={logsEndRef} />
                                </div>
                            </div>
                        </div>
                        {!deploying && (
                            <div className="site-deploy-modal-footer">
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

            {/* Custom Toast Notification */}
            {toast && (
                <div className={`modern-toast toast-${toast.type}`}>
                    <div className="toast-icon">
                        {toast.type === 'success' && <div className="icon-success"><RefreshCw size={16} />✓</div>}
                        {toast.type === 'error' && <div className="icon-error"><X size={16} /></div>}
                        {toast.type === 'info' && <div className="icon-info">i</div>}
                    </div>
                    <div className="toast-message">{toast.message}</div>
                    <button className="toast-close" onClick={() => setToast(null)}><X size={14} /></button>
                </div>
            )}

            {/* Custom Confirm Modal */}
            {confirmDialog && (
                <div className="site-deploy-modal-overlay">
                    <div className="confirm-modal-box">
                        <h3>¿Estás seguro?</h3>
                        <p>{confirmDialog.message}</p>
                        <div className="confirm-modal-actions">
                            <button className="btn-ghost" onClick={() => setConfirmDialog(null)}>Cancelar</button>
                            <button className="btn-primary" onClick={confirmDialog.onConfirm}>Confirmar Acción</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Logs Modal */}
            {viewingLogs && (() => {
                const site = websites.find((s: any) => s.id === viewingLogs);
                return (
                    <div className={`logs-modal-overlay ${closingLogsModal ? 'closing' : ''}`} onClick={closeLogsModal}>
                        <div className={`logs-modal ${closingLogsModal ? 'closing' : ''}`} onClick={(e) => e.stopPropagation()}>
                            <div className="logs-modal-header">
                                <div className="logs-modal-title">
                                    <div className="logs-terminal-dots">
                                        <span className="dot-red"></span>
                                        <span className="dot-yellow"></span>
                                        <span className="dot-green"></span>
                                    </div>
                                    <Terminal size={16} />
                                    <span className="logs-modal-name">{logsSiteName}</span>
                                    <span className="logs-modal-sep">—</span>
                                    <span className="logs-modal-subtitle">Logs del Servidor</span>
                                </div>
                                <div className="logs-modal-actions">
                                    {site && (
                                        <button className="logs-refresh-btn" onClick={() => handleViewLogs(site.server_id, site.id, site.name)} title="Recargar logs">
                                            <RotateCcw size={14} />
                                        </button>
                                    )}
                                    <button className="logs-close-btn" onClick={closeLogsModal}><X size={16} /></button>
                                </div>
                            </div>
                            <div className="logs-modal-tabs">
                                <button
                                    className={`logs-tab ${activeLogTab === 'out' ? 'active' : ''}`}
                                    onClick={() => setActiveLogTab('out')}
                                >
                                    <span className="logs-tab-dot" style={{ background: 'var(--primary)' }}></span>
                                    App Logs
                                </button>
                                <button
                                    className={`logs-tab ${activeLogTab === 'error' ? 'active' : ''}`}
                                    onClick={() => setActiveLogTab('error')}
                                >
                                    <span className="logs-tab-dot" style={{ background: '#f85149' }}></span>
                                    Errores
                                </button>
                                <button
                                    className={`logs-tab ${activeLogTab === 'nginx' ? 'active' : ''}`}
                                    onClick={() => setActiveLogTab('nginx')}
                                >
                                    <span className="logs-tab-dot" style={{ background: '#3fb950' }}></span>
                                    Nginx
                                </button>
                                <button
                                    className={`logs-tab ${activeLogTab === 'diag' ? 'active' : ''}`}
                                    onClick={() => { setActiveLogTab('diag'); if (site) handleRunDiagnostic(site.server_id, site.name); }}
                                >
                                    <span className="logs-tab-dot" style={{ background: '#f0883e' }}></span>
                                    Diagnóstico
                                </button>
                            </div>
                            <div className="logs-modal-body">
                                <pre className="logs-modal-pre" style={{ color: activeLogTab === 'error' ? '#ff7b72' : '#e6edf3' }}>
                                    {typeof logsContent === 'string' ? logsContent : logsContent[activeLogTab] || 'No hay contenido para mostrar en esta pesta\u00f1a.'}
                                </pre>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default Websites;
