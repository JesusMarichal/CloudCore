import { useState } from 'react';
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
    ChevronDown
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import './Dashboard.css';

interface ServerData {
    name: string;
    ip: string;
    region: string;
    status: 'online' | 'offline' | 'provisioning';
}

const Dashboard = () => {
    const location = useLocation();

    const [servers, _setServers] = useState<ServerData[]>([]);
    const [stats, _setStats] = useState({
        activeInstances: 0,
        cpuUsage: 0,
        networkStatus: 'Normal'
    });

    return (
        <div className="dashboard-layout">
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <Cloud size={20} />
                    <span>CloudCore</span>
                </div>

                <nav className="nav-links">
                    <NavLink to="/dashboard" end className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                        <LayoutGrid size={16} />
                        <span>Resumen</span>
                    </NavLink>
                    <NavLink to="/dashboard/servers" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                        <Server size={16} />
                        <span>Instancias</span>
                    </NavLink>
                    <NavLink to="/dashboard/terminal" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                        <Terminal size={16} />
                        <span>Terminal SSH</span>
                    </NavLink>
                    <NavLink to="/dashboard/settings" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                        <Settings size={16} />
                        <span>Ajustes</span>
                    </NavLink>

                    <NavLink to="/" className="nav-link logout">
                        <LogOut size={16} />
                        <span>Cerrar sesión</span>
                    </NavLink>
                </nav>
            </aside>

            <main className="main-content">
                <header className="header">
                    <h2>Panel de Control / {location.pathname.split('/').pop() || 'Resumen'}</h2>
                    <div className="user-info">
                        <div className="avatar">JM</div>
                        <span style={{ fontSize: '12px', fontWeight: 500 }}>Jesus Marichal</span>
                    </div>
                </header>

                <div className="content-body">
                    {location.pathname === '/dashboard' ? (
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
                                    <div className="stat-value">{stats.cpuUsage}%</div>
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
                                    <button className="btn-add-server">
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
                                            <th>Región</th>
                                            <th style={{ textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {servers.length > 0 ? (
                                            servers.map((server, i) => (
                                                <tr key={i}>
                                                    <td>
                                                        <a href="#" className="server-name">{server.name}</a>
                                                    </td>
                                                    <td>
                                                        <span className={`status-badge ${server.status}`}>
                                                            {server.status === 'online' ? 'Online' : 'Offline'}
                                                        </span>
                                                    </td>
                                                    <td className="mono">{server.ip}</td>
                                                    <td style={{ color: 'var(--gh-text-muted)' }}>{server.region}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <MoreHorizontal size={16} className="action-icon" />
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={5}>
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
                    ) : (
                        <div style={{ padding: '40px', textAlign: 'center' }}>
                            <Settings size={48} color="var(--gh-text-muted)" style={{ marginBottom: '16px' }} />
                            <h3>Sección en construcción</h3>
                            <p style={{ color: 'var(--gh-text-muted)' }}>Estamos actualizando esta vista para incluir más detalles.</p>
                        </div>
                    )}
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
