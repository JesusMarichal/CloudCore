import { useNavigate } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import { Server, Globe, Database, Terminal, Shield, Activity, ArrowRight, Cloud, Cpu, HardDrive, Lock, GitCommit, BarChart2, ChevronRight } from 'lucide-react';
import './Landing.css';

const features = [
    {
        icon: <Server size={22} />,
        title: 'Gestión de Servidores',
        desc: 'Conecta cualquier VPS (AWS, Azure, DigitalOcean) y monitorea CPU, RAM, disco y temperatura en tiempo real.',
        color: '#58a6ff',
    },
    {
        icon: <Globe size={22} />,
        title: 'Despliegue de Sitios Web',
        desc: 'Despliega proyectos Node.js, React y estáticos directamente desde un repositorio Git con un clic.',
        color: '#3fb950',
    },
    {
        icon: <Database size={22} />,
        title: 'Bases de Datos',
        desc: 'Crea y gestiona instancias MySQL y PostgreSQL con panel de administración integrado.',
        color: '#a371f7',
    },
    {
        icon: <Terminal size={22} />,
        title: 'Terminal SSH',
        desc: 'Accede a tus servidores desde el navegador con una terminal SSH completa y segura.',
        color: '#f0883e',
    },
    {
        icon: <Lock size={22} />,
        title: 'SSL Automático',
        desc: 'Certificados Let\'s Encrypt configurados automáticamente. HTTPS sin complicaciones.',
        color: '#3fb950',
    },
    {
        icon: <Activity size={22} />,
        title: 'Métricas en Vivo',
        desc: 'Gráficas de uso de recursos actualizadas cada 5 segundos. Detecta picos antes de que afecten a tus usuarios.',
        color: '#58a6ff',
    },
];

const steps = [
    { number: '01', title: 'Conecta tu servidor', desc: 'Agrega un VPS existente con tu clave SSH o contraseña. Compatible con cualquier proveedor.' },
    { number: '02', title: 'Despliega tu proyecto', desc: 'Selecciona tu repositorio Git, configura los comandos y CloudCore hace el resto automáticamente.' },
    { number: '03', title: 'Monitorea y gestiona', desc: 'Visualiza métricas en tiempo real, gestiona servicios, variables de entorno y certificados SSL desde un solo panel.' },
];

const cpuData  = [18, 24, 21, 35, 28, 22, 19, 30, 25, 24, 20, 27, 24];
const ramData  = [38, 40, 42, 41, 43, 42, 44, 41, 40, 42, 43, 42, 42];

const Landing = () => {
    const navigate = useNavigate();
    const metricsRef = useRef<HTMLDivElement>(null);
    const [metricsVisible, setMetricsVisible] = useState(false);

    useEffect(() => {
        const el = metricsRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setMetricsVisible(true); obs.disconnect(); } },
            { threshold: 0.25 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    return (
        <div className="landing-root">
            {/* Animated background (same as Login) */}
            <div className="landing-bg-animation">
                <div className="landing-shape shape-1"></div>
                <div className="landing-shape shape-2"></div>
                <div className="landing-shape shape-3"></div>
                <div className="landing-shape shape-4"></div>
            </div>

            {/* ── Navbar ── */}
            <nav className="landing-nav">
                <div className="landing-nav-inner">
                    <div className="landing-logo">
                        <Cloud size={20} />
                        <span>CloudCore</span>
                    </div>
                    <div className="landing-nav-links">
                        <a href="#features">Características</a>
                        <a href="#how">Cómo funciona</a>
                    </div>
                    <div className="landing-nav-actions">
                        <button className="landing-btn-ghost" onClick={() => navigate('/login')}>
                            Iniciar sesión
                        </button>
                        <button className="landing-btn-primary" onClick={() => navigate('/register')}>
                            Empezar gratis <ArrowRight size={15} />
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="landing-hero">
                <div className="hero-badge">
                    <span className="hero-badge-dot"></span>
                    Panel de infraestructura cloud · Todo en uno
                </div>
                <h1 className="hero-title">
                    Gestiona tu infraestructura<br />
                    <span className="hero-gradient">desde un solo lugar.</span>
                </h1>
                <p className="hero-sub">
                    Despliega servidores, sitios web, bases de datos y terminales SSH<br className="hero-br" />
                    con una interfaz profesional, en tiempo real y sin complicaciones.
                </p>
                <div className="hero-actions">
                    <button className="landing-btn-primary hero-cta" onClick={() => navigate('/register')}>
                        Crear cuenta gratis <ArrowRight size={16} />
                    </button>
                    <button className="landing-btn-outline" onClick={() => navigate('/login')}>
                        Ver el panel <ChevronRight size={15} />
                    </button>
                </div>

                {/* Dashboard preview card */}
                <div className="hero-preview">
                    <div className="preview-bar">
                        <span className="preview-dot" style={{ background: '#ff5f56' }}></span>
                        <span className="preview-dot" style={{ background: '#ffbd2e' }}></span>
                        <span className="preview-dot" style={{ background: '#27c93f' }}></span>
                        <span className="preview-url">cloudcore.lat · Panel de Control</span>
                    </div>
                    <div className="preview-body">
                        <div className="preview-sidebar">
                            <div className="preview-logo-mini"><Cloud size={14} /> CloudCore</div>
                            {['Resumen', 'Instancias', 'Sitios Webs', 'Bases de Datos', 'Terminal SSH'].map(item => (
                                <div key={item} className={`preview-nav-item ${item === 'Instancias' ? 'active' : ''}`}>{item}</div>
                            ))}
                        </div>
                        <div className="preview-main">
                            <div className="preview-stat-row">
                                {[
                                    { label: 'Servidores', val: '3', icon: <Server size={12} />, color: '#58a6ff' },
                                    { label: 'CPU Promedio', val: '24%', icon: <Cpu size={12} />, color: '#3fb950' },
                                    { label: 'Sitios activos', val: '5', icon: <Globe size={12} />, color: '#a371f7' },
                                    { label: 'Almacenamiento', val: '68%', icon: <HardDrive size={12} />, color: '#f0883e' },
                                ].map(s => (
                                    <div key={s.label} className="preview-stat">
                                        <div className="preview-stat-icon" style={{ color: s.color }}>{s.icon}</div>
                                        <div className="preview-stat-val" style={{ color: s.color }}>{s.val}</div>
                                        <div className="preview-stat-label">{s.label}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="preview-table">
                                <div className="preview-table-header">
                                    <span>Servidor</span><span>Status</span><span>CPU</span><span>RAM</span>
                                </div>
                                {[
                                    { name: 'prod-server-01', status: 'online', cpu: '18%', ram: '42%' },
                                    { name: 'staging-server', status: 'online', cpu: '31%', ram: '58%' },
                                    { name: 'db-server-eu', status: 'online', cpu: '9%', ram: '71%' },
                                ].map(r => (
                                    <div key={r.name} className="preview-table-row">
                                        <span className="preview-mono">{r.name}</span>
                                        <span className="preview-online">● {r.status}</span>
                                        <span>{r.cpu}</span>
                                        <span>{r.ram}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Features ── */}
            <section className="landing-section" id="features">
                <div className="landing-section-inner">
                    <div className="section-label">Características</div>
                    <h2 className="section-title">Todo lo que necesitas para gestionar tu infraestructura</h2>
                    <p className="section-sub">Un panel unificado que reemplaza múltiples herramientas por una sola interfaz.</p>
                    <div className="features-grid">
                        {features.map(f => (
                            <div key={f.title} className="feature-card">
                                <div className="feature-icon" style={{ color: f.color, background: `${f.color}14`, border: `1px solid ${f.color}25` }}>
                                    {f.icon}
                                </div>
                                <h3>{f.title}</h3>
                                <p>{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Metrics highlight ── */}
            <section className="landing-metrics">
                <div className="landing-section-inner metrics-inner">
                    <div className="metrics-text">
                        <div className="section-label">Monitoreo en tiempo real</div>
                        <h2 className="section-title" style={{ maxWidth: '420px' }}>
                            Cada métrica, visible al instante.
                        </h2>
                        <p className="section-sub" style={{ maxWidth: '400px' }}>
                            Gráficas de CPU y RAM actualizadas automáticamente. Temperatura del servidor, uso de disco
                            y estado de cada servicio del sistema, todo desde el navegador.
                        </p>
                        <ul className="metrics-list">
                            {[
                                { icon: <BarChart2 size={15} />, text: 'Historial de CPU y RAM en gráficas de área' },
                                { icon: <Activity size={15} />, text: 'Actualización automática cada 5 segundos' },
                                { icon: <Shield size={15} />, text: 'Control de servicios systemd (start/stop/restart)' },
                                { icon: <GitCommit size={15} />, text: 'Detección de commits desactualizados en producción' },
                            ].map(m => (
                                <li key={m.text}>
                                    <span className="metrics-icon">{m.icon}</span>
                                    {m.text}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div ref={metricsRef} className={`metrics-visual${metricsVisible ? ' animate' : ''}`}>
                        {/* CPU Card */}
                        <div className="metrics-card">
                            <div className="mc-header">
                                <Cpu size={13} style={{ color: '#58a6ff' }} />
                                <span>prod-server-01</span>
                                <span className="mc-label">CPU</span>
                                <span className="mc-badge">24.5%</span>
                            </div>
                            <div className="mc-chart">
                                {cpuData.map((v, i) => (
                                    <div
                                        key={i}
                                        className={`mc-bar cpu${i === cpuData.length - 1 ? ' mc-bar-current' : ''}`}
                                        style={{
                                            '--bar-h': `${Math.round((v / 40) * 90)}px`,
                                            '--delay': `${i * 0.04}s`,
                                        } as React.CSSProperties}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* RAM Card */}
                        <div className="metrics-card">
                            <div className="mc-header">
                                <Activity size={13} style={{ color: '#3fb950' }} />
                                <span>prod-server-01</span>
                                <span className="mc-label">RAM</span>
                                <span className="mc-badge ram">42.1%</span>
                            </div>
                            <div className="mc-chart">
                                {ramData.map((v, i) => (
                                    <div
                                        key={i}
                                        className={`mc-bar ram${i === ramData.length - 1 ? ' mc-bar-current' : ''}`}
                                        style={{
                                            '--bar-h': `${Math.round((v / 50) * 90)}px`,
                                            '--delay': `${i * 0.04}s`,
                                        } as React.CSSProperties}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Mini stats */}
                        <div className="metrics-row-cards">
                            {[
                                { label: 'Disco', val: '68%', color: '#f0883e', sub: 'usado' },
                                { label: 'Temp', val: '52°C', color: '#3fb950', sub: 'CPU' },
                                { label: 'Servicios', val: '12', color: '#58a6ff', sub: 'activos' },
                            ].map(c => (
                                <div key={c.label} className="metrics-mini-card">
                                    <span className="mmc-val" style={{ color: c.color }}>{c.val}</span>
                                    <span className="mmc-label">{c.label}</span>
                                    <span className="mmc-sub">{c.sub}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── How it works ── */}
            <section className="landing-section" id="how">
                <div className="landing-section-inner">
                    <div className="section-label">Cómo funciona</div>
                    <h2 className="section-title">En producción en minutos, no en horas.</h2>
                    <div className="steps-grid">
                        {steps.map((s, i) => (
                            <div key={i} className="step-card">
                                <div className="step-number">{s.number}</div>
                                <h3>{s.title}</h3>
                                <p>{s.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA Banner ── */}
            <section className="landing-cta-section">
                <div className="landing-cta-inner">
                    <h2>Empieza a gestionar tu infraestructura hoy.</h2>
                    <p>Sin tarjeta de crédito. Sin configuración compleja. Listo en minutos.</p>
                    <button className="landing-btn-primary hero-cta" onClick={() => navigate('/register')}>
                        Crear cuenta gratis <ArrowRight size={16} />
                    </button>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="landing-footer">
                <div className="landing-footer-inner">
                    <div className="landing-logo" style={{ opacity: 0.6 }}>
                        <Cloud size={16} />
                        <span>CloudCore</span>
                    </div>
                    <p className="footer-copy">© 2025 CloudCore. Infraestructura SaaS.</p>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
