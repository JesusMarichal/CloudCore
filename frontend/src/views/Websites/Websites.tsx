import { useState, useEffect, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import { Globe, Plus, X, ExternalLink, HardDrive, Settings, RefreshCw, CloudUpload, Terminal, RotateCcw, CheckCircle2, ChevronRight, Trash2, Database, Folder, Lock } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { API_URL } from '../../config';
import { authFetch } from '../../services/apiFetch';
import { tokenStorage } from '../../services/tokenStorage';
import { useT } from '../../i18n';
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

/**
 * Marca de WordPress. Lucide no incluye iconos de marca, así que va como SVG
 * en línea y hereda el color del contenedor (`currentColor`).
 */
const WordPressIcon = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M12.158 12.786 9.46 20.625c.806.237 1.657.366 2.54.366 1.047 0 2.051-.18 2.986-.51a1.06 1.06 0 0 1-.065-.124l-2.763-7.571zM3.009 12c0 3.559 2.068 6.634 5.067 8.092L3.788 8.341A8.933 8.933 0 0 0 3.009 12zm15.06-.454c0-1.112-.399-1.881-.741-2.48-.456-.741-.883-1.368-.883-2.109 0-.826.627-1.596 1.51-1.596.04 0 .078.005.117.007A8.963 8.963 0 0 0 12 3.009a8.982 8.982 0 0 0-7.399 3.99c.208.006.404.01.57.01.94 0 2.396-.114 2.396-.114.485-.028.542.684.057.741 0 0-.487.057-1.029.085l3.274 9.739 1.968-5.901-1.401-3.838c-.485-.028-.944-.085-.944-.085-.485-.029-.428-.769.057-.741 0 0 1.484.114 2.368.114.94 0 2.397-.114 2.397-.114.486-.028.543.684.058.741 0 0-.488.057-1.029.085l3.249 9.665.897-2.996c.456-1.169.684-2.137.684-2.907zm1.82-3.86c.039.286.06.593.06.924 0 .912-.171 1.937-.684 3.219l-2.746 7.94c2.673-1.558 4.47-4.454 4.47-7.771a8.926 8.926 0 0 0-1.1-4.312zM12 22.784C6.051 22.784 1.216 17.949 1.216 12S6.051 1.216 12 1.216 22.784 6.051 22.784 12 17.949 22.784 12 22.784z" />
    </svg>
);

/** Hexágono de Node.js, por el mismo motivo que el de WordPress. */
const NodeIcon = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M11.998 24c-.321 0-.641-.084-.922-.247l-2.936-1.737c-.438-.245-.224-.332-.08-.383.585-.203.703-.25 1.328-.604.065-.037.151-.023.218.017l2.256 1.339c.082.045.197.045.272 0l8.795-5.076c.082-.047.134-.141.134-.238V6.921c0-.099-.053-.192-.137-.242l-8.791-5.072c-.081-.047-.189-.047-.271 0L3.075 6.68c-.085.049-.139.145-.139.241v10.15c0 .097.054.189.139.235l2.409 1.392c1.307.654 2.108-.116 2.108-.89V7.787c0-.142.114-.253.256-.253h1.115c.139 0 .255.112.255.253v10.021c0 1.745-.95 2.745-2.604 2.745-.508 0-.909 0-2.026-.551L2.28 18.675c-.57-.329-.922-.945-.922-1.604V6.921c0-.659.353-1.275.922-1.603l8.795-5.082c.557-.315 1.296-.315 1.848 0l8.794 5.082c.57.329.924.944.924 1.603v10.15c0 .659-.354 1.273-.924 1.604l-8.794 5.078c-.28.163-.599.247-.925.247zm7.101-10.007c0-1.9-1.284-2.406-3.987-2.763-2.731-.361-3.009-.548-3.009-1.187 0-.528.235-1.233 2.258-1.233 1.807 0 2.473.389 2.747 1.607.024.115.129.199.247.199h1.141c.071 0 .138-.031.186-.081.048-.054.074-.123.067-.196-.177-2.098-1.571-3.076-4.388-3.076-2.508 0-4.004 1.058-4.004 2.833 0 1.925 1.488 2.457 3.895 2.695 2.88.282 3.103.703 3.103 1.269 0 .983-.789 1.402-2.642 1.402-2.327 0-2.839-.584-3.011-1.742-.02-.124-.126-.215-.253-.215H9.314c-.141 0-.254.112-.254.253 0 1.482.806 3.248 4.655 3.248 2.786 0 4.384-1.097 4.384-3.014z" />
    </svg>
);

/** Marca de GitHub, de donde sale el commit que sigue el panel. */
const GitHubIcon = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
);

type StackId = 'node' | 'wordpress';

interface WebsiteFormData {
    serverId: string;
    name: string;
    stack: StackId;
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
    // ── WordPress ──
    wpMode: 'fresh' | 'migrate';
    wpDirectory: string;
    wpTitle: string;
    wpAdminUser: string;
    wpAdminPassword: string;
    wpAdminEmail: string;
    wpLocale: string;
    wpArchiveUrl: string;
    wpDbDumpUrl: string;
    wpSearchReplace: boolean;
    wpOldDomain: string;
    wpTablePrefix: string;
}

/** Estado de un archivo de migración: subido desde el equipo o indicado por URL. */
interface WpUpload {
    name: string;
    uploading: boolean;
    error?: string;
}

const emptyForm = (serverId: string, userId: string): WebsiteFormData => ({
    serverId,
    name: '',
    stack: 'node',
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
    userId,
    wpMode: 'fresh',
    wpDirectory: '',
    wpTitle: '',
    wpAdminUser: 'admin',
    wpAdminPassword: '',
    wpAdminEmail: '',
    wpLocale: 'es_ES',
    wpArchiveUrl: '',
    wpDbDumpUrl: '',
    wpSearchReplace: true,
    wpOldDomain: '',
    wpTablePrefix: 'wp_',
});

/** Un sitio WordPress no se despliega desde git: no hay commits que seguir. */
const tracksCommits = (site: any) => (site?.stack || 'node') !== 'wordpress';

/** URL pública del sitio. En WordPress la guarda el panel con su esquema real. */
const siteUrlOf = (site: any): string =>
    site?.stack_config?.siteUrl || (site?.domain ? `http://${site.domain}` : `http://${site?.serverIp}`);

/** URL del escritorio de WordPress. */
const adminUrlOf = (site: any): string =>
    site?.stack_config?.adminUrl || `${siteUrlOf(site)}/wp-admin`;



const Websites = () => {
    const navigate = useNavigate();
    const t = useT();
    const [servers, setServers] = useState<CreateServerData[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [closingForm, setClosingForm] = useState(false);
    // Panel de detalle: guarda solo el id, para que lo que se pinta salga
    // siempre de la lista viva y no de una copia congelada al abrirlo.
    const [detailId, setDetailId] = useState<string | null>(null);
    const [closingDetail, setClosingDetail] = useState(false);
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
                    message: commitMsg ? `Nuevo deploy: ${commitMsg}` : t('websites.msg.newCommit'),
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
                // WordPress no se despliega desde git: no hay commit que consultar.
                if (!tracksCommits(site)) continue;
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

    const [formData, setFormData] = useState<WebsiteFormData>(emptyForm('', ''));

    // Archivos de migración de WordPress ya subidos al servidor destino.
    const [wpArchive, setWpArchive] = useState<WpUpload | null>(null);
    const [wpDump, setWpDump] = useState<WpUpload | null>(null);

    const isWordpress = formData.stack === 'wordpress';

    /** Sitio que muestra el panel de detalle, tomado de la lista actualizada. */
    const detailSite = detailId ? websites.find(w => w.id === detailId) ?? null : null;

    /** Cierra el panel de detalle dejando correr su animación de salida. */
    const closeDetail = (then?: () => void) => {
        setClosingDetail(true);
        setTimeout(() => {
            setDetailId(null);
            setClosingDetail(false);
            then?.();
        }, 280);
    };

    /**
     * Cierra el panel dejando correr la animación de salida antes de
     * desmontarlo (el chasis de drawer.css tarda ~280 ms).
     */
    const closeForm = () => {
        setClosingForm(true);
        setTimeout(() => {
            setShowForm(false);
            setClosingForm(false);
            setEditingSite(null);
            setDeployLogs('');
        }, 280);
    };

    /**
     * Sube un .zip / .sql al servidor y guarda en el formulario la ruta remota
     * que devuelve el panel. Es el equivalente a "Cargar" en el Administrador de
     * archivos y a "Importar" en phpMyAdmin, pero en un solo paso.
     */
    const handleWpUpload = async (
        file: File | undefined,
        field: 'wpArchiveUrl' | 'wpDbDumpUrl',
        setUpload: (u: WpUpload | null) => void,
    ) => {
        if (!file) return;
        if (!formData.serverId) {
            showToast(t('websites.wp.pickServerFirst'), 'error');
            return;
        }
        setUpload({ name: file.name, uploading: true });
        try {
            const res = await serverService.uploadWordpressAsset(formData.serverId, file);
            if (res.success && res.path) {
                setFormData(prev => ({ ...prev, [field]: res.path as string }));
                setUpload({ name: file.name, uploading: false });
            } else {
                setUpload({ name: file.name, uploading: false, error: res.message || t('websites.wp.uploadError') });
            }
        } catch {
            setUpload({ name: file.name, uploading: false, error: t('websites.wp.uploadError') });
        }
    };

    useEffect(() => {
        const loadServers = async () => {
            const user = tokenStorage.getUser();
            if (tokenStorage.getToken() && user) {
                const data = await serverService.list();
                setServers(data);
                if (data.length > 0) {
                    setFormData(prev => ({ ...prev, serverId: data[0].id || '', userId: user.id }));
                }

                try {
                    const reposRes = await authFetch(`${API_URL}/github/repos`);
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
                    const sites = await serverService.listWebsites();
                    setWebsites(sites);

                    // Cargar commits de cada sitio en background (solo los que vienen de git)
                    sites.filter(tracksCommits).forEach((site: any) => {
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

        // El servidor se elige con fichas, no con un <select>, así que la
        // validación nativa del formulario no lo cubre.
        if (!formData.serverId) {
            showToast(t('websites.form.selectServer'), 'error');
            return;
        }

        setDeploying(true);
        try {
            const currentUserId = tokenStorage.getUser()?.id || '';

            if (editingSite) {
                setDeployLogs(t('websites.msg.startingUpdate'));
                await serverService.updateWebsite(formData.serverId, editingSite.id, formData, (chunk) => {
                    setDeployLogs(prev => prev + chunk);
                });
                setShowForm(false);
            } else {
                setDeployLogs(t('websites.msg.startingDeploy'));
                await serverService.deployWebsite(formData.serverId, { ...formData, userId: currentUserId }, (chunk) => {
                    setDeployLogs(prev => prev + chunk);
                });
                // showToast('¡Sitio web desplegado con éxito!', 'success'); // Omitir para mostrar la terminal completada
            }

            // Se mantiene el servidor y el stack elegidos para el siguiente sitio.
            setFormData({ ...emptyForm(formData.serverId, currentUserId), stack: formData.stack });
            setWpArchive(null);
            setWpDump(null);
            setEditingSite(null);
        } catch (error) {
            console.error('Error desplegando el sitio:', error);
            showToast(t('websites.msg.deployError'), 'error');
        } finally {
            setDeploying(false);
            if (tokenStorage.getToken()) {
                const sites = await serverService.listWebsites();
                setWebsites(sites);
            }
        }
    };

    const handleEdit = (site: any) => {
        setEditingSite(site);
        const cfg = site.stack_config || {};
        setFormData({
            ...emptyForm(site.server_id, site.user_id),
            name: site.name,
            stack: (site.stack || 'node') as StackId,
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
            wpDirectory: cfg.directory || '',
            wpLocale: cfg.locale || 'es_ES',
            wpTablePrefix: cfg.tablePrefix || 'wp_',
        });
        setWpArchive(null);
        setWpDump(null);
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

            setDeployLogs(t('websites.startingEnvUpdate', { name: editingSite.name }));
            await serverService.updateWebsite(editingSite.server_id, editingSite.id, updatedData, (chunk) => {
                setDeployLogs(prev => prev + chunk);
            });
            showToast(t('websites.env.saved'), 'success');
            setShowEnvModal(false);
            setEditingSite(null); // Limpiar para que el modal de progreso se vea si se desea, o para resetear estado

            if (tokenStorage.getToken()) {
                const sites = await serverService.listWebsites();
                setWebsites(sites);
            }
        } catch (error) {
            console.error('Error saving env:', error);
            showToast(t('websites.env.error'), 'error');
        } finally {
            setDeploying(false);
        }
    };

    const handleDelete = async (serverId: string, websiteId: string) => {
        setConfirmDialog({
            message: t('websites.confirm.deleteSite'),
            onConfirm: async () => {
                setConfirmDialog(null);
                try {
                    await serverService.deleteWebsite(serverId, websiteId);
                    setWebsites(websites.filter(w => w.id !== websiteId));
                    // El panel de detalle apunta a un sitio que ya no existe.
                    if (detailId === websiteId) closeDetail();
                    showToast(t('websites.msg.deleted'), 'success');
                } catch (error) {
                    console.error('Error eliminando sitio:', error);
                    showToast(t('websites.msg.deleteError'), 'error');
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
        setLogsContent((prev: any) => ({ ...prev, out: t('websites.logs.loading'), error: t('websites.logs.loading'), nginx: t('websites.logs.loading') }));
        setClosingLogsModal(false);
        try {
            const res = await serverService.getWebsiteLogs(serverId, websiteId);
            setLogsContent((prev: any) => ({
                ...prev,
                out: res.logs?.out || t('websites.logs.emptyOut'),
                error: res.logs?.error || t('websites.logs.emptyErr'),
                nginx: res.logs?.nginx || t('websites.logs.emptyNginx')
            }));
        } catch (error) {
            setLogsContent((prev: any) => ({ ...prev, out: t('websites.logs.error'), error: t('websites.logs.error'), nginx: t('websites.logs.error') }));
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
        setLogsContent((prev: any) => ({ ...prev, diag: t('websites.logs.diagnosing') }));
        // Los encabezados en mayúsculas se dejan en inglés a propósito: la salida
        // real de docker/pm2/nginx también lo está. Solo se traducen los mensajes
        // de fallback, que sí son texto nuestro.
        const diagCmd = `echo "=== DOCKER CONTAINERS ==="
echo "---"
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "${t('websites.logs.diagNoDocker')}"
echo ""
echo "=== PM2 STATUS ==="
echo "---"
pm2 list 2>/dev/null || echo "${t('websites.logs.diagNoPm2')}"
echo ""
echo "=== NGINX CONFIG TEST ==="
echo "---"
sudo nginx -t 2>&1 || echo "${t('websites.logs.diagNginxError')}"
echo ""
echo "=== SSL CERTIFICATES (Let's Encrypt) ==="
echo "---"
sudo certbot certificates 2>/dev/null || echo "${t('websites.logs.diagNoCerts')}"
ls -la /etc/nginx/sites-enabled/ || echo "${t('websites.logs.diagNoSites')}"
echo ""
echo "=== ${t('websites.logs.diagPorts')} ==="
echo "---"
sudo netstat -tlnp | grep -E ':(80|443|3000)' || ss -tlnp | grep -E ':(80|443|3000)' || echo "${t('websites.logs.diagNoPorts')}"
echo ""
echo "=== ${t('websites.logs.diagDone')} ==="`;
        try {
            const res = await serverService.executeCommand(serverId, diagCmd);
            setLogsContent((prev: any) => ({ ...prev, diag: res.output || res.message || t('websites.logs.noResult') }));
        } catch (error) {
            setLogsContent((prev: any) => ({ ...prev, diag: t('websites.logs.diagnoseError') }));
        }
    };

    const handleDeployLatest = async (serverId: string, websiteId: string) => {
        setConfirmDialog({
            message: t('websites.confirm.deployLatest'),
            onConfirm: async () => {
                setConfirmDialog(null);
                setDeployingSites(prev => ({ ...prev, [websiteId]: true }));
                try {
                    const res = await serverService.deployLatestCommit(serverId, websiteId);
                    if (res.success) {
                        showToast(t('websites.msg.rebuilt'), 'success');
                        const commitRes = await serverService.getWebsiteCommit(serverId, websiteId);
                        if (commitRes.success && commitRes.commit) {
                            setCommits(prev => ({ ...prev, [websiteId]: commitRes.commit }));
                            const hash = commitRes.commit.latestHash || commitRes.commit.hash;
                            if (hash) persistAutoDeployedKey(`${websiteId}:${hash}`);
                        }
                    } else {
                        showToast(t('websites.msg.deployLatestError') + ' ' + (res.message || t('websites.msg.unknownError')), 'error');
                    }
                } catch (error) {
                    console.error('Error deploy latest:', error);
                    showToast(t('websites.msg.deployLatestError'), 'error');
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
                    <h1><MorphIcon icon={Globe} size={24} className="icon-blue" /> {t('websites.title')}</h1>
                    <p className="text-muted">{t('websites.subtitle')}</p>
                </div>
                {servers.length > 0 && (
                    <button className="btn-primary" data-tour="deploy-project" onClick={() => setShowForm(true)}>
                        <MorphIcon icon={Plus} size={16} /> {t('websites.deployProject')}
                    </button>
                )}
            </header>

            {loading ? (
                <div className="empty-state"><p>{t('common.loading')}</p></div>
            ) : servers.length === 0 ? (
                <div className="empty-state-list">
                    <div className="empty-icon">🖥️</div>
                    <h3>{t('websites.noServers')}</h3>
                    <p className="text-muted">{t('websites.noServersDesc')}</p>
                    <button className="btn-primary" onClick={() => navigate('/dashboard/servers')}>
                        Ir a Servidores
                    </button>
                </div>
            ) : websites.length === 0 ? (
                <div className="empty-state-list">
                    <div className="empty-icon"><MorphIcon icon={Globe} size={40} /></div>
                    <h3>{t('websites.empty')}</h3>
                    <p className="text-muted">
                        {t('websites.emptyDesc', { count: servers.length })}
                    </p>
                    <button className="btn-primary" onClick={() => setShowForm(true)}>
                        <MorphIcon icon={Plus} size={16} /> {t('websites.deployFirst')}
                    </button>
                </div>
            ) : (
                <div className="website-list">
                    {/* La lista solo identifica el sitio y su estado; todo lo que se
                        puede hacer con él vive en el panel de detalle, para que la
                        vista no sea una rejilla de botones diminutos. */}
                    {websites.map(site => {
                        const commit = commits[site.id];
                        const deployingThis = !!deployingSites[site.id];
                        const outdated = !deployingThis && !!commit?.isOutdated;
                        return (
                            <div
                                key={site.id}
                                className={`website-card ${deployingThis ? 'deploying' : (outdated ? 'outdated' : '')}`}
                            >
                                <span className={`ws-card-icon ${site.stack === 'wordpress' ? 'wordpress' : 'node'}`}>
                                    {site.stack === 'wordpress' ? <WordPressIcon size={22} /> : <NodeIcon size={22} />}
                                </span>

                                <span className="ws-card-main">
                                    <span className="ws-card-title">
                                        {/* Este botón es el que abre el panel de detalle: su ::after
                                            se estira sobre toda la fila, así se puede pulsar en
                                            cualquier punto sin anidar controles unos dentro de otros. */}
                                        <button
                                            type="button"
                                            className="ws-card-name"
                                            title={site.name}
                                            onClick={() => setDetailId(site.id)}
                                        >
                                            <span className="ws-card-name-text">{site.name}</span>
                                        </button>
                                        {deployingThis && (
                                            <span className="ws-pill deploying">
                                                <MorphIcon icon={RefreshCw} size={10} className="spinning" /> {t('websites.form.deploying')}
                                            </span>
                                        )}
                                        {outdated && (
                                            <span className="ws-pill outdated">
                                                <MorphIcon icon={CloudUpload} size={10} /> {t('websites.pill.outdated')}
                                            </span>
                                        )}
                                    </span>
                                    <span className="ws-card-sub">
                                        <span className="ws-card-host">{site.domain || site.serverIp}</span>
                                        {site.use_letsencrypt && site.domain && (
                                            <MorphIcon icon={Lock} size={11} className="ws-card-ssl" />
                                        )}
                                    </span>
                                </span>

                                <span className={`ws-card-state ${site.status === 'error' ? 'error' : 'online'}`}>
                                    <span className="ws-server-dot" />
                                    {site.status === 'error' ? t('websites.state.error') : t('websites.state.active')}
                                </span>

                                {/* Abre la web publicada. Va por encima de la zona
                                    pulsable de la fila para que no abra el panel. */}
                                <a
                                    className="ws-card-link"
                                    href={siteUrlOf(site)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={t('websites.detail.openSite')}
                                    aria-label={t('websites.detail.openSite')}
                                >
                                    <MorphIcon icon={ExternalLink} size={15} />
                                </a>

                                <MorphIcon icon={ChevronRight} size={16} className="ws-card-chevron" />
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Panel lateral de despliegue / edición ──
                Usa el chasis compartido de styles/drawer.css (el mismo que Base
                de Datos), así hereda el tema claro y la animación de entrada. */}
            {showForm && (
                <div
                    className={`drawer-scrim ${closingForm ? 'closing' : ''}`}
                    onClick={deploying ? undefined : closeForm}
                >
                    <aside
                        className={`drawer ws-form-drawer ${closingForm ? 'closing' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label={editingSite ? editingSite.name : t('websites.deployProject')}
                    >
                        <header className="drawer-header">
                            <div className="ws-form-identity">
                                <div className={`ws-form-icon ${isWordpress ? 'wp' : 'node'}`}>
                                    {isWordpress ? <WordPressIcon size={24} /> : <NodeIcon size={24} />}
                                </div>
                                <div className="drawer-title">
                                    <h3>{editingSite ? `${editingSite.name}` : t('websites.deployProject')}</h3>
                                    <p>{editingSite ? t('websites.form.updateConfig') : t('websites.form.configureDeploy')}</p>
                                </div>
                            </div>
                            <button type="button" className="drawer-close" onClick={closeForm} aria-label={t('common.close')}>
                                <MorphIcon icon={X} size={18} />
                            </button>
                        </header>

                        <div className="drawer-body">
                            <form id="ws-deploy-form" onSubmit={handleSubmit}>
                                <div className="form-section">
                                    <div className="form-group">
                                        <label>{t('websites.form.stack')}</label>
                                        {/* El stack define todo lo demás del formulario, así que va
                                            primero. No se puede cambiar en una edición: implicaría
                                            volver a montar el sitio entero. */}
                                        <div className="stack-picker">
                                            {([
                                                { id: 'node' as StackId, label: 'Node.js', desc: t('websites.stack.nodeDesc'), icon: <NodeIcon size={16} /> },
                                                { id: 'wordpress' as StackId, label: 'WordPress', desc: t('websites.stack.wordpressDesc'), icon: <WordPressIcon size={16} /> },
                                            ]).map(opt => (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    className={`stack-option ${opt.id}${formData.stack === opt.id ? ' active' : ''}`}
                                                    disabled={!!editingSite}
                                                    onClick={() => setFormData({ ...formData, stack: opt.id })}
                                                >
                                                    <span className="stack-option-title">{opt.icon} {opt.label}</span>
                                                    <span className="stack-option-desc">{opt.desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>{t('websites.form.server')}</label>
                                        {/* Fichas en vez de un desplegable: el servidor destino se
                                            elige una vez y conviene ver su IP y su estado al hacerlo.
                                            En una edición no se puede mover el sitio de servidor. */}
                                        <div className="ws-server-picker" role="radiogroup" aria-label={t('websites.form.server')}>
                                            {(editingSite ? servers.filter(s => s.id === formData.serverId) : servers).map(s => {
                                                const selected = formData.serverId === s.id;
                                                return (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={selected}
                                                        className={`ws-server-option${selected ? ' selected' : ''}`}
                                                        disabled={!!editingSite}
                                                        onClick={() => setFormData({ ...formData, serverId: s.id || '' })}
                                                    >
                                                        <span className={`ws-server-dot ${s.status || 'online'}`} />
                                                        <span className="ws-server-text">
                                                            <span className="ws-server-name">{s.name}</span>
                                                            <span className="ws-server-ip mono">{s.ip}</span>
                                                        </span>
                                                        {selected && <MorphIcon icon={CheckCircle2} size={15} />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>{t('websites.form.appName')}</label>
                                        <input type="text" placeholder={t('websites.form.appNamePlaceholder')} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                                    </div>
                                    {!isWordpress && (
                                        <div className="form-group">
                                            <label>{t('websites.form.gitRepo')}</label>
                                            {hasGithub ? (
                                                <select value={formData.repo} onChange={(e) => setFormData({ ...formData, repo: e.target.value })} required>
                                                    <option value="" disabled>{t('websites.form.selectRepo')}</option>
                                                    {githubRepos.map(r => <option key={r.id} value={r.clone_url}>{r.full_name}</option>)}
                                                    <option value="custom">↳ URL manual</option>
                                                </select>
                                            ) : null}
                                            {(!hasGithub || formData.repo === 'custom') && (
                                                <input type="url" placeholder={t('websites.form.repoPlaceholder')} value={formData.repo === 'custom' ? '' : formData.repo} onChange={(e) => setFormData({ ...formData, repo: e.target.value })} required />
                                            )}
                                        </div>
                                    )}
                                </div>

                                {isWordpress && !editingSite && (
                                    <div className="form-section">
                                        <h3><WordPressIcon size={12} /> {t('websites.wp.title')}</h3>

                                        {/* Los dos caminos del flujo clásico: instalar de cero o
                                            traerse un WordPress que ya existe. */}
                                        <div className="form-group">
                                            <div className="stack-picker">
                                                {([
                                                    { id: 'fresh' as const, label: t('websites.wp.modeFresh'), desc: t('websites.wp.modeFreshDesc') },
                                                    { id: 'migrate' as const, label: t('websites.wp.modeMigrate'), desc: t('websites.wp.modeMigrateDesc') },
                                                ]).map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        className={`stack-option${formData.wpMode === opt.id ? ' active' : ''}`}
                                                        onClick={() => setFormData({ ...formData, wpMode: opt.id })}
                                                    >
                                                        <span className="stack-option-title">{opt.label}</span>
                                                        <span className="stack-option-desc">{opt.desc}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>{t('websites.wp.directory')}</label>
                                            <input
                                                type="text"
                                                placeholder={t('websites.wp.directoryPlaceholder')}
                                                value={formData.wpDirectory}
                                                onChange={(e) => setFormData({ ...formData, wpDirectory: e.target.value })}
                                            />
                                            <span className="form-hint">{t('websites.wp.directoryHint')}</span>
                                        </div>

                                        {formData.wpMode === 'fresh' ? (
                                            <>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>{t('websites.wp.siteTitle')}</label>
                                                        <input type="text" placeholder={t('websites.wp.siteTitlePlaceholder')} value={formData.wpTitle} onChange={(e) => setFormData({ ...formData, wpTitle: e.target.value })} />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>{t('websites.wp.locale')}</label>
                                                        <select value={formData.wpLocale} onChange={(e) => setFormData({ ...formData, wpLocale: e.target.value })}>
                                                            <option value="es_ES">Español (es_ES)</option>
                                                            <option value="es_MX">Español de México (es_MX)</option>
                                                            <option value="en_US">English (en_US)</option>
                                                            <option value="pt_BR">Português do Brasil (pt_BR)</option>
                                                            <option value="fr_FR">Français (fr_FR)</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>{t('websites.wp.adminUser')}</label>
                                                        <input type="text" placeholder="admin" value={formData.wpAdminUser} onChange={(e) => setFormData({ ...formData, wpAdminUser: e.target.value })} required />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>{t('websites.wp.adminPassword')}</label>
                                                        <input type="password" placeholder="••••••••" minLength={8} value={formData.wpAdminPassword} onChange={(e) => setFormData({ ...formData, wpAdminPassword: e.target.value })} required />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>{t('websites.wp.adminEmail')}</label>
                                                        <input type="email" placeholder="tu@correo.com" value={formData.wpAdminEmail} onChange={(e) => setFormData({ ...formData, wpAdminEmail: e.target.value })} required />
                                                    </div>
                                                </div>
                                                <span className="form-hint">{t('websites.wp.adminHint')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <div className="form-group">
                                                    <label>{t('websites.wp.filesLabel')}</label>
                                                    <input
                                                        type="file"
                                                        accept=".zip,.tar,.gz,.tgz"
                                                        onChange={(e) => handleWpUpload(e.target.files?.[0], 'wpArchiveUrl', setWpArchive)}
                                                    />
                                                    {wpArchive && (
                                                        <span className={`upload-status${wpArchive.error ? ' error' : ''}`}>
                                                            {wpArchive.uploading
                                                                ? t('websites.wp.uploading', { name: wpArchive.name })
                                                                : wpArchive.error || t('websites.wp.uploaded', { name: wpArchive.name })}
                                                        </span>
                                                    )}
                                                    <span className="form-hint">{t('websites.wp.filesHint')}</span>
                                                    <span className="field-divider">{t('websites.wp.orUrl')}</span>
                                                    <input
                                                        type="url"
                                                        placeholder={t('websites.wp.filesUrlPlaceholder')}
                                                        value={formData.wpArchiveUrl.startsWith('/tmp/') ? '' : formData.wpArchiveUrl}
                                                        onChange={(e) => { setWpArchive(null); setFormData({ ...formData, wpArchiveUrl: e.target.value }); }}
                                                    />
                                                </div>

                                                <div className="form-group">
                                                    <label>{t('websites.wp.dumpLabel')}</label>
                                                    <input
                                                        type="file"
                                                        accept=".sql,.gz,.zip"
                                                        onChange={(e) => handleWpUpload(e.target.files?.[0], 'wpDbDumpUrl', setWpDump)}
                                                    />
                                                    {wpDump && (
                                                        <span className={`upload-status${wpDump.error ? ' error' : ''}`}>
                                                            {wpDump.uploading
                                                                ? t('websites.wp.uploading', { name: wpDump.name })
                                                                : wpDump.error || t('websites.wp.uploaded', { name: wpDump.name })}
                                                        </span>
                                                    )}
                                                    <span className="form-hint">{t('websites.wp.dumpHint')}</span>
                                                    <span className="field-divider">{t('websites.wp.orUrl')}</span>
                                                    <input
                                                        type="url"
                                                        placeholder={t('websites.wp.dumpUrlPlaceholder')}
                                                        value={formData.wpDbDumpUrl.startsWith('/tmp/') ? '' : formData.wpDbDumpUrl}
                                                        onChange={(e) => { setWpDump(null); setFormData({ ...formData, wpDbDumpUrl: e.target.value }); }}
                                                    />
                                                </div>

                                                <div className="form-group-checkbox" onClick={() => setFormData({ ...formData, wpSearchReplace: !formData.wpSearchReplace })}>
                                                    <input type="checkbox" checked={formData.wpSearchReplace} onChange={() => { }} />
                                                    <label>{t('websites.wp.searchReplace')}</label>
                                                </div>

                                                {formData.wpSearchReplace && (
                                                    <div className="form-row">
                                                        <div className="form-group">
                                                            <label>{t('websites.wp.oldDomain')}</label>
                                                            <input type="text" placeholder="https://midominioviejo.com" value={formData.wpOldDomain} onChange={(e) => setFormData({ ...formData, wpOldDomain: e.target.value })} />
                                                            <span className="form-hint">{t('websites.wp.oldDomainHint')}</span>
                                                        </div>
                                                        <div className="form-group">
                                                            <label>{t('websites.wp.tablePrefix')}</label>
                                                            <input type="text" placeholder="wp_" value={formData.wpTablePrefix} onChange={(e) => setFormData({ ...formData, wpTablePrefix: e.target.value })} />
                                                            <span className="form-hint">{t('websites.wp.tablePrefixHint')}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                {!isWordpress && (
                                <div className="form-section">
                                    <h3>{t('websites.form.commands')}</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>{t('websites.form.install')}</label>
                                            <input type="text" placeholder="npm install" value={formData.installCommand} onChange={(e) => setFormData({ ...formData, installCommand: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>{t('websites.form.build')}</label>
                                            <input type="text" placeholder="npm run build" value={formData.buildCommand} onChange={(e) => setFormData({ ...formData, buildCommand: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>{t('websites.form.entryFile')}</label>
                                            <input type="text" placeholder="index.js" value={formData.entryPoint} onChange={(e) => setFormData({ ...formData, entryPoint: e.target.value })} required />
                                        </div>
                                        <div className="form-group">
                                            <label>{t('websites.form.start')}</label>
                                            <input type="text" placeholder="npm start" value={formData.startCommand} onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })} />
                                        </div>
                                    </div>
                                </div>
                                )}
                                <div className="form-section">
                                    <h3>{t('websites.form.networkDomain')}</h3>
                                    <div className="form-row">
                                        {/* WordPress lo sirve Nginx directamente con PHP-FPM:
                                            no hay ningún puerto interno que reservar. */}
                                        {!isWordpress && (
                                        <div className="form-group">
                                            <label>{t('websites.form.port')}{editingSite ? ` — ${t('websites.form.portLocked')}` : ''}</label>
                                            {/* El puerto interno es único por servidor y lo gestiona el backend.
                                                Editarlo a mano dejaría el vhost apuntando a un proceso ajeno. */}
                                            <input type="number" placeholder="3000" value={formData.port} onChange={(e) => setFormData({ ...formData, port: e.target.value })} readOnly={!!editingSite} disabled={!!editingSite} required />
                                        </div>
                                        )}
                                        <div className="form-group">
                                            <label>{t('websites.form.domain')}</label>
                                            <input type="text" placeholder={t('websites.form.domainPlaceholder')} value={formData.domain} onChange={(e) => setFormData({ ...formData, domain: e.target.value })} />
                                        </div>
                                    </div>
                                    {formData.domain && formData.domain.trim() !== '' && formData.domain !== '_' && (
                                        <div className="form-group-checkbox" onClick={() => setFormData({ ...formData, useLetsEncrypt: !formData.useLetsEncrypt })}>
                                            <input type="checkbox" checked={formData.useLetsEncrypt} onChange={() => { }} />
                                            <label>{t('websites.form.ssl')}</label>
                                        </div>
                                    )}
                                    {formData.domain && formData.domain.trim() !== '' && formData.domain !== '_' && (
                                        <div className="form-group-checkbox" onClick={() => setFormData({ ...formData, setupWwwAlias: !formData.setupWwwAlias })}>
                                            <input type="checkbox" checked={formData.setupWwwAlias} onChange={() => { }} />
                                            <label>Redirigir www.{formData.domain} → {formData.domain}</label>
                                        </div>
                                    )}
                                </div>
                                {!isWordpress && (
                                <div className="form-section" style={{ marginBottom: 0 }}>
                                    <h3>{t('websites.env.title')}</h3>
                                    <div className="form-group">
                                        <textarea
                                            rows={4}
                                            placeholder={"KEY=VALUE\nDATABASE_URL=postgres://..."}
                                            className="mono"
                                            value={formData.envVars}
                                            onChange={(e) => setFormData({ ...formData, envVars: e.target.value })}
                                        />
                                        <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                                            {t('websites.envFileHint')}
                                        </span>
                                    </div>
                                </div>
                                )}
                            </form>
                        </div>

                        <footer className="drawer-footer">
                            <button type="button" className="btn-secondary" onClick={closeForm}>
                                {t('common.cancel')}
                            </button>
                            <button type="submit" form="ws-deploy-form" className="btn-primary" disabled={deploying}>
                                {deploying ? t('servers.apps.processing') : (editingSite ? t('websites.env.save') : t('websites.form.deploy'))}
                            </button>
                        </footer>
                    </aside>
                </div>
            )}

            {/* ── Panel lateral de detalle del sitio ──
                Todo lo que se puede hacer con un sitio vive aquí: accesos,
                datos, estado del repositorio y acciones. La lista se queda
                limpia y este panel carga con el resto. */}
            {detailSite && (
                <div
                    className={`drawer-scrim ${closingDetail ? 'closing' : ''}`}
                    onClick={() => closeDetail()}
                >
                    <aside
                        className={`drawer ws-site-drawer ${closingDetail ? 'closing' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label={detailSite.name}
                    >
                        <header className="drawer-header">
                            <div className="ws-form-identity">
                                <div className={`ws-form-icon ${detailSite.stack === 'wordpress' ? 'wp' : 'node'}`}>
                                    {detailSite.stack === 'wordpress' ? <WordPressIcon size={24} /> : <NodeIcon size={24} />}
                                </div>
                                <div className="drawer-title">
                                    <h3>{detailSite.name}</h3>
                                    <p>{detailSite.domain || detailSite.serverIp}</p>
                                </div>
                            </div>
                            <button type="button" className="drawer-close" onClick={() => closeDetail()} aria-label={t('common.close')}>
                                <MorphIcon icon={X} size={18} />
                            </button>
                        </header>

                        <div className="drawer-body">
                            {/* La web publicada se abre desde el listado; aquí solo
                                queda el escritorio de WordPress, que no tiene otro acceso. */}
                            {detailSite.stack === 'wordpress' && (
                                <div className="ws-detail-links">
                                    <a className="ws-link-card" href={adminUrlOf(detailSite)} target="_blank" rel="noopener noreferrer">
                                        <WordPressIcon size={15} />
                                        {t('websites.wp.openAdmin')}
                                    </a>
                                </div>
                            )}

                            <section>
                                <h4 className="drawer-section-title">{t('websites.detail.details')}</h4>
                                <dl className="ws-detail-list">
                                    <div className="ws-detail-row">
                                        <dt><MorphIcon icon={HardDrive} size={13} /> {t('websites.detail.server')}</dt>
                                        <dd>{detailSite.serverName || '—'} <span className="mono">{detailSite.serverIp}</span></dd>
                                    </div>
                                    <div className="ws-detail-row">
                                        <dt><MorphIcon icon={Globe} size={13} /> {t('websites.form.domain')}</dt>
                                        <dd>
                                            {detailSite.domain || <span className="ws-detail-empty">{t('websites.noDomain')}</span>}
                                        </dd>
                                    </div>
                                    <div className="ws-detail-row">
                                        <dt><MorphIcon icon={Lock} size={13} /> SSL</dt>
                                        <dd>
                                            {detailSite.use_letsencrypt && detailSite.domain
                                                ? <span className="ws-detail-ok">{t('websites.detail.sslOn')}</span>
                                                : <span className="ws-detail-empty">{t('websites.detail.sslOff')}</span>}
                                        </dd>
                                    </div>
                                    {/* WordPress no reserva puerto: Nginx lo sirve con PHP-FPM. */}
                                    {detailSite.port ? (
                                        <div className="ws-detail-row">
                                            <dt><MorphIcon icon={ChevronRight} size={13} /> {t('websites.form.port')}</dt>
                                            <dd className="mono">{detailSite.port}</dd>
                                        </div>
                                    ) : null}
                                    {detailSite.stack === 'wordpress' && (
                                        <>
                                            <div className="ws-detail-row">
                                                <dt><MorphIcon icon={Database} size={13} /> {t('websites.wp.cardDatabase')}</dt>
                                                <dd className="mono">{detailSite.stack_config?.dbName || '—'}</dd>
                                            </div>
                                            <div className="ws-detail-row">
                                                <dt><MorphIcon icon={Folder} size={13} /> {t('websites.wp.cardPath')}</dt>
                                                <dd className="mono">{detailSite.stack_config?.installPath || '—'}</dd>
                                            </div>
                                        </>
                                    )}
                                </dl>
                            </section>

                            {/* Repositorio: solo los stacks que se despliegan desde git. */}
                            {tracksCommits(detailSite) && (
                                <section>
                                    <h4 className="drawer-section-title">
                                        <GitHubIcon size={13} /> {t('websites.detail.githubCommit')}
                                        {checkingCommits[detailSite.id] && (
                                            <span className="commit-checking-dots"><span /><span /><span /></span>
                                        )}
                                    </h4>

                                    {commits[detailSite.id] ? (
                                        <div className="ws-commit-box">
                                            <p className="ws-commit-msg" title={commits[detailSite.id]!.isOutdated && commits[detailSite.id]!.latestMessage ? commits[detailSite.id]!.latestMessage! : commits[detailSite.id]!.message}>
                                                {commits[detailSite.id]!.isOutdated && commits[detailSite.id]!.latestMessage
                                                    ? commits[detailSite.id]!.latestMessage
                                                    : commits[detailSite.id]!.message}
                                            </p>
                                            <div className="ws-commit-meta">
                                                <span className="mono ws-commit-hash">
                                                    {commits[detailSite.id]!.isOutdated && commits[detailSite.id]!.latestHash
                                                        ? commits[detailSite.id]!.latestHash
                                                        : commits[detailSite.id]!.hash}
                                                </span>
                                                <span>{commits[detailSite.id]!.isOutdated && commits[detailSite.id]!.latestTime
                                                    ? commits[detailSite.id]!.latestTime
                                                    : commits[detailSite.id]!.time}</span>
                                            </div>
                                            {commits[detailSite.id]!.isOutdated && !deployingSites[detailSite.id] && (
                                                <span className="ws-pill outdated">
                                                    <MorphIcon icon={CloudUpload} size={10} /> {t('websites.pill.outdated')}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="ws-detail-empty">{t('websites.detail.checkingCommit')}</p>
                                    )}

                                    <button
                                        type="button"
                                        className="ws-action-row"
                                        onClick={() => handleDeployLatest(detailSite.server_id, detailSite.id)}
                                        disabled={!!deployingSites[detailSite.id]}
                                    >
                                        <MorphIcon icon={deployingSites[detailSite.id] ? RefreshCw : CloudUpload} size={16} className={deployingSites[detailSite.id] ? 'spinning' : ''} />
                                        <span className="ws-action-text">
                                            <span className="ws-action-name">
                                                {deployingSites[detailSite.id] ? t('websites.form.deploying') : t('websites.deployLatest')}
                                            </span>
                                            <span className="ws-action-desc">{t('websites.detail.deployLatestDesc')}</span>
                                        </span>
                                    </button>
                                </section>
                            )}

                            <section>
                                <h4 className="drawer-section-title">{t('websites.detail.actions')}</h4>
                                <div className="ws-action-list">
                                    <button type="button" className="ws-action-row" onClick={() => handleViewLogs(detailSite.server_id, detailSite.id, detailSite.name)}>
                                        <MorphIcon icon={Terminal} size={16} />
                                        <span className="ws-action-text">
                                            <span className="ws-action-name">{t('websites.viewLogs')}</span>
                                            <span className="ws-action-desc">{t('websites.detail.logsDesc')}</span>
                                        </span>
                                        <MorphIcon icon={ChevronRight} size={15} className="ws-action-chevron" />
                                    </button>

                                    {/* Las variables .env son del stack de Node: WordPress se
                                        configura en wp-config.php, no en un .env. */}
                                    {tracksCommits(detailSite) && (
                                        <button type="button" className="ws-action-row" onClick={() => closeDetail(() => handleOpenEnvModal(detailSite))}>
                                            <MorphIcon icon={Globe} size={16} />
                                            <span className="ws-action-text">
                                                <span className="ws-action-name">{t('websites.envVars')}</span>
                                                <span className="ws-action-desc">{t('websites.detail.envDesc')}</span>
                                            </span>
                                            <MorphIcon icon={ChevronRight} size={15} className="ws-action-chevron" />
                                        </button>
                                    )}

                                    {/* Editar abre el otro panel: primero se cierra este para
                                        que no se solapen dos drawers. */}
                                    <button type="button" className="ws-action-row" onClick={() => closeDetail(() => handleEdit(detailSite))}>
                                        <MorphIcon icon={Settings} size={16} />
                                        <span className="ws-action-text">
                                            <span className="ws-action-name">{t('websites.config')}</span>
                                            <span className="ws-action-desc">{t('websites.detail.configDesc')}</span>
                                        </span>
                                        <MorphIcon icon={ChevronRight} size={15} className="ws-action-chevron" />
                                    </button>

                                    <button type="button" className="ws-action-row danger" onClick={() => handleDelete(detailSite.server_id, detailSite.id)}>
                                        <MorphIcon icon={Trash2} size={16} />
                                        <span className="ws-action-text">
                                            <span className="ws-action-name">{t('websites.detail.delete')}</span>
                                            <span className="ws-action-desc">{t('websites.detail.deleteDesc')}</span>
                                        </span>
                                    </button>
                                </div>
                            </section>
                        </div>

                        <footer className="drawer-footer">
                            <span className={`ws-card-state ${detailSite.status === 'error' ? 'error' : 'online'}`}>
                                <span className="ws-server-dot" />
                                {detailSite.status === 'error' ? t('websites.state.error') : t('websites.state.active')}
                            </span>
                            <button type="button" className="btn-secondary" onClick={() => closeDetail()}>
                                {t('common.close')}
                            </button>
                        </footer>
                    </aside>
                </div>
            )}

            {showEnvModal && (
                <div className="modal-overlay">
                    <div className="env-modal">
                        <div className="env-modal-header">
                            <h3>🔍 Variables .env - {editingSite?.name}</h3>
                            <button className="btn-close" onClick={() => setShowEnvModal(false)}><MorphIcon icon={X} size={20} /></button>
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
                                        <button type="button" className="btn-delete-env" onClick={() => setEnvList(envList.filter((_, i) => i !== index))}><MorphIcon icon={X} size={16} /></button>
                                    </div>
                                ))}
                                <button type="button" className="btn-add-env" onClick={() => setEnvList([...envList, { key: '', value: '' }])}>
                                    <MorphIcon icon={Plus} size={14} /> Nueva Variable
                                </button>
                            </div>
                        </div>
                        <div className="env-modal-footer">
                            <button className="btn-secondary" onClick={() => setShowEnvModal(false)}>{t('common.cancel')}</button>
                            <button className="btn-primary" onClick={handleSaveEnv} disabled={deploying}>
                                {deploying ? t('common.saving') : t('websites.confirm.apply')}
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
                                    <><div className="db-spinner" style={{ display: 'inline-block', marginRight: '10px' }}></div> {t('websites.deployingName', { name: formData.name || t('websites.defaultProject') })}</>
                                ) : (
                                    <>✅ {t('websites.deployDone')}</>
                                )}
                            </h3>
                            {!deploying && (
                                <button className="btn-close" onClick={() => { setShowForm(false); setDeployLogs(''); }}><MorphIcon icon={X} size={20} /></button>
                            )}
                        </div>
                        <div className="site-deploy-modal-body">
                            <div className="site-deploy-terminal">
                                <div className="site-deploy-terminal-header">
                                    <span className="dot" style={{ background: '#ff5f56' }}></span>
                                    <span className="dot" style={{ background: '#ffbd2e' }}></span>
                                    <span className="dot" style={{ background: '#27c93f' }}></span>
                                    <span className="title">{t('websites.terminalTitle')}</span>
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
                        {toast.type === 'success' && <div className="icon-success"><MorphIcon icon={CheckCircle2} size={16} /></div>}
                        {toast.type === 'error' && <div className="icon-error"><MorphIcon icon={X} size={16} /></div>}
                        {toast.type === 'info' && <div className="icon-info">i</div>}
                    </div>
                    <div className="toast-message">{toast.message}</div>
                    <button className="toast-close" onClick={() => setToast(null)}><MorphIcon icon={X} size={14} /></button>
                </div>
            )}

            {/* Custom Confirm Modal */}
            {confirmDialog && (
                <div className="site-deploy-modal-overlay">
                    <div className="confirm-modal-box">
                        <h3>{t('websites.confirm.areYouSure')}</h3>
                        <p>{confirmDialog.message}</p>
                        <div className="confirm-modal-actions">
                            <button className="btn-ghost" onClick={() => setConfirmDialog(null)}>{t('common.cancel')}</button>
                            <button className="btn-primary" onClick={confirmDialog.onConfirm}>{t('websites.confirm.title')}</button>
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
                                    <MorphIcon icon={Terminal} size={16} />
                                    <span className="logs-modal-name">{logsSiteName}</span>
                                    <span className="logs-modal-sep">—</span>
                                    <span className="logs-modal-subtitle">{t('websites.logs.title')}</span>
                                </div>
                                <div className="logs-modal-actions">
                                    {site && (
                                        <button className="logs-refresh-btn" onClick={() => handleViewLogs(site.server_id, site.id, site.name)} title={t('websites.reloadLogs')}>
                                            <MorphIcon icon={RotateCcw} size={14} />
                                        </button>
                                    )}
                                    <button className="logs-close-btn" onClick={closeLogsModal}><MorphIcon icon={X} size={16} /></button>
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
                                    {t('websites.tabDiagnostic')}
                                </button>
                            </div>
                            <div className="logs-modal-body">
                                <pre className="logs-modal-pre" style={{ color: activeLogTab === 'error' ? '#ff7b72' : '#e6edf3' }}>
                                    {typeof logsContent === 'string' ? logsContent : logsContent[activeLogTab] || t('websites.logs.noContent')}
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
