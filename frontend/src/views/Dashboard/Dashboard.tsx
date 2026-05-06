import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
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
    Menu
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import './Dashboard.css';

const Dashboard = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [servers, setServers] = useState<CreateServerData[]>([]);
    const [deletingServerId, setDeletingServerId] = useState<string | null>(null);
    const [stats, setStats] = useState({

        activeInstances: 0,
        cpuUsage: 0,
        networkStatus: 'Normal'
    });

    const getUserId = () => {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            return user.id;
        }
        return null;
    };

    const loadData = async () => {
        const userId = getUserId();
        if (!userId) {
            navigate('/login');
            return;
        }

        try {
            const data = await serverService.list(userId);
            setServers(data);

            // Calcular estadísticas
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
        const interval = setInterval(loadData, 10000); // Cada 10s
        return () => clearInterval(interval);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('user');
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
                    <Cloud size={20} />
                    <span>CloudCore</span>
                </div>

                <nav className="nav-links">
                    <NavLink to="/dashboard" end className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                        <LayoutGrid size={16} />
                        <span>Resumen</span>
                    </NavLink>
                    <NavLink to="/dashboard/servers" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                        <Server size={16} />
                        <span>Instancias</span>
                    </NavLink>
                    <NavLink to="/dashboard/websites" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                        <Globe size={16} />
                        <span>Sitios Webs</span>
                    </NavLink>
                    <NavLink to="/dashboard/databases" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                        <Database size={16} />
                        <span>Bases de Datos</span>
                    </NavLink>
                    <NavLink to="/dashboard/terminal" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                        <Terminal size={16} />
                        <span>Terminal SSH</span>
                    </NavLink>
                    <NavLink to="/dashboard/settings" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"} onClick={() => setSidebarOpen(false)}>
                        <Settings size={16} />
                        <span>Ajustes</span>
                    </NavLink>

                    <button onClick={handleLogout} className="nav-link logout" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                        <LogOut size={16} />
                        <span>Cerrar sesión</span>
                    </button>
                </nav>
            </aside>

            <main className="main-content">
                <header className="header">
                    <div className="header-left">
                        <button className="mobile-menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                            <Menu size={20} />
                        </button>
                        <h2>Panel de Control / {location.pathname.split('/').pop() || 'Resumen'}</h2>
                    </div>
                    <div className="user-info">
                        <div className="avatar">JM</div>
                        <span style={{ fontSize: '12px', fontWeight: 500 }}>Jesus Marichal</span>
                    </div>
                </header>

                <div className="content-body">
                    {location.pathname === '/dashboard' && (
                        <>
                            <section className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-title">Instancias</span>
                                        <Server size={14} color="var(--gh-text-muted)" />
                                    </div>
                                    <div className="stat-value">{stats.activeInstances}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-title">Uso de CPU</span>
                                        <Activity size={14} color="var(--gh-text-muted)" />
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
                                    <Search size={14} color="var(--gh-text-muted)" />
                                    <input type="text" placeholder="Buscar servidores..." />
                                </div>
                                <div className="control-group">
                                    <button className="btn-secondary">
                                        Filtros <ChevronDown size={12} />
                                    </button>
                                    <button className="btn-secondary">
                                        Ordenar <ChevronDown size={12} />
                                    </button>
                                    <button className="btn-add-server" onClick={() => navigate('/dashboard/servers')}>
                                        <Plus size={16} />
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
                                                            <Loader2 size={16} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                                                        ) : (
                                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                                                                <MoreHorizontal size={16} className="action-icon" style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard/servers')} />
                                                                <Trash2
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

                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
