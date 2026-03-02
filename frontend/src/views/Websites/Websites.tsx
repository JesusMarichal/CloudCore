import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import { Globe, Plus, Play, X, ExternalLink, HardDrive, Settings, GitCommit, RefreshCw, CloudUpload } from 'lucide-react';
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
    const [logsContent, setLogsContent] = useState('');
    const [editingSite, setEditingSite] = useState<any>(null);
    const [showEnvModal, setShowEnvModal] = useState(false);
    const [envList, setEnvList] = useState<{ key: string, value: string }[]>([]);

    // New states for commits and deploying updates
    const [commits, setCommits] = useState<{ [key: string]: { hash: string, message: string, author: string, time: string } | null }>({});
    const [deployingSites, setDeployingSites] = useState<{ [key: string]: boolean }>({});

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
                alert('¡Configuración actualizada con éxito!');
            } else {
                await serverService.deployWebsite(formData.serverId, { ...formData, userId: currentUserId });
                alert('¡Sitio web desplegado con éxito!');
            }

            setShowForm(false);
            setFormData({
                serverId: servers[0]?.id || formData.serverId,
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
            alert('Hubo un error al procesar el sitio.');
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
            alert('¡Variables de entorno actualizadas y sitio reiniciado!');
            setShowEnvModal(false);

            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const sites = await serverService.listWebsites(user.id);
                setWebsites(sites);
            }
        } catch (error) {
            console.error('Error saving env:', error);
            alert('Error al guardar variables');
        } finally {
            setDeploying(false);
        }
    };

    const handleDelete = async (serverId: string, websiteId: string) => {
        if (!window.confirm('¿Estás seguro de que deseas eliminar este sitio web?')) return;
        try {
            await serverService.deleteWebsite(serverId, websiteId);
            setWebsites(websites.filter(w => w.id !== websiteId));
        } catch (error) {
            console.error('Error eliminando sitio:', error);
            alert('No se pudo eliminar el sitio web.');
        }
    };

    const handleViewLogs = async (serverId: string, websiteId: string) => {
        setViewingLogs(websiteId);
        setLogsContent('Cargando logs...');
        try {
            const res = await serverService.getWebsiteLogs(serverId, websiteId);
            setLogsContent(res.logs || 'Sin logs disponibles.');
        } catch (error) {
            setLogsContent('Error al obtener logs.');
        }
    };

    const handleDeployLatest = async (serverId: string, websiteId: string) => {
        if (!window.confirm('¿Obtener el último commit de tu repositorio y hacer un re-despliegue ahora mismo?')) return;

        setDeployingSites(prev => ({ ...prev, [websiteId]: true }));
        try {
            const res = await serverService.deployLatestCommit(serverId, websiteId);
            if (res.success) {
                alert('¡Sitio reconstruido y actualizado exitosamente al último commit!');
                const commitRes = await serverService.getWebsiteCommit(serverId, websiteId);
                if (commitRes.success && commitRes.commit) {
                    setCommits(prev => ({ ...prev, [websiteId]: commitRes.commit }));
                }
            } else {
                alert('Error al desplegar commit: ' + (res.message || 'Error desconocido'));
            }
        } catch (error) {
            console.error('Error deploy latest:', error);
            alert('Error al ejecutar el despliegue del último commit.');
        } finally {
            setDeployingSites(prev => ({ ...prev, [websiteId]: false }));
        }
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
                                <div className="website-card">
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
                                            <a href={site.domain ? `http://${site.domain}` : `http://${site.serverIp}:${site.port}`} target="_blank" rel="noopener noreferrer" className="site-link-premium">
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
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span className="mono" style={{ color: 'var(--gh-text-link)' }}>{commits[site.id]!.hash}</span>
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
                                        <button className="btn-action" onClick={() => handleViewLogs(site.server_id, site.id)} title="Ver Logs"><Play size={18} /></button>
                                        <button className="btn-action" onClick={() => handleOpenEnvModal(site)} title="Variables .env"><Globe size={18} /></button>
                                        <button className="btn-action" onClick={() => handleEdit(site)} title="Configuración"><Settings size={18} /></button>
                                        <button className="btn-action-danger" onClick={() => handleDelete(site.server_id, site.id)} title="Eliminar"><X size={18} /></button>
                                    </div>
                                </div>
                                {viewingLogs === site.id && (
                                    <div className="logs-panel">
                                        <div className="logs-header">
                                            <span>Logs - {site.name}</span>
                                            <button onClick={() => setViewingLogs(null)}><X size={14} /></button>
                                        </div>
                                        <pre className="logs-pre">{logsContent}</pre>
                                    </div>
                                )}
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
                                <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditingSite(null); }}>Cancelar</button>
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
        </div>
    );
};

export default Websites;
