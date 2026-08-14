import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Play, Square, RotateCcw, Activity, Shield, Cpu, HardDrive, Thermometer, ChevronRight, X, Plus, KeyRound, Lock, Upload, Server } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import { tokenStorage } from '../../services/tokenStorage';
import './Servidores.css';

interface ServiceInfo {
    name: string;
    status: string;
    active: boolean;
}

const Servidores: React.FC = () => {
    const navigate = useNavigate();
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

    const loadServers = async () => {
        if (!tokenStorage.getToken()) {
            navigate('/');
            return;
        }

        try {
            const data = await serverService.list();
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
            alert('Error: No se encontró el usuario logueado');
            return;
        }

        setLoading(true);
        try {
            await serverService.create(formData);
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
        setActionLogs(`Iniciando instalación de ${serviceName}...\n`);
        try {
            await serverService.installService(selectedServer.id!, serviceName, (chunk) => {
                setActionLogs(prev => prev + chunk);
            });
            alert(`${serviceName} instalado correctamente.`);
            // Recargar servicios
            const servicesData = await serverService.getServices(selectedServer.id!);
            setServices(servicesData);
            setActiveTab('services');
        } catch (error) {
            console.error(`Error instalando ${serviceName}:`, error);
            alert(`Error al instalar ${serviceName}`);
        } finally {
            setInstalling(null);
            setActionLogs('');
        }
    };

    const handleUninstallService = async (serviceName: string) => {
        if (!selectedServer) return;
        if (!window.confirm(`¿Estás seguro de que quieres desinstalar ${serviceName}?`)) return;
        setUninstalling(serviceName);
        setActionLogs(`Iniciando desinstalación de ${serviceName}...\n`);
        try {
            await serverService.uninstallService(selectedServer.id!, serviceName, (chunk) => {
                setActionLogs(prev => prev + chunk);
            });
            alert(`${serviceName} desinstalado correctamente.`);
            // Recargar servicios
            const servicesData = await serverService.getServices(selectedServer.id!);
            setServices(servicesData);
        } catch (error) {
            console.error(`Error desinstalando ${serviceName}:`, error);
            alert(`Error al desinstalar ${serviceName}`);
        } finally {
            setUninstalling(null);
            setActionLogs('');
        }
    };

    const handleUpdateSystem = async () => {
        if (!selectedServer) return;
        setUpdating(true);
        setActionLogs('Iniciando actualización del sistema...\n');
        try {
            await serverService.updateSystem(selectedServer.id!, (chunk) => {
                setActionLogs(prev => prev + chunk);
            });
            alert(`Sistema actualizado correctamente.`);
        } catch (error) {
            console.error(`Error actualizando el sistema:`, error);
            alert(`Error al actualizar el sistema`);
        } finally {
            setUpdating(false);
            setActionLogs('');
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
                    <h1><MorphIcon icon={Activity} size={24} style={{ marginRight: '10px', verticalAlign: 'middle' }} /> Mis Servidores</h1>
                    <p className="text-muted">Gestiona y monitorea tu infraestructura en tiempo real</p>
                </div>
                <button className="btn-primary" onClick={() => setShowForm(true)}>
                    <span>+</span> Nuevo Servidor
                </button>
            </div>

            <div className="servers-list-container">
                {servers.length > 0 ? (
                    <table className="servers-table">
                        <thead>
                            <tr>
                                <th>Nombre / IP</th>
                                <th>Estado</th>
                                <th><MorphIcon icon={Cpu} size={14} /> CPU</th>
                                <th><MorphIcon icon={Activity} size={14} /> RAM</th>
                                <th><MorphIcon icon={HardDrive} size={14} /> Disco</th>
                                <th><MorphIcon icon={Thermometer} size={14} /> Temp</th>
                                <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {servers.map(server => (
                                <tr key={server.id} className="server-row">
                                    <td data-label="Nombre / IP" onClick={() => handleManageServer(server)} style={{ cursor: 'pointer' }}>
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
                                                <div className="provisioning-mini-status">
                                                    <div className="spinner-mini"></div>
                                                    <span>{server.provisioningStep || 'Procesando...'}</span>
                                                </div>
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
                                                title="Refrescar métricas"
                                            >
                                                <MorphIcon icon={RefreshCw} size={14} />
                                            </button>
                                            <button className="btn-secondary btn-sm" onClick={() => handleManageServer(server)}>Gestionar</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : !loading && (
                    <div className="empty-state-list">
                        <div className="empty-icon">☁️</div>
                        <h3>No hay servidores conectados</h3>
                        <p>Agrega tu primer servidor VPS (AWS, Azure, DigitalOcean) para gestionar tu infraestructura de forma centralizada.</p>
                        <button className="btn-primary" onClick={() => setShowForm(true)}>
                            <MorphIcon icon={Plus} size={16} /> Conectar mi primer Servidor
                        </button>
                    </div>
                )}
            </div>

            {/* Panel de Gestión de Servicios */}
            {selectedServer && (
                <div className="modal-overlay">
                    <div className="server-detail-card">
                        <div className="detail-header">
                            <div>
                                <h2><MorphIcon icon={Shield} size={20} className="icon-blue" /> Gestión de: {selectedServer.name}</h2>
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
                                Estadísticas
                            </div>
                            <div
                                className={`tab ${activeTab === 'services' ? 'active' : ''}`}
                                onClick={() => setActiveTab('services')}
                            >
                                Servicios del Sistema
                            </div>
                            <div
                                className={`tab ${activeTab === 'install' ? 'active' : ''}`}
                                onClick={() => setActiveTab('install')}
                            >
                                Instalador de Aplicaciones
                            </div>
                        </div>

                        <div className="services-list">
                            {activeTab === 'stats' && (
                                <div className="stats-section">
                                    <div className="stats-grid">
                                        <div className="stat-card">
                                            <div className="stat-header">
                                                <h4><MorphIcon icon={Cpu} size={16} /> Uso de CPU</h4>
                                                <div className="stat-value-mini">{Number(selectedServer.cpuUsage || 0).toFixed(2)}%</div>
                                            </div>
                                            <div className="chart-container">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={metricsHistory[selectedServer.id!] || []}>
                                                        <defs>
                                                            <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#58a6ff" stopOpacity={0.3}/>
                                                                <stop offset="95%" stopColor="#58a6ff" stopOpacity={0}/>
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                                        <XAxis dataKey="time" hide />
                                                        <YAxis stroke="var(--text-muted)" fontSize={10} tickFormatter={(v) => `${v}%`} domain={[0, 100]} width={35} />
                                                        <Tooltip 
                                                            contentStyle={{ background: '#161b22', border: '1px solid var(--gh-border)', borderRadius: '8px', fontSize: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                                                            itemStyle={{ color: '#58a6ff', fontWeight: 600 }}
                                                            labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                                                        />
                                                        <Area type="monotone" dataKey="cpu" name="CPU" stroke="#58a6ff" strokeWidth={3} fillOpacity={1} fill="url(#colorCpu)" isAnimationActive={false} />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                        <div className="stat-card">
                                            <div className="stat-header">
                                                <h4><MorphIcon icon={Activity} size={16} /> Uso de RAM</h4>
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
                                                <span className="stat-label">Almacenamiento (Disco)</span>
                                                <span className="stat-number">{Number(selectedServer.diskUsage || 0).toFixed(1)}%</span>
                                                <div className="stat-progress">
                                                    <div className="stat-progress-fill" style={{ width: `${Number(selectedServer.diskUsage || 0)}%`, backgroundColor: getMetricColor(Number(selectedServer.diskUsage || 0)) }}></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="stat-box">
                                            <div className="stat-box-icon"><MorphIcon icon={Thermometer} size={20} className={selectedServer.temp && selectedServer.temp > 70 ? 'icon-red' : 'icon-green'} style={{ color: selectedServer.temp && selectedServer.temp > 70 ? '#f85149' : '#3fb950' }} /></div>
                                            <div className="stat-box-content">
                                                <span className="stat-label">Temperatura del CPU</span>
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
                                        <p>Cargando servicios vía SSH...</p>
                                    </div>
                                ) : services.length > 0 ? (
                                    <table className="services-table">
                                        <thead>
                                            <tr>
                                                <th>Servicio</th>
                                                <th>Estado</th>
                                                <th style={{ textAlign: 'right' }}>Acciones</th>
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
                                    <p className="empty-services">No se encontraron servicios activos.</p>
                                )
                            )}

                            {activeTab === 'install' && (
                                <div className="install-section">
                                    <div className="update-system-box" style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--gh-border)' }}>
                                        <div>
                                            <h3 style={{ margin: '0 0 5px 0', fontSize: '15px' }}>Actualizar Sistema Base</h3>
                                            <p className="text-muted" style={{ margin: 0, fontSize: '13px' }}>Ejecutar update & upgrade para tener los paquetes al día.</p>
                                        </div>
                                        <button
                                            className="btn-secondary"
                                            onClick={handleUpdateSystem}
                                            disabled={updating || installing !== null || uninstalling !== null}
                                        >
                                            {updating ? 'Actualizando...' : 'Actualizar Servidor'}
                                        </button>
                                    </div>

                                    <h3 style={{ fontSize: '14px', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '15px' }}>Catálogo de Aplicaciones</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                        {[
                                            { name: 'Nginx', desc: 'Servidor Web / Reverse Proxy' },
                                            { name: 'NodeJS', desc: 'Entorno de ejecución de JS' },
                                            { name: 'PM2', desc: 'Gestor de procesos para Node' },
                                            { name: 'Docker', desc: 'Plataforma para contenedores' },
                                            { name: 'MySQL', desc: 'Sistema de Base de Datos' },
                                            { name: 'PostgreSQL', desc: 'Sistema de Base de Datos Open Source' },
                                            { name: 'Redis', desc: 'Almacén de estructura de datos en memoria' },
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
                                                                {installing === app.name ? 'Instalando...' : 'Instalar'}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className="btn-secondary btn-sm"
                                                                style={{ width: 'fit-content', borderColor: 'rgba(248, 81, 73, 0.3)', color: '#f85149' }}
                                                                onClick={() => handleUninstallService(app.name)}
                                                                disabled={installing !== null || uninstalling !== null || updating}
                                                            >
                                                                {uninstalling === app.name ? 'Desinstalando...' : 'Desinstalar'}
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
                                                    {installing ? `Instalando ${installing}...` : uninstalling ? `Desinstalando ${uninstalling}...` : 'Actualizando Sistema...'}
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
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>Agregar Servidor</h3>
                                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>Conecta un VPS a la plataforma</p>
                                </div>
                            </div>
                            <button type="button" className="btn-close" onClick={() => setShowForm(false)}>
                                <MorphIcon icon={X} size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="server-form-body">
                            <div className="server-conn-grid">
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
                                        placeholder="1.2.3.4 o ec2-52-15..."
                                        value={formData.ip}
                                        onChange={e => setFormData({ ...formData, ip: e.target.value })}
                                        required
                                    />
                                </div>
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
                                        placeholder="root"
                                        value={formData.sshUser}
                                        onChange={e => setFormData({ ...formData, sshUser: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group full-width">
                                    <label>Método de Autenticación</label>
                                    <div className="auth-toggle">
                                        <div
                                            className={`auth-toggle-option ${formData.authType === 'key' ? 'active' : ''}`}
                                            onClick={() => setFormData({ ...formData, authType: 'key' })}
                                        >
                                            <MorphIcon icon={KeyRound} size={14} />
                                            <span>Private Key</span>
                                        </div>
                                        <div
                                            className={`auth-toggle-option ${formData.authType === 'password' ? 'active' : ''}`}
                                            onClick={() => setFormData({ ...formData, authType: 'password' })}
                                        >
                                            <MorphIcon icon={Lock} size={14} />
                                            <span>Password</span>
                                        </div>
                                    </div>
                                </div>

                                {formData.authType === 'key' ? (
                                    <div className="form-group full-width">
                                        <div className="label-with-action">
                                            <label>Private Key</label>
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
                                            placeholder="-----BEGIN RSA PRIVATE KEY-----..."
                                            className="mono"
                                            value={formData.privateKey}
                                            onChange={e => setFormData({ ...formData, privateKey: e.target.value })}
                                            required
                                        />
                                    </div>
                                ) : (
                                    <div className="form-group full-width">
                                        <label>Password</label>
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
                                {loading ? 'Conectando...' : 'Conectar Servidor'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Servidores;
