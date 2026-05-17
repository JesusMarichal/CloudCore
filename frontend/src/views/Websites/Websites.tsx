import { useState, useEffect, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import { Globe, Plus, X, ExternalLink, HardDrive, Settings, GitCommit, RefreshCw, CloudUpload, Terminal, RotateCcw, CheckCircle2 } from 'lucide-react';
import { API_URL } from '../../config';
import './Websites.css';

const AUTO_DEPLOYED_STORAGE_KEY = 'cc_auto_deployed_v1';

const loadAutoDeployedKeys = (): Set<string> => {
    try {
        const raw = localStorage.getItem(AUTO_DEPLOYED_STORAGE_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? new Set(parsed.filter((k): k is string => typeof k === 'string')) : new Set();
    } catch {
        return new Set();
    }
};

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
    useLetsEncrypt: boolean;
    setupWwwAlias: boolean;
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

    type CommitInfo = { hash: string; message: string; author: string; time: string; isOutdated?: boolean; latestHash?: string | null; latestMessage?: string | null; latestTime?: string | null };

    // New states for commits and deploying updates
    const [commits, setCommits] = useState<{ [key: string]: CommitInfo | null }>({});
    const [deployingSites, setDeployingSites] = useState<{ [key: string]: boolean }>({});
    const [checkingCommits, setCheckingCommits] = useState<{ [key: string]: boolean }>({});

    // Refs so the interval always reads fresh values without stale closures
    const commitsRef = useRef<{ [key: string]: CommitInfo | null }>({});
    const deployingSitesRef = useRef<{ [key: string]: boolean }>({});
    const websitesRef = useRef<any[]>([]);
    const autoDeployedRef = useRef<Set<string>>(loadAutoDeployedKeys());
    const pollingRef = useRef(false);

    const persistAutoDeployedKey = (key: string) => {
        autoDeployedRef.current.add(key);
        try {
            localStorage.setItem(AUTO_DEPLOYED_STORAGE_KEY, JSON.stringify(Array.from(autoDeployedRef.current).slice(-200)));
        } catch { /* silent */ }
    };

    useEffect(() => { commitsRef.current = commits; }, [commits]);
    useEffect(() => { deployingSitesRef.current = deployingSites; }, [deployingSites]);
    useEffect(() => { websitesRef.current = websites; }, [websites]);

    const { pushNotification } = useOutletContext<{ pushNotification: (n: { type: 'info' | 'success' | 'warning' | 'error'; title: string; message: string }) => void }>();

    const autoDeploy = async (serverId: string, websiteId: string, siteName: string, commitMsg: string | null, deployKey: string) => {
        setDeployingSites(prev => ({ ...prev, [websiteId]: true }));
        try {
            const res = await serverService.deployLatestCommit(serverId, websiteId);
            if (res.success) {
                persistAutoDeployedKey(deployKey);
                pushNotification({
                    type: 'success',
                    title: `${siteName} actualizado`,
                    message: commitMsg ? `Nuevo deploy: ${commitMsg}` : 'Commit nuevo desplegado automáticamente.',
                });
                const commitRes = await serverService.getWebsiteCommit(serverId, websiteId);
                if (commitRes.success && commitRes.commit) {
                    setCommits(prev => ({ ...prev, [websiteId]: commitRes.commit }));
                }
            } else {
                // Deploy failed — remove from ref so next poll can retry
                autoDeployedRef.current.delete(deployKey);
            }
        } catch {
            autoDeployedRef.current.delete(deployKey);
        } finally {
            setDeployingSites(prev => ({ ...prev, [websiteId]: false }));
        }
    };

    // Poll every 5 s — auto-deploy on new commit detected
    useEffect(() => {
        const interval = setInterval(async () => {
            if (pollingRef.current) return;
            const sites = websitesRef.current;
            if (sites.length === 0) return;

            pollingRef.current = true;
            for (const site of sites) {
                setCheckingCommits(prev => ({ ...prev, [site.id]: true }));
                try {
                    const res = await serverService.getWebsiteCommit(site.server_id, site.id);
                    if (res.success && res.commit) {
                        const next = res.commit;
                        setCommits(p => ({ ...p, [site.id]: next }));

                        // Solo dispara auto-deploy si no hay uno ya corriendo para este sitio
                        const deployKey = `${site.id}:${next.latestHash}`;
                        if (!deployingSitesRef.current[site.id] && next.isOutdated && next.latestHash && !autoDeployedRef.current.has(deployKey)) {
                            autoDeployedRef.current.add(deployKey);
                            autoDeploy(site.server_id, site.id, site.name, next.latestMessage ?? null, deployKey);
                        }
                    }
                } catch { /* ignore */ }
                setCheckingCommits(prev => ({ ...prev, [site.id]: false }));
            }
            pollingRef.current = false;
        }, 5000);
        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        useLetsEncrypt: false,
        setupWwwAlias: false,
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
                    const reposRes = await fetch(`${API_URL}/github/repos/${user.id}`);
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
                setDeployLogs('Iniciando actualización de configuración...\n');
                await serverService.updateWebsite(formData.serverId, editingSite.id, formData, (chunk) => {
                    setDeployLogs(prev => prev + chunk);
                });
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
                useLetsEncrypt: false,
                setupWwwAlias: false,
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
            useLetsEncrypt: !!site.use_letsencrypt,
            setupWwwAlias: !!site.setup_www_alias,
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
                useLetsEncrypt: !!editingSite.use_letsencrypt,
                setupWwwAlias: !!editingSite.setup_www_alias,
                envVars: envString,
                userId: editingSite.user_id
            };

            setDeployLogs(`Iniciando actualización de variables para ${editingSite.name}...\n`);
            await serverService.updateWebsite(editingSite.server_id, editingSite.id, updatedData, (chunk) => {
                setDeployLogs(prev => prev + chunk);
            });
            showToast('¡Variables de entorno actualizadas!', 'success');
            setShowEnvModal(false);
            setEditingSite(null); // Limpiar para que el modal de progreso se vea si se desea, o para resetear estado

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

    const handleRunDiagnostic = async (serverId: string) => {
        setLogsContent((prev: any) => ({ ...prev, diag: 'Ejecutando diagnóstico del servidor...\n\n' }));
        const diagCmd = `echo "=== DOCKER CONTAINERS ==="
echo "---"
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Docker no instalado o sin contenedores."
echo ""
echo "=== PM2 STATUS ==="
echo "---"
pm2 list 2>/dev/null || echo "PM2 no instalado."
echo ""
echo "=== NGINX CONFIG TEST ==="
echo "---"
sudo nginx -t 2>&1 || echo "Error en configuración de Nginx."
echo ""
echo "=== SSL CERTIFICATES (Let's Encrypt) ==="
echo "---"
sudo certbot certificates 2>/dev/null || echo "No se encontraron certificados de Certbot."
ls -la /etc/nginx/sites-enabled/ || echo "No hay sitios habilitados en Nginx."
echo ""
echo "=== PUERTOS ABIERTOS ==="
echo "---"
sudo netstat -tlnp | grep -E ':(80|443|3000)' || ss -tlnp | grep -E ':(80|443|3000)' || echo "No hay servicios escuchando en 80, 443 o 3000."
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
                            const hash = commitRes.commit.latestHash || commitRes.commit.hash;
                            if (hash) persistAutoDeployedKey(`${websiteId}:${hash}`);
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
                        <Plus size={16} /> Desplegar Proyecto
                    </button>
                )}
            </header>

            {loading ? (
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
                    <div className="empty-icon"><Globe size={40} /></div>
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
                        <div key={site.id} className={`website-card ${deployingSites[site.id] ? 'deploying' : (commits[site.id]?.isOutdated ? 'outdated' : '')}`}>
                            <div className="website-info">
                                <div className="website-header-row">
                                    <h3 title={site.name}>{site.name}</h3>
                                    <span className={`status-badge ${site.status || 'online'}`}>
                                        {site.status === 'error' ? 'Error' : 'Activo'}
                                    </span>
                                </div>
                                <div className="website-meta">
                                    <div className="meta-item"><HardDrive size={13} /> {site.serverIp}</div>
                                    <div className="meta-item"><ExternalLink size={13} /> Port {site.port}</div>
                                    {site.domain ? (
                                        <div className="meta-item"><Globe size={13} /> {site.domain}</div>
                                    ) : (
                                        <div className="meta-item no-domain" onClick={() => handleEdit(site)} title="Clic para agregar dominio">
                                            <Globe size={13} /> <span>Sin dominio</span>
                                        </div>
                                    )}
                                    {site.use_letsencrypt && site.domain && (
                                        <div className="meta-item ssl-active">
                                            <RefreshCw size={11} /> SSL activo
                                        </div>
                                    )}
                                </div>
                                <div className="card-links">
                                    <a href={site.domain ? `http://${site.domain}` : `http://${site.serverIp}`} target="_blank" rel="noopener noreferrer" className="site-link-premium">
                                        <ExternalLink size={12} /> Abrir Sitio
                                    </a>
                                </div>
                            </div>
                            <div className="website-commit-info">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        <GitCommit size={12} /> Último Commit
                                        {checkingCommits[site.id] && (
                                            <span className="commit-checking-dots">
                                                <span /><span /><span />
                                            </span>
                                        )}
                                    </span>
                                    <button
                                        className={`btn-ghost${commits[site.id]?.isOutdated && !deployingSites[site.id] ? ' btn-ghost-update' : ''}`}
                                        onClick={() => handleDeployLatest(site.server_id, site.id)}
                                        disabled={deployingSites[site.id]}
                                    >
                                        {deployingSites[site.id] ? (
                                            <><RefreshCw size={11} className="spinning" /> Desplegando...</>
                                        ) : commits[site.id]?.isOutdated ? (
                                            <><CloudUpload size={11} /> Actualizar Sitio</>
                                        ) : (
                                            <><CloudUpload size={11} /> Desplegar Último</>
                                        )}
                                    </button>
                                </div>
                                {commits[site.id] ? (
                                    <div style={{ fontSize: '12px' }}>
                                        <div title={commits[site.id]!.isOutdated && commits[site.id]!.latestMessage ? commits[site.id]!.latestMessage! : commits[site.id]!.message} style={{ fontWeight: 500, color: 'var(--text-main)', marginBottom: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {commits[site.id]!.isOutdated && commits[site.id]!.latestMessage ? commits[site.id]!.latestMessage : commits[site.id]!.message}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                            <span className="mono" style={{ color: 'var(--gh-text-link)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {commits[site.id]!.isOutdated && commits[site.id]!.latestHash ? commits[site.id]!.latestHash : commits[site.id]!.hash}
                                                {commits[site.id]!.isOutdated && (
                                                    deployingSites[site.id] ? (
                                                        <span style={{ color: '#3fb950', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)', padding: '1px 6px' }}>
                                                            <RefreshCw size={9} className="spinning" /> Actualizando
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#f0883e', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', background: 'rgba(240,136,62,0.1)', border: '1px solid rgba(240,136,62,0.25)', padding: '1px 6px' }}
                                                            title={`Desplegado: ${commits[site.id]!.hash}`}>
                                                            <RefreshCw size={9} className="spinning" /> desactualizado
                                                        </span>
                                                    )
                                                )}
                                            </span>
                                            <span style={{ color: 'var(--text-dim)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                {commits[site.id]!.isOutdated && commits[site.id]!.latestTime ? commits[site.id]!.latestTime : commits[site.id]!.time}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Verificando
                                        <span className="commit-checking-dots">
                                            <span /><span /><span />
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="website-actions">
                                <button className="btn-action" onClick={() => handleViewLogs(site.server_id, site.id, site.name)} title="Ver Logs"><Terminal size={16} /></button>
                                <button className="btn-action" onClick={() => handleOpenEnvModal(site)} title="Variables .env"><Globe size={16} /></button>
                                <button className="btn-action" onClick={() => handleEdit(site)} title="Configuración"><Settings size={16} /></button>
                                <button className="btn-action-danger" onClick={() => handleDelete(site.server_id, site.id)} title="Eliminar"><X size={16} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Deploy / Edit Form Modal ── */}
            {showForm && (
                <div className="ws-form-overlay" onClick={() => { setShowForm(false); setEditingSite(null); }}>
                    <div className="ws-form-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="ws-form-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div className="ws-form-icon">
                                    <Globe size={15} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                                        {editingSite ? `Editando: ${editingSite.name}` : 'Desplegar Proyecto'}
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {editingSite ? 'Actualiza la configuración del sitio web.' : 'Configura y despliega en tu servidor VPS.'}
                                    </p>
                                </div>
                            </div>
                            <button type="button" className="btn-close" onClick={() => { setShowForm(false); setEditingSite(null); }}>
                                <X size={15} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="ws-form-body">
                                <div className="form-section">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Servidor</label>
                                            <select value={formData.serverId} onChange={(e) => setFormData({ ...formData, serverId: e.target.value })} required disabled={!!editingSite}>
                                                <option value="" disabled>Seleccionar...</option>
                                                {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.ip})</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Nombre de la App</label>
                                            <input type="text" placeholder="mi-app" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Repositorio Git</label>
                                        {hasGithub ? (
                                            <select value={formData.repo} onChange={(e) => setFormData({ ...formData, repo: e.target.value })} required>
                                                <option value="" disabled>Seleccionar repositorio...</option>
                                                {githubRepos.map(r => <option key={r.id} value={r.clone_url}>{r.full_name}</option>)}
                                                <option value="custom">↳ URL manual</option>
                                            </select>
                                        ) : null}
                                        {(!hasGithub || formData.repo === 'custom') && (
                                            <input type="url" placeholder="https://github.com/usuario/repo.git" value={formData.repo === 'custom' ? '' : formData.repo} onChange={(e) => setFormData({ ...formData, repo: e.target.value })} required />
                                        )}
                                    </div>
                                </div>
                                <div className="form-section">
                                    <h3>Comandos</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Instalación</label>
                                            <input type="text" placeholder="npm install" value={formData.installCommand} onChange={(e) => setFormData({ ...formData, installCommand: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Build (opcional)</label>
                                            <input type="text" placeholder="npm run build" value={formData.buildCommand} onChange={(e) => setFormData({ ...formData, buildCommand: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Archivo de Entrada</label>
                                            <input type="text" placeholder="index.js" value={formData.entryPoint} onChange={(e) => setFormData({ ...formData, entryPoint: e.target.value })} required />
                                        </div>
                                        <div className="form-group">
                                            <label>Inicio (PM2)</label>
                                            <input type="text" placeholder="npm start" value={formData.startCommand} onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })} />
                                        </div>
                                    </div>
                                </div>
                                <div className="form-section">
                                    <h3>Red y Dominio</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Puerto</label>
                                            <input type="number" placeholder="3000" value={formData.port} onChange={(e) => setFormData({ ...formData, port: e.target.value })} required />
                                        </div>
                                        <div className="form-group">
                                            <label>Dominio (opcional)</label>
                                            <input type="text" placeholder="ejemplo.com" value={formData.domain} onChange={(e) => setFormData({ ...formData, domain: e.target.value })} />
                                        </div>
                                    </div>
                                    {formData.domain && formData.domain.trim() !== '' && formData.domain !== '_' && (
                                        <div className="form-group-checkbox" onClick={() => setFormData({ ...formData, useLetsEncrypt: !formData.useLetsEncrypt })}>
                                            <input type="checkbox" checked={formData.useLetsEncrypt} onChange={() => { }} />
                                            <label>Habilitar Let's Encrypt (SSL gratis)</label>
                                        </div>
                                    )}
                                    {formData.domain && formData.domain.trim() !== '' && formData.domain !== '_' && (
                                        <div className="form-group-checkbox" onClick={() => setFormData({ ...formData, setupWwwAlias: !formData.setupWwwAlias })}>
                                            <input type="checkbox" checked={formData.setupWwwAlias} onChange={() => { }} />
                                            <label>Redirigir www.{formData.domain} → {formData.domain}</label>
                                        </div>
                                    )}
                                </div>
                                <div className="form-section" style={{ marginBottom: 0 }}>
                                    <h3>Variables de Entorno</h3>
                                    <div className="form-group">
                                        <textarea
                                            rows={4}
                                            placeholder={"KEY=VALUE\nDATABASE_URL=postgres://..."}
                                            className="mono"
                                            value={formData.envVars}
                                            onChange={(e) => setFormData({ ...formData, envVars: e.target.value })}
                                        />
                                        <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                                            Contenido de tu archivo .env — se aplica solo en el despliegue inicial.
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="ws-form-footer">
                                <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditingSite(null); setDeployLogs(''); }}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-primary" disabled={deploying}>
                                    {deploying ? 'Procesando...' : (editingSite ? 'Guardar Cambios' : 'Desplegar')}
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
            {(deploying || deployLogs.trim() !== '') && (
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
                        {toast.type === 'success' && <div className="icon-success"><CheckCircle2 size={16} /></div>}
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
                                    onClick={() => { setActiveLogTab('diag'); if (site) handleRunDiagnostic(site.server_id); }}
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
