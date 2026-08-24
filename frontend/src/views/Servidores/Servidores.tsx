import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Play, Square, RotateCcw, Activity, Shield, Cpu, HardDrive, Thermometer, ChevronRight, X, KeyRound, Lock, Upload, Server, Check, TriangleAlert, Terminal, Clock, Rocket, Trash2 } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { serverService } from '../../services/server.service';
import type { CreateServerData, ProvisioningStatus } from '../../services/server.service';
import { tokenStorage } from '../../services/tokenStorage';
import { useT } from '../../i18n';
import './Servidores.css';

interface ServiceInfo {
    name: string;
    status: string;
    active: boolean;
}

const Servidores: React.FC = () => {
    const navigate = useNavigate();
    const t = useT();
    const [showForm, setShowForm] = useState(false);
    const [selectedServer, setSelectedServer] = useState<CreateServerData | null>(null);
    const [services, setServices] = useState<ServiceInfo[]>([]);
    const [loadingServices, setLoadingServices] = useState(false);
    const [activeTab, setActiveTab] = useState<'stats' | 'services' | 'install'>('stats');
    const [installing, setInstalling] = useState<string | null>(null);
    const [uninstalling, setUninstalling] = useState<string | null>(null);
    const [updating, setUpdating] = useState(false);
    const [actionLogs, setActionLogs] = useState<string>('');
    const logsEndRef = useRef<HTMLDivElement>(null);
    const [metricsHistory, setMetricsHistory] = useState<Record<string, { time: string, cpu: number, ram: number }[]>>({});

    const [servers, setServers] = useState<CreateServerData[]>([]);
    // Seguimiento en vivo del aprovisionamiento (se abre solo al conectar un servidor nuevo)
    const [provServer, setProvServer] = useState<CreateServerData | null>(null);
    const [provStatus, setProvStatus] = useState<ProvisioningStatus | null>(null);
    const [showProvLog, setShowProvLog] = useState(false);
    const provLogEndRef = useRef<HTMLDivElement>(null);
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
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    // El borrado limpia recursos remotos por SSH y puede tardar más que el
    // intervalo de refresco; un ref (y no el estado) para que el setInterval,
    // que captura la primera versión de loadServers, vea el valor actual.
    const deletingIdRef = useRef<string | null>(null);

    const loadServers = async () => {
        if (!tokenStorage.getToken()) {
            navigate('/');
            return;
        }

        try {
            const data = await serverService.list();
            // No reinsertar el servidor que se está eliminando
            setServers(deletingIdRef.current
                ? data.filter((s: CreateServerData) => s.id !== deletingIdRef.current)
                : data);
        } catch (error) {
            console.error('Error cargando servidores:', error);
        }
    };

    useEffect(() => {
        loadServers();
        const interval = setInterval(loadServers, 5000);
        return () => clearInterval(interval);
    }, []);

    // Mientras el panel de aprovisionamiento esté abierto, refrescamos cada 2s
    // (más rápido que la lista general) para que el log se vea casi en vivo.
    useEffect(() => {
        if (!provServer?.id) return;
        let cancelled = false;

        const poll = async () => {
            try {
                const data = await serverService.getProvisioning(provServer.id!);
                if (!cancelled && data) setProvStatus(data);
            } catch (error) {
                console.error('Error consultando el progreso del aprovisionamiento:', error);
            }
        };

        poll();
        const id = setInterval(poll, 2000);
        return () => { cancelled = true; clearInterval(id); };
    }, [provServer?.id]);

    // Auto-scroll del log en vivo
    useEffect(() => {
        if (showProvLog) provLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [provStatus?.log, showProvLog]);

    const openProvisioning = (server: CreateServerData) => {
        setProvServer(server);
        setProvStatus(null);
        setShowProvLog(false);
    };

    const closeProvisioning = () => {
        setProvServer(null);
        setProvStatus(null);
        setShowProvLog(false);
        loadServers();
    };

    // Nombre traducido del paso: usamos la `key` estable del backend y caemos
    // al texto que envía el servidor si algún día se añade un paso sin traducir.
    const stepLabel = (key?: string | null, fallback?: string | null) => {
        if (!key) return fallback || t('servers.provisioning.preparing');
        const translated = t(`servers.provisioning.steps.${key}`);
        return translated.startsWith('servers.provisioning.steps.') ? (fallback || key) : translated;
    };

    const formatElapsed = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${m}:${String(sec).padStart(2, '0')}`;
    };

    useEffect(() => {
        setMetricsHistory(prev => {
            const next = { ...prev };
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            servers.forEach(s => {
                if (s.id) {
                    const h = next[s.id] ? [...next[s.id]] : [];
                    h.push({
                        time: now,
                        cpu: Number(s.cpuUsage) || 0,
                        ram: Number(s.ramUsage) || 0
                    });
                    if (h.length > 20) h.shift();
                    next[s.id] = h;
                }
            });
            return next;
        });
    }, [servers]);

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [actionLogs]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tokenStorage.getToken()) {
            alert(t('servers.noUser'));
            return;
        }

        setLoading(true);
        try {
            const created = await serverService.create(formData);
            setShowForm(false);
            // Abrimos el seguimiento en vivo: el aprovisionamiento tarda varios
            // minutos y el usuario debe ver qué está pasando en su servidor.
            if (created?.id) openProvisioning(created);
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
            alert(t('servers.errorPrefix') + (error as Error).message);
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

    const handleManageServer = async (server: CreateServerData) => {
        setSelectedServer(server);
        setLoadingServices(true);
        try {
            const servicesData = await serverService.getServices(server.id!);
            setServices(servicesData);
        } catch (error) {
            console.error('Error cargando servicios:', error);
        } finally {
            setLoadingServices(false);
        }
    };

    const handleServiceAction = async (serviceName: string, action: string) => {
        if (!selectedServer) return;
        setActionLoading(`${serviceName}-${action}`);
        try {
            await serverService.manageService(selectedServer.id!, serviceName, action);
            // Recargar servicios después de la acción
            const servicesData = await serverService.getServices(selectedServer.id!);
            setServices(servicesData);
        } catch (error) {
            console.error(`Error ejecutando ${action} en ${serviceName}:`, error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleInstallService = async (serviceName: string) => {
        if (!selectedServer) return;
        setInstalling(serviceName);
        setActionLogs(t('servers.startingInstall', { name: serviceName }));
        try {
            await serverService.installService(selectedServer.id!, serviceName, (chunk) => {
                setActionLogs(prev => prev + chunk);
            });
            alert(t('servers.apps.installed', { name: serviceName }));
            // Recargar servicios
            const servicesData = await serverService.getServices(selectedServer.id!);
            setServices(servicesData);
            setActiveTab('services');
        } catch (error) {
            console.error(`Error instalando ${serviceName}:`, error);
            alert(t('servers.apps.installError', { name: serviceName }));
        } finally {
            setInstalling(null);
            setActionLogs('');
        }
    };

    const handleUninstallService = async (serviceName: string) => {
        if (!selectedServer) return;
        if (!window.confirm(t('servers.apps.uninstallConfirm', { name: serviceName }))) return;
        setUninstalling(serviceName);
        setActionLogs(t('servers.startingUninstall', { name: serviceName }));
        try {
            await serverService.uninstallService(selectedServer.id!, serviceName, (chunk) => {
                setActionLogs(prev => prev + chunk);
            });
            alert(t('servers.apps.uninstalled', { name: serviceName }));
            // Recargar servicios
            const servicesData = await serverService.getServices(selectedServer.id!);
            setServices(servicesData);
        } catch (error) {
            console.error(`Error desinstalando ${serviceName}:`, error);
            alert(t('servers.apps.uninstallError', { name: serviceName }));
        } finally {
            setUninstalling(null);
            setActionLogs('');
        }
    };

    const handleUpdateSystem = async () => {
        if (!selectedServer) return;
        setUpdating(true);
        setActionLogs(t('servers.update.starting'));
        try {
            await serverService.updateSystem(selectedServer.id!, (chunk) => {
                setActionLogs(prev => prev + chunk);
            });
            alert(t('servers.update.done'));
        } catch (error) {
            console.error(`Error actualizando el sistema:`, error);
            alert(t('servers.update.error'));
        } finally {
            setUpdating(false);
            setActionLogs('');
        }
    };

    // Eliminar un servidor. El backend limpia primero los recursos remotos
    // (contenedores, sitios, Nginx) y luego borra en cascada en la base de datos,
    // así que la petición puede tardar: mantenemos la fila en estado "eliminando".
    const handleDeleteServer = async (server: CreateServerData) => {
        if (!server.id) return;
        if (!window.confirm(t('dashboard.deleteConfirm', { name: server.name }))) return;

        setDeletingId(server.id);
        deletingIdRef.current = server.id;
        try {
            await serverService.deleteServer(server.id);
            setServers(prev => prev.filter(s => s.id !== server.id));
            // Cerrar los paneles que estuvieran mostrando ese servidor
            if (selectedServer?.id === server.id) setSelectedServer(null);
            if (provServer?.id === server.id) {
                setProvServer(null);
                setProvStatus(null);
            }
            setMetricsHistory(prev => {
                const next = { ...prev };
                delete next[server.id!];
                return next;
            });
        } catch (error) {
            console.error('Error eliminando el servidor:', error);
            alert(t('dashboard.deleteError'));
        } finally {
            setDeletingId(null);
            deletingIdRef.current = null;
            loadServers();
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'online': return '#3fb950';
            case 'offline': return '#f85149';
            case 'provisioning': return '#d29922';
            default: return 'var(--gh-text-muted)';
        }
    };

    const getMetricColor = (value: number) => {
        if (value > 80) return '#f85149';
        if (value > 60) return '#d29922';
        return '#3fb950';
    };

    return (
        <div className="servidores-container">
            <div className="header-actions">
                <div>
                    <h1><MorphIcon icon={Activity} size={24} style={{ marginRight: '10px', verticalAlign: 'middle' }} /> {t('servers.title')}</h1>
                    <p className="text-muted">{t('servers.subtitle')}</p>
                </div>
                <button className="btn-primary" data-tour="add-server" onClick={() => setShowForm(true)}>
                    <span>+</span> {t('servers.newServer')}
                </button>
            </div>

            <div className="servers-list-container">
                {servers.length > 0 ? (
                    <table className="servers-table">
                        <thead>
                            <tr>
                                <th>{t('servers.table.nameIp')}</th>
                                <th>{t('servers.table.status')}</th>
                                <th><MorphIcon icon={Cpu} size={14} /> {t('servers.table.cpu')}</th>
                                <th><MorphIcon icon={Activity} size={14} /> {t('servers.table.ram')}</th>
                                <th><MorphIcon icon={HardDrive} size={14} /> {t('servers.table.disk')}</th>
                                <th><MorphIcon icon={Thermometer} size={14} /> {t('servers.table.temp')}</th>
                                <th style={{ textAlign: 'right' }}>{t('servers.table.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {servers.map(server => (
                                <tr key={server.id} className="server-row">
                                    <td data-label={t('servers.table.nameIp')} onClick={() => handleManageServer(server)} style={{ cursor: 'pointer' }}>
                                        <div className="server-main-info">
                                            <span className="server-name">{server.name} <MorphIcon icon={ChevronRight} size={12} className="chevron" /></span>
                                            <code className="server-ip-mini">{server.ip}</code>
                                        </div>
                                    </td>
                                    <td data-label="Estado">
                                        <div className="status-wrapper">
                                            <span
                                                className="status-dot"
                                                style={{ backgroundColor: getStatusColor(server.status!) }}
                                            ></span>
                                            <span className="status-badge" style={{
                                                backgroundColor: `${getStatusColor(server.status!)}15`,
                                                color: getStatusColor(server.status!),
                                                border: `1px solid ${getStatusColor(server.status!)}30`
                                            }}>
                                                {server.status}
                                            </span>
                                            {server.status === 'provisioning' && (
                                                <button
                                                    type="button"
                                                    className="provisioning-chip"
                                                    onClick={(e) => { e.stopPropagation(); openProvisioning(server); }}
                                                    title={t('servers.provisioning.viewDetail')}
                                                >
                                                    <div className="prov-chip-head">
                                                        <div className="spinner-mini"></div>
                                                        <span className="prov-chip-step">
                                                            {stepLabel(server.provisioningStepKey, server.provisioningStep)}
                                                        </span>
                                                        <span className="prov-chip-count">
                                                            {server.provisioningIndex && server.provisioningTotal
                                                                ? `${server.provisioningIndex}/${server.provisioningTotal}`
                                                                : ''}
                                                        </span>
                                                    </div>
                                                    <div className="prov-chip-bar">
                                                        <div
                                                            className="prov-chip-fill"
                                                            style={{ width: `${Math.min(100, Number(server.provisioningPercent) || 0)}%` }}
                                                        ></div>
                                                    </div>
                                                    {server.provisioningDetail && (
                                                        <span className="prov-chip-detail">{server.provisioningDetail}</span>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td data-label="CPU" className="metric-cell">
                                        <div className="mini-metric">
                                            <div className="progress-bar-mini">
                                                <div
                                                    className="progress-fill"
                                                    style={{
                                                        width: `${Number(server.cpuUsage) || 0}%`,
                                                        backgroundColor: getMetricColor(Number(server.cpuUsage) || 0)
                                                    }}
                                                ></div>
                                            </div>
                                            <span>{server.cpuUsage ? Number(server.cpuUsage).toFixed(2) : '0.00'}%</span>
                                        </div>
                                    </td>
                                    <td data-label="RAM" className="metric-cell">
                                        <div className="mini-metric">
                                            <div className="progress-bar-mini">
                                                <div
                                                    className="progress-fill"
                                                    style={{
                                                        width: `${Number(server.ramUsage) || 0}%`,
                                                        backgroundColor: getMetricColor(Number(server.ramUsage) || 0)
                                                    }}
                                                ></div>
                                            </div>
                                            <span>{server.ramUsage ? Number(server.ramUsage).toFixed(2) : '0.00'}%</span>
                                        </div>
                                    </td>
                                    <td data-label="Disco" className="metric-cell">
                                        <div className="mini-metric">
                                            <div className="progress-bar-mini">
                                                <div
                                                    className="progress-fill"
                                                    style={{
                                                        width: `${Number(server.diskUsage) || 0}%`,
                                                        backgroundColor: getMetricColor(Number(server.diskUsage) || 0)
                                                    }}
                                                ></div>
                                            </div>
                                            <span>{server.diskUsage ? Math.round(Number(server.diskUsage)) : 0}%</span>
                                        </div>
                                    </td>
                                    <td data-label="Temp">
                                        <span className="temp-badge">
                                            {(server.temp !== null && server.temp !== undefined) ? `${Number(server.temp).toFixed(1)}°C` : 'N/A'}
                                        </span>
                                    </td>
                                    <td data-label="Acciones">
                                        <div className="server-actions-list">
                                            <button
                                                className="btn-icon refresh-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const btn = e.currentTarget;
                                                    btn.classList.add('spinning');
                                                    handleRefresh(server.id!).finally(() => {
                                                        btn.classList.remove('spinning');
                                                    });
                                                }}
                                                title={t('servers.refreshMetrics')}
                                            >
                                                <MorphIcon icon={RefreshCw} size={14} />
                                            </button>
                                            <button className="btn-secondary btn-sm" onClick={() => handleManageServer(server)}>{t('servers.manage')}</button>
                                            <button
                                                className="btn-icon delete-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteServer(server);
                                                }}
                                                disabled={deletingId === server.id}
                                                title={t('servers.deleteServer')}
                                                aria-label={t('servers.deleteServer')}
                                            >
                                                {deletingId === server.id
                                                    ? <div className="spinner-mini"></div>
                                                    : <MorphIcon icon={Trash2} size={14} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : !loading && (
                    <div className="empty-state-list">
                        <div className="empty-icon">☁️</div>
                        <h3>{t('servers.empty')}</h3>
                        <p>{t('servers.emptyDesc')}</p>
                    </div>
                )}
            </div>

            {/* Seguimiento en vivo del aprovisionamiento */}
            {provServer && (() => {
                const steps = provStatus?.steps || [];
                const total = provStatus?.total || steps.length || 0;
                const current = provStatus?.index || 0;
                const percent = Math.min(100, provStatus?.percent ?? 0);
                const failed = provStatus?.stepKey === 'error' || provStatus?.status === 'offline';
                const finished = provStatus?.status === 'online' || provStatus?.stepKey === 'done';
                const logLines = (provStatus?.log || '').split('\n').filter(Boolean);

                return (
                    <div className="modal-overlay" onClick={closeProvisioning}>
                        <div className="provisioning-card" onClick={(e) => e.stopPropagation()}>
                            <div className="prov-header">
                                <div className="prov-header-main">
                                    <div className={`prov-header-icon ${failed ? 'failed' : finished ? 'done' : ''}`}>
                                        <MorphIcon icon={failed ? TriangleAlert : finished ? Check : Rocket} size={18} />
                                    </div>
                                    <div>
                                        <h2>
                                            {failed
                                                ? t('servers.provisioning.failedTitle')
                                                : finished
                                                    ? t('servers.provisioning.doneTitle')
                                                    : t('servers.provisioning.title', { name: provServer.name })}
                                        </h2>
                                        <p className="text-muted">
                                            {failed
                                                ? t('servers.provisioning.failedDesc')
                                                : finished
                                                    ? t('servers.provisioning.doneDesc', { name: provServer.name })
                                                    : t('servers.provisioning.subtitle')}
                                        </p>
                                    </div>
                                </div>
                                <button className="btn-close" onClick={closeProvisioning}>
                                    <MorphIcon icon={X} size={18} />
                                </button>
                            </div>

                            <div className="prov-summary">
                                <div className="prov-summary-top">
                                    <span className="prov-percent">{percent}%</span>
                                    <span className="prov-elapsed">
                                        <MorphIcon icon={Clock} size={12} />
                                        {formatElapsed(provStatus?.elapsedSeconds || 0)}
                                    </span>
                                </div>
                                <div className="prov-bar">
                                    <div
                                        className={`prov-bar-fill ${failed ? 'failed' : finished ? 'done' : 'running'}`}
                                        style={{ width: `${percent}%` }}
                                    ></div>
                                </div>
                                <div className="prov-current">
                                    {!failed && !finished && <div className="spinner-mini"></div>}
                                    <span>{stepLabel(provStatus?.stepKey, provStatus?.step)}</span>
                                    {total > 0 && !finished && !failed && (
                                        <span className="prov-current-count">
                                            {t('servers.provisioning.stepOf', { current: String(current), total: String(total) })}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="prov-steps">
                                {steps.map((st, i) => {
                                    const state = failed && i === current - 1
                                        ? 'failed'
                                        : (finished || i < current - 1)
                                            ? 'done'
                                            : i === current - 1
                                                ? 'running'
                                                : 'pending';
                                    return (
                                        <div key={st.key} className={`prov-step ${state}`}>
                                            <div className="prov-step-marker">
                                                {state === 'done' && <MorphIcon icon={Check} size={12} />}
                                                {state === 'running' && <div className="spinner-mini"></div>}
                                                {state === 'failed' && <MorphIcon icon={TriangleAlert} size={12} />}
                                            </div>
                                            <span className="prov-step-name">{stepLabel(st.key, st.name)}</span>
                                            {state === 'running' && provStatus?.detail && (
                                                <span className="prov-step-detail">{provStatus.detail}</span>
                                            )}
                                        </div>
                                    );
                                })}
                                {steps.length === 0 && (
                                    <div className="prov-step running">
                                        <div className="prov-step-marker"><div className="spinner-mini"></div></div>
                                        <span className="prov-step-name">{t('servers.provisioning.connecting')}</span>
                                    </div>
                                )}
                            </div>

                            <div className="prov-log-section">
                                <button
                                    type="button"
                                    className="prov-log-toggle"
                                    onClick={() => setShowProvLog(v => !v)}
                                >
                                    <MorphIcon icon={Terminal} size={13} />
                                    {showProvLog ? t('servers.provisioning.hideLog') : t('servers.provisioning.showLog')}
                                    <MorphIcon icon={ChevronRight} size={12} className={showProvLog ? 'chevron open' : 'chevron'} />
                                </button>
                                {showProvLog && (
                                    <pre className="prov-log mono">
                                        {logLines.length > 0 ? logLines.join('\n') : t('servers.provisioning.noLogYet')}
                                        <div ref={provLogEndRef} />
                                    </pre>
                                )}
                            </div>

                            <div className="prov-footer">
                                <p className="prov-hint">
                                    {failed
                                        ? provStatus?.detail
                                        : finished
                                            ? t('servers.provisioning.doneHint')
                                            : t('servers.provisioning.backgroundHint')}
                                </p>
                                <button className={finished ? 'btn-primary' : 'btn-secondary'} onClick={closeProvisioning}>
                                    {finished || failed ? t('servers.provisioning.close') : t('servers.provisioning.background')}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Panel de Gestión de Servicios */}
            {selectedServer && (
                <div className="modal-overlay">
                    <div className="server-detail-card">
                        <div className="detail-header">
                            <div>
                                <h2><MorphIcon icon={Shield} size={20} className="icon-blue" /> {t('servers.manageOf', { name: selectedServer.name })}</h2>
                                <p className="text-muted">{selectedServer.ip}</p>
                            </div>
                            <button className="btn-close" onClick={() => setSelectedServer(null)}>
                                <MorphIcon icon={X} size={20} />
                            </button>
                        </div>

                        <div className="detail-tabs">
                            <div
                                className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
                                onClick={() => setActiveTab('stats')}
                            >
                                {t('servers.tabStats')}
                            </div>
                            <div
                                className={`tab ${activeTab === 'services' ? 'active' : ''}`}
                                onClick={() => setActiveTab('services')}
                            >
                                {t('servers.tabServices')}
                            </div>
                            <div
                                className={`tab ${activeTab === 'install' ? 'active' : ''}`}
                                onClick={() => setActiveTab('install')}
                            >
                                {t('servers.tabInstaller')}
                            </div>
                        </div>

                        <div className="services-list">
                            {activeTab === 'stats' && (
                                <div className="stats-section">
                                    <div className="stats-grid">
                                        <div className="stat-card">
                                            <div className="stat-header">
                                                <h4><MorphIcon icon={Cpu} size={16} /> {t('servers.metrics.cpuUsage')}</h4>
                                                <div className="stat-value-mini">{Number(selectedServer.cpuUsage || 0).toFixed(2)}%</div>
                                            </div>
                                            <div className="chart-container">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={metricsHistory[selectedServer.id!] || []}>
                                                        <defs>
                                                            <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#00B7B5" stopOpacity={0.3}/>
                                                                <stop offset="95%" stopColor="#00B7B5" stopOpacity={0}/>
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                                        <XAxis dataKey="time" hide />
                                                        <YAxis stroke="var(--text-muted)" fontSize={10} tickFormatter={(v) => `${v}%`} domain={[0, 100]} width={35} />
                                                        <Tooltip 
                                                            contentStyle={{ background: '#161b22', border: '1px solid var(--gh-border)', borderRadius: '8px', fontSize: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                                                            itemStyle={{ color: '#00B7B5', fontWeight: 600 }}
                                                            labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                                                        />
                                                        <Area type="monotone" dataKey="cpu" name="CPU" stroke="#00B7B5" strokeWidth={3} fillOpacity={1} fill="url(#colorCpu)" isAnimationActive={false} />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                        <div className="stat-card">
                                            <div className="stat-header">
                                                <h4><MorphIcon icon={Activity} size={16} /> {t('servers.metrics.ramUsage')}</h4>
                                                <div className="stat-value-mini">{Number(selectedServer.ramUsage || 0).toFixed(2)}%</div>
                                            </div>
                                            <div className="chart-container">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={metricsHistory[selectedServer.id!] || []}>
                                                        <defs>
                                                            <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#3fb950" stopOpacity={0.3}/>
                                                                <stop offset="95%" stopColor="#3fb950" stopOpacity={0}/>
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                                        <XAxis dataKey="time" hide />
                                                        <YAxis stroke="var(--text-muted)" fontSize={10} tickFormatter={(v) => `${v}%`} domain={[0, 100]} width={35} />
                                                        <Tooltip 
                                                            contentStyle={{ background: '#161b22', border: '1px solid var(--gh-border)', borderRadius: '8px', fontSize: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                                                            itemStyle={{ color: '#3fb950', fontWeight: 600 }}
                                                            labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                                                        />
                                                        <Area type="monotone" dataKey="ram" name="RAM" stroke="#3fb950" strokeWidth={3} fillOpacity={1} fill="url(#colorRam)" isAnimationActive={false} />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="stats-row">
                                        <div className="stat-box">
                                            <div className="stat-box-icon"><MorphIcon icon={HardDrive} size={20} className="icon-blue" /></div>
                                            <div className="stat-box-content">
                                                <span className="stat-label">{t('servers.metrics.diskUsage')}</span>
                                                <span className="stat-number">{Number(selectedServer.diskUsage || 0).toFixed(1)}%</span>
                                                <div className="stat-progress">
                                                    <div className="stat-progress-fill" style={{ width: `${Number(selectedServer.diskUsage || 0)}%`, backgroundColor: getMetricColor(Number(selectedServer.diskUsage || 0)) }}></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="stat-box">
                                            <div className="stat-box-icon"><MorphIcon icon={Thermometer} size={20} className={selectedServer.temp && selectedServer.temp > 70 ? 'icon-red' : 'icon-green'} style={{ color: selectedServer.temp && selectedServer.temp > 70 ? '#f85149' : '#3fb950' }} /></div>
                                            <div className="stat-box-content">
                                                <span className="stat-label">{t('servers.metrics.cpuTemp')}</span>
                                                <span className="stat-number">{selectedServer.temp ? `${Number(selectedServer.temp).toFixed(1)}°C` : 'N/A'}</span>
                                                <div className="stat-progress">
                                                    <div className="stat-progress-fill" style={{ width: `${selectedServer.temp ? Math.min(100, (selectedServer.temp / 100) * 100) : 0}%`, backgroundColor: selectedServer.temp && selectedServer.temp > 70 ? '#f85149' : '#3fb950' }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'services' && (
                                loadingServices ? (
                                    <div className="loading-state">
                                        <div className="spinner"></div>
                                        <p>{t('servers.services.loading')}</p>
                                    </div>
                                ) : services.length > 0 ? (
                                    <table className="services-table">
                                        <thead>
                                            <tr>
                                                <th>{t('servers.services.service')}</th>
                                                <th>{t('servers.services.status')}</th>
                                                <th style={{ textAlign: 'right' }}>{t('servers.table.actions')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {services.map(svc => (
                                                <tr key={svc.name}>
                                                    <td>
                                                        <div className="service-info">
                                                            <span className="service-name">{svc.name}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="service-status-cell">
                                                            <span
                                                                className="status-indicator-dot"
                                                                style={{ backgroundColor: svc.status === 'active' ? '#3fb950' : '#f85149' }}
                                                            ></span>
                                                            <span className={`service-status ${svc.status}`}>
                                                                {svc.status}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="service-actions">
                                                            {svc.status !== 'active' ? (
                                                                <button
                                                                    className="btn-action start"
                                                                    onClick={() => handleServiceAction(svc.name, 'start')}
                                                                    disabled={actionLoading === `${svc.name}-start`}
                                                                >
                                                                    <MorphIcon icon={Play} size={14} />
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    className="btn-action stop"
                                                                    onClick={() => handleServiceAction(svc.name, 'stop')}
                                                                    disabled={actionLoading === `${svc.name}-stop`}
                                                                >
                                                                    <MorphIcon icon={Square} size={14} />
                                                                </button>
                                                            )}
                                                            <button
                                                                className="btn-action restart"
                                                                onClick={() => handleServiceAction(svc.name, 'restart')}
                                                                disabled={actionLoading === `${svc.name}-restart`}
                                                            >
                                                                <MorphIcon icon={RotateCcw} size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <p className="empty-services">{t('servers.services.none')}</p>
                                )
                            )}

                            {activeTab === 'install' && (
                                <div className="install-section">
                                    <div className="update-system-box" style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--gh-border)' }}>
                                        <div>
                                            <h3 style={{ margin: '0 0 5px 0', fontSize: '15px' }}>{t('servers.update.title')}</h3>
                                            <p className="text-muted" style={{ margin: 0, fontSize: '13px' }}>{t('servers.update.desc')}</p>
                                        </div>
                                        <button
                                            className="btn-secondary"
                                            onClick={handleUpdateSystem}
                                            disabled={updating || installing !== null || uninstalling !== null}
                                        >
                                            {updating ? t('servers.update.updating') : t('servers.update.button')}
                                        </button>
                                    </div>

                                    <h3 style={{ fontSize: '14px', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '15px' }}>{t('servers.apps.catalog')}</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                        {[
                                            { name: 'Nginx', desc: t('servers.apps.desc.nginx') },
                                            { name: 'NodeJS', desc: t('servers.apps.desc.nodejs') },
                                            { name: 'PM2', desc: t('servers.apps.desc.pm2') },
                                            { name: 'Docker', desc: t('servers.apps.desc.docker') },
                                            { name: 'MySQL', desc: t('servers.apps.desc.mysql') },
                                            { name: 'PostgreSQL', desc: t('servers.apps.desc.postgresql') },
                                            { name: 'Redis', desc: t('servers.apps.desc.redis') },
                                        ].map(app => {
                                            const isInstalled = services.some(s => s.name.toLowerCase() === app.name.toLowerCase());
                                            return (
                                                <div key={app.name} style={{ background: 'var(--card-bg)', border: '1px solid var(--gh-border)', padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    <div>
                                                        <h4 style={{ margin: '0 0 4px', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            {app.name}
                                                            {isInstalled && (
                                                                <span style={{ fontSize: '10px', background: 'rgba(63, 185, 80, 0.1)', color: '#3fb950', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                                                                    INSTALADO
                                                                </span>
                                                            )}
                                                        </h4>
                                                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{app.desc}</p>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                                                        {!isInstalled ? (
                                                            <button
                                                                className="btn-primary btn-sm"
                                                                style={{ width: 'fit-content' }}
                                                                onClick={() => handleInstallService(app.name)}
                                                                disabled={installing !== null || uninstalling !== null || updating}
                                                            >
                                                                {installing === app.name ? t('servers.apps.installing') : t('servers.apps.install')}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className="btn-secondary btn-sm"
                                                                style={{ width: 'fit-content', borderColor: 'rgba(248, 81, 73, 0.3)', color: '#f85149' }}
                                                                onClick={() => handleUninstallService(app.name)}
                                                                disabled={installing !== null || uninstalling !== null || updating}
                                                            >
                                                                {uninstalling === app.name ? t('servers.apps.uninstalling') : t('servers.apps.uninstall')}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {(installing || updating || uninstalling) && (
                                        <div className="action-logs-container" style={{ marginTop: '20px', background: '#0d1117', border: '1px solid var(--gh-border)', borderRadius: '12px', padding: '16px', height: '250px', overflowY: 'auto' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div className="spinner-mini"></div>
                                                    {installing ? t('servers.apps.installing') : uninstalling ? t('servers.apps.uninstalling') : t('servers.update.inProgress')}
                                                </h4>
                                            </div>
                                            <pre className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                                {actionLogs}
                                                <div ref={logsEndRef} />
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="server-form-card" onClick={(e) => e.stopPropagation()}>
                        <div className="server-form-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div className="server-engine-icon" style={{ width: '32px', height: '32px', borderRadius: '4px' }}>
                                    <MorphIcon icon={Server} size={16} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>{t('servers.addServer')}</h3>
                                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>{t('servers.connectVps')}</p>
                                </div>
                            </div>
                            <button type="button" className="btn-close" onClick={() => setShowForm(false)}>
                                <MorphIcon icon={X} size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="server-form-body">
                            <div className="server-conn-grid">
                                <div className="form-group">
                                    <label>{t('servers.form.serverName')}</label>
                                    <input
                                        type="text"
                                        placeholder={t('servers.form.serverNamePlaceholder')}
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{t('servers.form.ipOrHost')}</label>
                                    <input
                                        type="text"
                                        placeholder={t('servers.form.ipPlaceholder')}
                                        value={formData.ip}
                                        onChange={e => setFormData({ ...formData, ip: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{t('servers.form.sshPort')}</label>
                                    <input
                                        type="number"
                                        value={formData.sshPort}
                                        onChange={e => setFormData({ ...formData, sshPort: parseInt(e.target.value) })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{t('servers.form.sshUser')}</label>
                                    <input
                                        type="text"
                                        placeholder="root"
                                        value={formData.sshUser}
                                        onChange={e => setFormData({ ...formData, sshUser: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group full-width">
                                    <label>{t('servers.form.authMethod')}</label>
                                    <div className="auth-toggle">
                                        <div
                                            className={`auth-toggle-option ${formData.authType === 'key' ? 'active' : ''}`}
                                            onClick={() => setFormData({ ...formData, authType: 'key' })}
                                        >
                                            <MorphIcon icon={KeyRound} size={14} />
                                            <span>{t('servers.form.privateKey')}</span>
                                        </div>
                                        <div
                                            className={`auth-toggle-option ${formData.authType === 'password' ? 'active' : ''}`}
                                            onClick={() => setFormData({ ...formData, authType: 'password' })}
                                        >
                                            <MorphIcon icon={Lock} size={14} />
                                            <span>{t('servers.form.password')}</span>
                                        </div>
                                    </div>
                                </div>

                                {formData.authType === 'key' ? (
                                    <div className="form-group full-width">
                                        <div className="label-with-action">
                                            <label>{t('servers.form.privateKey')}</label>
                                            <label className="file-upload-link">
                                                <MorphIcon icon={Upload} size={12} /> Cargar .pem
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
                                            rows={2}
                                            style={{ resize: 'none' }}
                                            placeholder={t('servers.form.privateKeyPlaceholder')}
                                            className="mono"
                                            value={formData.privateKey}
                                            onChange={e => setFormData({ ...formData, privateKey: e.target.value })}
                                            required
                                        />
                                    </div>
                                ) : (
                                    <div className="form-group full-width">
                                        <label>{t('servers.form.password')}</label>
                                        <input
                                            type="password"
                                            placeholder="••••••••"
                                            value={formData.password}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                            required
                                        />
                                    </div>
                                )}
                            </div>
                        </form>
                        <div className="server-form-footer">
                            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                                Cancelar
                            </button>
                            <button type="button" className="btn-primary" onClick={handleSubmit} disabled={loading}>
                                {loading ? t('servers.form.connecting') : t('servers.form.connectServer')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Servidores;
