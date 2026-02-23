import { Cloud, LayoutGrid, Server, Terminal, Settings, LogOut, Activity, HardDrive, MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import './Dashboard.css';

const Dashboard = () => {
    const servers = [
        { name: 'AWS-Production-01', ip: '18.118.32.137', region: 'us-east-2', status: 'online' },
        { name: 'Backup-Node-01', ip: '3.12.45.190', region: 'us-east-2', status: 'online' },
        { name: 'Staging-Cloud', ip: '18.231.10.5', region: 'sa-east-1', status: 'offline' },
    ];

    return (
        <div className="dashboard-layout">
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <Cloud size={24} />
                    <span>CloudCore</span>
                </div>
                <nav className="nav-links">
                    <Link to="/dashboard" className="nav-link active">
                        <LayoutGrid size={20} />
                        <span>Dashboard</span>
                    </Link>
                    <Link to="/servers" className="nav-link">
                        <Server size={20} />
                        <span>Servidores</span>
                    </Link>
                    <Link to="/terminal" className="nav-link">
                        <Terminal size={20} />
                        <span>Terminal</span>
                    </Link>
                    <Link to="/settings" className="nav-link">
                        <Settings size={20} />
                        <span>Configuración</span>
                    </Link>
                    <Link to="/" className="nav-link logout">
                        <LogOut size={20} />
                        <span>Cerrar Sesión</span>
                    </Link>
                </nav>
            </aside>

            <main className="main-content">
                <header className="header">
                    <h2>Vista General</h2>
                    <div className="user-info">
                        <span>Jesus Marichal</span>
                        <div className="avatar">JM</div>
                    </div>
                </header>

                <section className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-header">
                            <span className="stat-title">Instancias Activas</span>
                            <Server size={20} color="#6366f1" />
                        </div>
                        <div className="stat-value">12</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-header">
                            <span className="stat-title">Uso de CPU Global</span>
                            <Activity size={20} color="#10b981" />
                        </div>
                        <div className="stat-value">24.8%</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-header">
                            <span className="stat-title">Storage Utilizado</span>
                            <HardDrive size={20} color="#f59e0b" />
                        </div>
                        <div className="stat-value">1.4 TB</div>
                    </div>
                </section>

                <section className="server-container">
                    <div className="table-header">
                        <h3>Servidores Recientes</h3>
                        <button className="btn-primary">+ Nuevo Servidor</button>
                    </div>
                    <table className="server-table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>IP Pública</th>
                                <th>Región</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {servers.map((server, i) => (
                                <tr key={i}>
                                    <td>{server.name}</td>
                                    <td>{server.ip}</td>
                                    <td>{server.region}</td>
                                    <td>
                                        <span className={`status-badge ${server.status}`}>
                                            {server.status.charAt(0).toUpperCase() + server.status.slice(1)}
                                        </span>
                                    </td>
                                    <td><MoreHorizontal size={18} className="action-icon" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            </main>
        </div>
    );
};

export default Dashboard;
