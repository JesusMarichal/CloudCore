import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide';
import {
    Cloud,
    LayoutGrid,
    Server,
    Terminal,
    Settings,
    LogOut,
    Activity,
    MoreHorizontal,
    Plus,
    Search,
    ChevronDown,
    Globe,
    Database,
    Trash2,
    Menu,
    Bell,
    CheckCheck,
    Info,
    AlertTriangle,
    CircleCheck,
    XCircle,
    X,
    CreditCard
} from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import { tokenStorage } from '../../services/tokenStorage';
import './Dashboard.css';

interface AppNotification {
    id: string;
    title: string;
    message: string;
    timestamp: number;
    read: boolean;
    type: 'info' | 'success' | 'warning' | 'error';
}

const NOTIF_ICONS = {
    info:    <MorphIcon icon={Info} size={14} style={{ color: '#58a6ff' }} />,
    success: <MorphIcon icon={CircleCheck} size={14} style={{ color: '#3fb950' }} />,
    warning: <MorphIcon icon={AlertTriangle} size={14} style={{ color: '#d29922' }} />,
    error:   <MorphIcon icon={XCircle} size={14} style={{ color: '#f85149' }} />,
};

const NOTIF_STORAGE_KEY = 'cc_notifications_v1';
const MAX_NOTIFICATIONS = 50;

const loadStoredNotifications = (): AppNotification[] => {
    try {
        const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(n => n && typeof n.id === 'string' && typeof n.timestamp === 'number');
    } catch {
        return [];
    }
};

const formatRelativeTime = (ts: number): string => {
    const diff = Math.max(0, Date.now() - ts);
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'Ahora';
    const min = Math.floor(sec / 60);
    if (min < 60) return `Hace ${min} min`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `Hace ${hr} h`;
    const days = Math.floor(hr / 24);
    return `Hace ${days} d`;
};

const Dashboard = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const currentUser = tokenStorage.getUser();
    const isClient = currentUser?.role !== 'ADMIN';
    const displayName = currentUser?.name || currentUser?.email || 'Usuario';
    const avatarInitials = displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('') || '?';

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [servers, setServers] = useState<CreateServerData[]>([]);
    const [deletingServerId, setDeletingServerId] = useState<string | null>(null);
    const [stats, setStats] = useState({
        activeInstances: 0,
        cpuUsage: 0,
        networkStatus: 'Normal'
    });

    const [notifications, setNotifications] = useState<AppNotification[]>(() => loadStoredNotifications());
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
        'Notification' in window ? Notification.permission : 'denied'
    );
    const notifRef = useRef<HTMLDivElement>(null);

    const unreadCount = notifications.filter(n => !n.read).length;

    const requestBrowserPermission = async () => {
        if (!('Notification' in window)) return;
        const result = await Notification.requestPermission();
        setNotifPermission(result);
    };


    const markAllRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        if (hasSession()) serverService.markNotificationsRead().catch(() => {});
    };

    const dismiss = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
        serverService.dismissNotification(id).catch(() => {});
    };

    // Close panel when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node))
                setNotifOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const hasSession = () => !!tokenStorage.getToken();

    // IDs ya vistos — solo dispara notificación nativa para los genuinamente nuevos
    const seenNotifIds = useRef<Set<string>>(new Set(loadStoredNotifications().map(n => n.id)));

    const fetchNotifications = useCallback(async () => {
        if (!hasSession()) return;
        try {
            const res = await serverService.getNotifications();
            if (!res.success || !Array.isArray(res.notifications)) return;
            const dbNotifs: AppNotification[] = res.notifications.map((n: any) => ({
                id: String(n.id),
                type: n.type as AppNotification['type'],
                title: n.title,
                message: n.message || '',
                timestamp: Number(n.timestamp),
                read: Boolean(n.read),
            }));

            // Notificación nativa solo para las que no habíamos visto antes
            dbNotifs
                .filter(n => !n.read && !seenNotifIds.current.has(n.id))
                .forEach(n => {
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification(n.title, { body: n.message });
                    }
                });
            dbNotifs.forEach(n => seenNotifIds.current.add(n.id));

            setNotifications(prev => {
                const dbIds = new Set(dbNotifs.map(n => n.id));
                const clientOnly = prev.filter(n => !dbIds.has(n.id));
                const next = [...dbNotifs, ...clientOnly]
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, MAX_NOTIFICATIONS);
                // Evita re-render si el contenido es idéntico
                const same = next.length === prev.length && next.every((n, i) => n.id === prev[i]?.id && n.read === prev[i]?.read);
                return same ? prev : next;
            });
        } catch { /* offline */ }
    }, []);

    const loadData = async () => {
        if (!hasSession()) {
            navigate('/login');
            return;
        }

        try {
            const data = await serverService.list();
            setServers(data);

            const active = data.filter((s: any) => s.status === 'online').length;
            const avgCpu = data.length > 0
                ? Number((data.reduce((acc: number, s: any) => acc + (Number(s.cpuUsage) || 0), 0) / data.length).toFixed(2))
                : 0;

            setStats({
                activeInstances: active,
                cpuUsage: avgCpu,
                networkStatus: 'Normal'
            });
        } catch (error) {
            console.error('Error cargando datos en dashboard:', error);
        }
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 15000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    const pushNotification = useCallback((n: { type: 'info' | 'success' | 'warning' | 'error'; title: string; message: string }) => {
        const newNotif: AppNotification = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now(), read: false, ...n };
        setNotifications(prev => [newNotif, ...prev].slice(0, MAX_NOTIFICATIONS));
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(newNotif.title, { body: newNotif.message });
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifications));
        } catch { /* quota exceeded — silent */ }
    }, [notifications]);

    // Re-render every minute so relative time strings stay fresh
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 60_000);
        return () => clearInterval(id);
    }, []);

    const handleLogout = () => {
        tokenStorage.clearSession();
        navigate('/login');
    };

    const handleDeleteServer = async (serverId: string, serverName: string) => {
        if (!window.confirm(`¿Estás seguro de eliminar el servidor "${serverName}"?\n\nEsto eliminará también todos los sitios web y bases de datos asociados.`)) return;
        setDeletingServerId(serverId);
        try {
            await serverService.deleteServer(serverId);
            await loadData();
        } catch (error) {
            console.error('Error eliminando servidor:', error);
            alert('Error al eliminar el servidor.');
        } finally {
            setDeletingServerId(null);
        }
    };


    return (
        <div className="dashboard-layout">
            <div className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}></div>
            <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-logo">
                    <MorphIcon icon={Cloud} size={20} />
                    <span>CloudCore</span>
                </div>

                <nav className="nav-links">
                    <NavLink to="/dashboard" end className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                        <MorphIcon icon={LayoutGrid} size={16} />
                        <span>Resumen</span>
                    </NavLink>
                    <NavLink to="/dashboard/servers" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                        <MorphIcon icon={Server} size={16} />
                        <span>Instancias</span>
                    </NavLink>
                    <NavLink to="/dashboard/websites" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                        <MorphIcon icon={Globe} size={16} />
                        <span>Sitios Webs</span>
                    </NavLink>
                    <NavLink to="/dashboard/databases" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                        <MorphIcon icon={Database} size={16} />
                        <span>Bases de Datos</span>
                    </NavLink>
                    <NavLink to="/dashboard/terminal" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                        <MorphIcon icon={Terminal} size={16} />
                        <span>Terminal SSH</span>
                    </NavLink>
                    {isClient && (
                        <NavLink to="/dashboard/billing" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                            <MorphIcon icon={CreditCard} size={16} />
                            <span>Facturación</span>
                        </NavLink>
                    )}
                    <NavLink to="/dashboard/settings" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                        <MorphIcon icon={Settings} size={16} />
                        <span>Ajustes</span>
                    </NavLink>

                    <button onClick={handleLogout} className="nav-link logout" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                        <MorphIcon icon={LogOut} size={16} />
                        <span>Cerrar sesión</span>
                    </button>
                </nav>
            </aside>

            <main className="main-content">
                <header className="header">
                    <div className="header-left">
                        <button className="mobile-menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                            <MorphIcon icon={Menu} size={20} />
                        </button>
                        <h2>Panel de Control / {location.pathname.split('/').pop() || 'Resumen'}</h2>
                    </div>
                    <div className="user-info">
                        <div className="avatar">{avatarInitials}</div>
                        <span style={{ fontSize: '12px', fontWeight: 500 }}>{displayName}</span>

                        <div className="notif-wrapper" ref={notifRef}>
                            <button
                                className="notif-bell"
                                onClick={() => setNotifOpen(o => !o)}
                                title="Notificaciones"
                            >
                                <MorphIcon icon={Bell} size={16} />
                                {unreadCount > 0 && (
                                    <span className="notif-badge">{unreadCount}</span>
                                )}
                            </button>

                            {notifOpen && (
                                <div className="notif-panel">
                                    <div className="notif-header">
                                        <span className="notif-title">Notificaciones</span>
                                        {unreadCount > 0 && (
                                            <button className="notif-mark-read" onClick={markAllRead} title="Marcar todo como leído">
                                                <MorphIcon icon={CheckCheck} size={13} /> Todo leído
                                            </button>
                                        )}
                                    </div>

                                    {notifPermission !== 'granted' && (
                                        <div className="notif-permission-banner">
                                            <MorphIcon icon={Bell} size={13} />
                                            <span>Activa las notificaciones del navegador</span>
                                            <button onClick={requestBrowserPermission}>
                                                {notifPermission === 'denied' ? 'Bloqueado' : 'Permitir'}
                                            </button>
                                        </div>
                                    )}

                                    <div className="notif-list">
                                        {notifications.length === 0 ? (
                                            <div className="notif-empty">
                                                <MorphIcon icon={Bell} size={28} />
                                                <p>Sin notificaciones</p>
                                            </div>
                                        ) : (
                                            notifications.map(n => (
                                                <div key={n.id} className={`notif-item${n.read ? '' : ' unread'}`}>
                                                    <div className="notif-icon">{NOTIF_ICONS[n.type]}</div>
                                                    <div className="notif-body">
                                                        <p className="notif-item-title">{n.title}</p>
                                                        <p className="notif-item-msg">{n.message}</p>
                                                        <span className="notif-item-time">{formatRelativeTime(n.timestamp)}</span>
                                                    </div>
                                                    <button className="notif-dismiss" onClick={() => dismiss(n.id)} title="Descartar">
                                                        <MorphIcon icon={X} size={12} />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <div className="content-body">
                    {location.pathname === '/dashboard' && (
                        <>
                            <section className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-title">Instancias</span>
                                        <MorphIcon icon={Server} size={14} color="var(--gh-text-muted)" />
                                    </div>
                                    <div className="stat-value">{stats.activeInstances}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-title">Uso de CPU</span>
                                        <MorphIcon icon={Activity} size={14} color="var(--gh-text-muted)" />
                                    </div>
                                    <div className="stat-value">{stats.cpuUsage.toFixed(2)}%</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-title">Red</span>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3fb1ff', boxShadow: '0 0 5px #3fb1ff' }}></div>
                                    </div>
                                    <div className="stat-value" style={{ fontSize: '14px', color: '#3fb1ff' }}>Optimizada</div>
                                </div>
                            </section>

                            <div className="table-controls">
                                <div className="search-bar">
                                    <MorphIcon icon={Search} size={14} color="var(--gh-text-muted)" />
                                    <input type="text" placeholder="Buscar servidores..." />
                                </div>
                                <div className="control-group">
                                    <button className="btn-secondary">
                                        Filtros <MorphIcon icon={ChevronDown} size={12} />
                                    </button>
                                    <button className="btn-secondary">
                                        Ordenar <MorphIcon icon={ChevronDown} size={12} />
                                    </button>
                                    <button className="btn-add-server" onClick={() => navigate('/dashboard/servers')}>
                                        <MorphIcon icon={Plus} size={16} />
                                        <span>Agregar Servidor</span>
                                    </button>
                                </div>
                            </div>

                            <div className="server-container">
                                <div className="table-header">
                                    <h3>Listado de Servidores</h3>
                                    <span style={{ fontSize: '12px', color: 'var(--gh-text-muted)' }}>{servers.length} resultados</span>
                                </div>
                                <table className="server-table">
                                    <thead>
                                        <tr>
                                            <th>Nombre</th>
                                            <th>Status</th>
                                            <th>Dirección IP</th>
                                            <th style={{ textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {servers.length > 0 ? (
                                            servers.map((server, i) => (
                                                <tr key={i} style={{ opacity: deletingServerId === server.id ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                                                    <td data-label="Nombre">
                                                        <a href="#" className="server-name">{server.name}</a>
                                                    </td>
                                                    <td data-label="Status">
                                                        <span className={`status-badge ${server.status}`}>
                                                            {server.status === 'online' ? 'Online' : 'Offline'}
                                                        </span>
                                                    </td>
                                                    <td data-label="Dirección IP" className="mono">{server.ip}</td>
                                                    <td data-label="Acciones" style={{ textAlign: 'right' }}>
                                                        {deletingServerId === server.id ? (
                                                            <MorphIcon icon={Loader2} size={16} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                                                        ) : (
                                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                                                                <MorphIcon icon={MoreHorizontal} size={16} className="action-icon" style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard/servers')} />
                                                                <MorphIcon
                                                                    icon={Trash2}
                                                                    size={16}
                                                                    style={{ cursor: 'pointer', color: 'var(--gh-text-muted)', transition: 'color 0.2s' }}
                                                                    onClick={() => handleDeleteServer(server.id!, server.name)}
                                                                    onMouseEnter={e => (e.currentTarget.style.color = '#f85149')}
                                                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--gh-text-muted)')}
                                                                />
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={4}>
                                                    <div className="empty-state">
                                                        <h4>No hay servidores desplegados</h4>
                                                        <p>Empieza a construir tu infraestructura hoy mismo.</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    <Outlet context={{ pushNotification }} />
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
