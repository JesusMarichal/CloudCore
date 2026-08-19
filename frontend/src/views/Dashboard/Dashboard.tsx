import { useState, useEffect, useRef, useCallback } from 'react';
import {
    LayoutGrid,
    Server,
    Terminal,
    Settings,
    Search,
    ChevronDown,
    ChevronRight,
    ChevronLeft,
    Globe,
    Database,
    Menu,
    Bell,
    CheckCheck,
    Info,
    AlertTriangle,
    CircleCheck,
    XCircle,
    X,
    CreditCard,
    Sun,
    Moon
} from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import { tokenStorage } from '../../services/tokenStorage';
import { getAvatarUrl } from '../../data/avatars';
import { AuthService } from '../../services/auth.service';
import CoreBotTour from '../../components/CoreBotTour';
import corebotHead from '../../assets/corebot-head.png';
import { useT } from '../../i18n';
import type { TranslateFn } from '../../i18n';
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
    info:    <MorphIcon icon={Info} size={14} style={{ color: '#00B7B5' }} />,
    success: <MorphIcon icon={CircleCheck} size={14} style={{ color: '#3fb950' }} />,
    warning: <MorphIcon icon={AlertTriangle} size={14} style={{ color: '#d29922' }} />,
    error:   <MorphIcon icon={XCircle} size={14} style={{ color: '#f85149' }} />,
};

const THEME_STORAGE_KEY = 'cc_dashboard_theme';
const SIDEBAR_STORAGE_KEY = 'cc_sidebar_collapsed';

const loadStoredCollapsed = (): boolean =>
    localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';

// Igual que en el Login: arranca en claro (blanco) salvo que el usuario
// haya elegido el modo oscuro antes.
const loadStoredTheme = (): 'light' | 'dark' =>
    localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';

const SECTION_KEYS: Record<string, string> = {
    dashboard: 'nav.overview',
    servers: 'nav.servers',
    websites: 'nav.websites',
    databases: 'nav.databases',
    terminal: 'nav.terminal',
    billing: 'nav.billing',
    settings: 'nav.settings',
    profile: 'nav.profile',
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

const formatRelativeTime = (ts: number, t: TranslateFn): string => {
    const diff = Math.max(0, Date.now() - ts);
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return t('notifications.time.now');
    const min = Math.floor(sec / 60);
    if (min < 60) return t('notifications.time.minutes', { count: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return t('notifications.time.hours', { count: hr });
    const days = Math.floor(hr / 24);
    return t('notifications.time.days', { count: days });
};

const Dashboard = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const t = useT();

    const [currentUser, setCurrentUser] = useState(() => tokenStorage.getUser());

    // El perfil avisa cuando cambia la foto para refrescar el encabezado.
    useEffect(() => {
        const sync = () => setCurrentUser(tokenStorage.getUser());
        window.addEventListener('cc-user-updated', sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener('cc-user-updated', sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    const isClient = currentUser?.role !== 'ADMIN';
    const displayName = currentUser?.name || currentUser?.email || t('common.user');
    const avatarInitials = displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('') || '?';
    const avatarUrl = getAvatarUrl(currentUser?.avatar);

    const [tourOpen, setTourOpen] = useState(false);
    const [theme, setTheme] = useState<'light' | 'dark'>(loadStoredTheme);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [collapsed, setCollapsed] = useState<boolean>(loadStoredCollapsed);
    const [servers, setServers] = useState<CreateServerData[]>([]);
    const [stats, setStats] = useState({ activeInstances: 0 });

    useEffect(() => {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
    }, [collapsed]);

    // La guía de CoreBot sale sola la primera vez que entras. El estado vive en
    // la cuenta, así que no reaparece aunque cambies de navegador.
    useEffect(() => {
        if (!tokenStorage.getToken()) return;
        let cancelled = false;
        AuthService.me()
            .then(d => {
                if (cancelled || !d.success || !d.user) return;
                tokenStorage.updateUser({ onboardingDone: d.user.onboardingDone });
                if (!d.user.onboardingDone) setTourOpen(true);
            })
            .catch(() => { /* sin conexión: la guía esperará al próximo intento */ });
        return () => { cancelled = true; };
    }, []);

    const closeTour = useCallback(() => {
        setTourOpen(false);
        // Tanto terminarla como saltarla cuentan: no se vuelve a mostrar sola.
        tokenStorage.updateUser({ onboardingDone: true });
        AuthService.setOnboardingDone(true).catch(() => { /* se reintenta al recargar */ });
    }, []);

    useEffect(() => {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
        // Permite que el <body> y la barra de scroll acompañen al tema.
        document.documentElement.setAttribute('data-cc-theme', theme);
        return () => document.documentElement.removeAttribute('data-cc-theme');
    }, [theme]);

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

            setStats({ activeInstances: data.filter((s: any) => s.status === 'online').length });
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


    return (
        <div className={`dashboard-layout theme-${theme}${collapsed ? ' sidebar-collapsed' : ''}`}>
            <div className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}></div>
            <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-logo">
                    <img src="/favicon.png" alt="" className="sidebar-favicon" />
                    <span className="sidebar-brand-name">CloudCore</span>
                </div>

                <nav className="nav-links">
                    <NavLink to="/dashboard" end className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)} title={t('nav.overview')}>
                        <MorphIcon icon={LayoutGrid} size={16} />
                        <span>{t('nav.overview')}</span>
                    </NavLink>
                    <NavLink to="/dashboard/servers" data-tour="nav-servers" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)} title={t('nav.servers')}>
                        <MorphIcon icon={Server} size={16} />
                        <span>{t('nav.servers')}</span>
                    </NavLink>
                    <NavLink to="/dashboard/websites" data-tour="nav-websites" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)} title={t('nav.websites')}>
                        <MorphIcon icon={Globe} size={16} />
                        <span>{t('nav.websites')}</span>
                    </NavLink>
                    <NavLink to="/dashboard/databases" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)} title={t('nav.databases')}>
                        <MorphIcon icon={Database} size={16} />
                        <span>{t('nav.databases')}</span>
                    </NavLink>
                    <NavLink to="/dashboard/terminal" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)} title={t('nav.terminal')}>
                        <MorphIcon icon={Terminal} size={16} />
                        <span>{t('nav.terminal')}</span>
                    </NavLink>
                    {isClient && (
                        <NavLink to="/dashboard/billing" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)} title={t('nav.billing')}>
                            <MorphIcon icon={CreditCard} size={16} />
                            <span>{t('nav.billing')}</span>
                        </NavLink>
                    )}
                    <NavLink to="/dashboard/settings" data-tour="nav-settings" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)} title={t('nav.settings')}>
                        <MorphIcon icon={Settings} size={16} />
                        <span>{t('nav.settings')}</span>
                    </NavLink>
                </nav>

                {/* Único control de plegado, siempre en el mismo punto del borde:
                    la flecha apunta hacia donde se va a mover la barra. */}
                <button
                    type="button"
                    className="sidebar-toggle-tab"
                    onClick={() => setCollapsed(c => !c)}
                    title={collapsed ? t('dashboard.expandSidebar') : t('dashboard.collapseSidebar')}
                    aria-label={collapsed ? t('dashboard.expandSidebar') : t('dashboard.collapseSidebar')}
                    aria-expanded={!collapsed}
                >
                    <MorphIcon icon={collapsed ? ChevronRight : ChevronLeft} size={13} spring="snappy" />
                </button>
            </aside>

            <main className="main-content">
                <header className="header">
                    <div className="header-left">
                        <button className="mobile-menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                            <MorphIcon icon={Menu} size={20} />
                        </button>
                        <h2>{t('dashboard.breadcrumb', {
                            section: t(SECTION_KEYS[location.pathname.split('/').filter(Boolean).pop() || 'dashboard'] ?? 'nav.overview'),
                        })}</h2>
                    </div>
                    <div className="user-info">
                        <button
                            className="theme-switch"
                            onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
                            title={theme === 'dark' ? t('dashboard.toLightMode') : t('dashboard.toDarkMode')}
                            aria-label={t('dashboard.toggleTheme')}
                        >
                            <MorphIcon icon={theme === 'dark' ? Sun : Moon} size={16} spring="snappy" />
                        </button>

                        <button className="user-chip" onClick={() => navigate('/dashboard/profile')} title={t('dashboard.viewProfile')}>
                            {avatarUrl
                                ? <img className="avatar avatar-img" src={avatarUrl} alt={t('profile.avatar.alt')} />
                                : <span className="avatar">{avatarInitials}</span>}
                            <span className="user-name" style={{ fontSize: '12px', fontWeight: 500 }}>{displayName}</span>
                        </button>

                        <div className="notif-wrapper" ref={notifRef}>
                            <button
                                className="notif-bell"
                                onClick={() => setNotifOpen(o => !o)}
                                title={t('notifications.title')}
                            >
                                <MorphIcon icon={Bell} size={16} />
                                {unreadCount > 0 && (
                                    <span className="notif-badge">{unreadCount}</span>
                                )}
                            </button>

                            {notifOpen && (
                                <div className="notif-panel">
                                    <div className="notif-header">
                                        <span className="notif-title">{t('notifications.title')}</span>
                                        {unreadCount > 0 && (
                                            <button className="notif-mark-read" onClick={markAllRead} title={t('notifications.markAllReadTitle')}>
                                                <MorphIcon icon={CheckCheck} size={13} /> {t('notifications.markAllRead')}
                                            </button>
                                        )}
                                    </div>

                                    {notifPermission !== 'granted' && (
                                        <div className="notif-permission-banner">
                                            <MorphIcon icon={Bell} size={13} />
                                            <span>{t('notifications.enableBrowser')}</span>
                                            <button onClick={requestBrowserPermission}>
                                                {notifPermission === 'denied' ? t('notifications.blocked') : t('notifications.allow')}
                                            </button>
                                        </div>
                                    )}

                                    <div className="notif-list">
                                        {notifications.length === 0 ? (
                                            <div className="notif-empty">
                                                <MorphIcon icon={Bell} size={28} />
                                                <p>{t('notifications.empty')}</p>
                                            </div>
                                        ) : (
                                            notifications.map(n => (
                                                <div key={n.id} className={`notif-item${n.read ? '' : ' unread'}`}>
                                                    <div className="notif-icon">{NOTIF_ICONS[n.type]}</div>
                                                    <div className="notif-body">
                                                        <p className="notif-item-title">{n.title}</p>
                                                        <p className="notif-item-msg">{n.message}</p>
                                                        <span className="notif-item-time">{formatRelativeTime(n.timestamp, t)}</span>
                                                    </div>
                                                    <button className="notif-dismiss" onClick={() => dismiss(n.id)} title={t('notifications.dismiss')}>
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
                                        <span className="stat-title">{t('dashboard.stats.instances')}</span>
                                        <MorphIcon icon={Server} size={14} color="var(--gh-text-muted)" />
                                    </div>
                                    <div className="stat-value">{stats.activeInstances}</div>
                                </div>
                            </section>

                            <div className="table-controls">
                                <div className="search-bar">
                                    <MorphIcon icon={Search} size={14} color="var(--gh-text-muted)" />
                                    <input type="text" placeholder={t('dashboard.searchServers')} />
                                </div>
                                <div className="control-group">
                                    <button className="btn-secondary">
                                        {t('dashboard.filters')} <MorphIcon icon={ChevronDown} size={12} />
                                    </button>
                                    <button className="btn-secondary">
                                        {t('dashboard.sort')} <MorphIcon icon={ChevronDown} size={12} />
                                    </button>
                                </div>
                            </div>

                            <div className="server-container">
                                <div className="table-header">
                                    <h3>{t('dashboard.serverList')}</h3>
                                    <span style={{ fontSize: '12px', color: 'var(--gh-text-muted)' }}>{t('common.results', { count: servers.length })}</span>
                                </div>
                                <table className="server-table">
                                    <thead>
                                        <tr>
                                            <th>{t('dashboard.table.name')}</th>
                                            <th>{t('dashboard.table.status')}</th>
                                            <th>{t('dashboard.table.ip')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {servers.length > 0 ? (
                                            servers.map((server, i) => (
                                                <tr key={i}>
                                                    <td data-label={t('dashboard.table.name')}>
                                                        <a href="#" className="server-name">{server.name}</a>
                                                    </td>
                                                    <td data-label={t('dashboard.table.status')}>
                                                        <span className={`status-badge ${server.status}`}>
                                                            {server.status === 'online' ? t('dashboard.table.online') : t('dashboard.table.offline')}
                                                        </span>
                                                    </td>
                                                    <td data-label={t('dashboard.table.ip')} className="mono">{server.ip}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={3}>
                                                    <div className="empty-state">
                                                        <h4>{t('dashboard.empty.title')}</h4>
                                                        <p>{t('dashboard.empty.desc')}</p>
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

            {tourOpen
                ? <CoreBotTour onClose={closeTour} />
                : (
                    <button
                        className="corebot-fab"
                        onClick={() => setTourOpen(true)}
                        title={t('tour.replay')}
                        aria-label={t('tour.replay')}
                    >
                        <img src={corebotHead} alt="CoreBot" />
                    </button>
                )}
        </div>
    );
};

export default Dashboard;
