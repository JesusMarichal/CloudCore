import { useNavigate } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import { Server, Globe, Database, Terminal, Shield, Activity, ArrowRight, Cloud, Cpu, HardDrive, GitCommit, BarChart2, ChevronRight, Layers } from 'lucide-react';
import './Landing.css';

const steps = [
    { number: '01', title: 'Conecta tu servidor', desc: 'Agrega cualquier VPS con tu clave SSH o contraseña. Compatible con DigitalOcean, AWS, Hetzner, Vultr y más.' },
    { number: '02', title: 'Despliega tu proyecto', desc: 'Selecciona tu repositorio Git, configura los comandos y CloudCore hace el resto automáticamente.' },
    { number: '03', title: 'Monitorea y gestiona', desc: 'CPU, RAM, disco, servicios, certificados SSL y variables de entorno — todo desde un solo panel.' },
];

const deepFeatures = [
    {
        icon: <Server size={20} />, color: '#58a6ff',
        title: 'Consola de administración del servidor',
        desc: 'Compatible con DigitalOcean, AWS, Linode, Vultr, Hetzner y UpCloud. ¿Tienes tu propio servidor? También funciona con cualquier VPS con acceso SSH.',
    },
    {
        icon: <Layers size={20} />, color: '#a371f7',
        title: 'Despliega cualquier stack',
        desc: 'Node.js, WordPress, NuxtJS, Laravel, Strapi, PHP y HTML estático. Instalación con un clic desde tu repositorio Git.',
    },
    {
        icon: <Database size={20} />, color: '#58a6ff',
        title: 'Bases de datos gestionadas',
        desc: 'Crea instancias MySQL, PostgreSQL o MariaDB. Gestiona usuarios, permisos y conexiones directamente desde el panel.',
    },
    {
        icon: <HardDrive size={20} />, color: '#f0883e',
        title: 'Copias de seguridad automáticas',
        desc: 'Backups programados de archivos y bases de datos. Compatible con AWS S3, Wasabi, BackBlaze, DO Spaces y SFTP.',
    },
    {
        icon: <Shield size={20} />, color: '#3fb950',
        title: 'Seguridad integrada',
        desc: 'SSL gratuito con Let\'s Encrypt, UFW, Fail2Ban, SSH con clave privada y aislamiento por sitio.',
    },
    {
        icon: <GitCommit size={20} />, color: '#3fb950',
        title: 'Deploy sin tiempo de inactividad',
        desc: 'Despliega con un clic o push-to-deploy automático desde GitHub, GitLab o Bitbucket.',
    },
    {
        icon: <Terminal size={20} />, color: '#f0883e',
        title: 'Terminal SSH integrado',
        desc: 'Accede a tus servidores desde el navegador con una terminal SSH completa y segura, sin instalar nada.',
    },
    {
        icon: <Globe size={20} />, color: '#a371f7',
        title: '¡Y mucho más!',
        desc: 'Gestiona dominios, instala Docker, Redis y PM2, configura cron jobs, variables de entorno y certificados desde un solo lugar.',
    },
];

const Landing = () => {
    const navigate = useNavigate();
    const metricsRef = useRef<HTMLDivElement>(null);
    const [metricsVisible, setMetricsVisible] = useState(false);
    const [navOpen, setNavOpen] = useState(false);

    useEffect(() => {
        const el = metricsRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setMetricsVisible(true); obs.disconnect(); } },
            { threshold: 0.2 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    return (
        <div className="landing-root">
            <div className="landing-bg-animation">
                <div className="landing-shape shape-1" />
                <div className="landing-shape shape-2" />
                <div className="landing-shape shape-3" />
                <div className="landing-shape shape-4" />
            </div>

            {/* ── Navbar ── */}
            <nav className="landing-nav">
                <div className="landing-nav-inner">
                    <div className="landing-logo">
                        <Cloud size={20} />
                        <span>CloudCore</span>
                    </div>
                    <div className={`landing-nav-links${navOpen ? ' open' : ''}`}>
                        <a href="#features" onClick={() => setNavOpen(false)}>Características</a>
                        <a href="#how" onClick={() => setNavOpen(false)}>Cómo funciona</a>
                        <a href="#features" className="nav-link-mobile-cta" onClick={() => { setNavOpen(false); navigate('/login'); }}>Iniciar sesión</a>
                    </div>
                    <div className="landing-nav-actions">
                        <button className="landing-btn-ghost" onClick={() => navigate('/login')}>Iniciar sesión</button>
                        <button className="landing-btn-primary" onClick={() => navigate('/register')}>
                            Empezar gratis <ArrowRight size={14} />
                        </button>
                    </div>
                    <button className="nav-hamburger" onClick={() => setNavOpen(!navOpen)} aria-label="Menú">
                        <span /><span /><span />
                    </button>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="landing-hero">
                <h1 className="hero-title">
                    Gestiona tu infraestructura<br />
                    <span className="hero-gradient">desde un solo lugar.</span>
                </h1>
                <p className="hero-sub">
                    Despliega servidores, sitios web, WordPress, bases de datos y terminales SSH con una interfaz profesional, en tiempo real y sin complicaciones.
                </p>
                <div className="hero-actions">
                    <button className="landing-btn-primary hero-cta" onClick={() => navigate('/register')}>
                        Crear cuenta gratis <ArrowRight size={16} />
                    </button>
                    <button className="landing-btn-outline" onClick={() => navigate('/login')}>
                        Ver el panel <ChevronRight size={15} />
                    </button>
                </div>

                {/* Dashboard mockup */}
                <div className="hero-preview">
                    <div className="preview-bar">
                        <span className="preview-dot" style={{ background: '#ff5f56' }} />
                        <span className="preview-dot" style={{ background: '#ffbd2e' }} />
                        <span className="preview-dot" style={{ background: '#27c93f' }} />
                        <span className="preview-url">cloudcore.lat · Panel de Control</span>
                    </div>
                    <div className="preview-body">
                        <div className="preview-sidebar">
                            <div className="preview-logo-mini"><Cloud size={13} /> CloudCore</div>
                            {['Resumen', 'Instancias', 'Sitios Webs', 'Bases de Datos', 'Terminal SSH'].map(item => (
                                <div key={item} className={`preview-nav-item${item === 'Instancias' ? ' active' : ''}`}>{item}</div>
                            ))}
                        </div>
                        <div className="preview-main">
                            <div className="preview-stat-row">
                                {[
                                    { label: 'Servidores',    val: '3',   icon: <Server size={11} />,   color: '#58a6ff' },
                                    { label: 'CPU Promedio',  val: '24%', icon: <Cpu size={11} />,      color: '#3fb950' },
                                    { label: 'Sitios',        val: '5',   icon: <Globe size={11} />,    color: '#a371f7' },
                                    { label: 'Disco',         val: '68%', icon: <HardDrive size={11} />,color: '#f0883e' },
                                ].map(s => (
                                    <div key={s.label} className="preview-stat">
                                        <div style={{ color: s.color }}>{s.icon}</div>
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
                                    { name: 'prod-server-01', cpu: '18%', ram: '42%' },
                                    { name: 'staging-server', cpu: '31%', ram: '58%' },
                                    { name: 'db-server-eu',   cpu: '9%',  ram: '71%' },
                                ].map(r => (
                                    <div key={r.name} className="preview-table-row">
                                        <span className="preview-mono">{r.name}</span>
                                        <span className="preview-online">● online</span>
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
            <section className="landing-section deep-features-section" id="features">
                <div className="landing-section-inner">
                    <div className="section-label">Características</div>
                    <h2 className="section-title">Gestiona tus servidores y aplicaciones con confianza.</h2>
                    <p className="section-sub">CloudCore reemplaza múltiples herramientas con un solo panel — lanza sitios web y aplicaciones en minutos, no en horas.</p>
                    <div className="deep-grid">
                        {deepFeatures.map(f => (
                            <div key={f.title} className="deep-card">
                                <div className="deep-card-icon" style={{ color: f.color, background: `${f.color}12`, border: `1px solid ${f.color}22` }}>
                                    {f.icon}
                                </div>
                                <div>
                                    <h3 className="deep-card-title">{f.title}</h3>
                                    <p className="deep-card-desc">{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Metrics dashboard ── */}
            <section className="landing-metrics">
                <div className="landing-section-inner">
                    <div className="section-label">Monitoreo en tiempo real</div>
                    <h2 className="section-title">Cada métrica, visible al instante.</h2>
                    <p className="section-sub">Un panel de instrumentos que te muestra el estado exacto de cada servidor — actualizado cada 5 segundos.</p>

                    <div ref={metricsRef} className={`dash-panel${metricsVisible ? ' animate' : ''}`}>
                        <div className="dash-header">
                            <div className="dash-server-info">
                                <span className="dash-online-dot" />
                                <span className="dash-server-name">prod-server-01</span>
                                <span className="dash-sep">·</span>
                                <span className="dash-tag">Ubuntu 22.04 LTS</span>
                                <span className="dash-sep">·</span>
                                <span className="dash-tag">Uptime: 47d 12h</span>
                            </div>
                            <span className="dash-live">● LIVE</span>
                        </div>

                        <div className="dash-gauges">
                            {([
                                { label: 'CPU',   value: 24.5, max: 100, unit: '%',  color: '#58a6ff' },
                                { label: 'RAM',   value: 42.1, max: 100, unit: '%',  color: '#3fb950' },
                                { label: 'Disco', value: 68,   max: 100, unit: '%',  color: '#d29922' },
                                { label: 'Temp',  value: 52,   max: 100, unit: '°C', color: '#3fb950' },
                            ] as { label: string; value: number; max: number; unit: string; color: string }[]).map(g => {
                                const r = 38, C = 2 * Math.PI * r, L = 0.75 * C;
                                const filled = (g.value / g.max) * L;
                                const offset = metricsVisible ? L - filled : L;
                                const gc = g.value > 80 ? '#f85149' : g.value > 60 ? '#d29922' : g.color;
                                return (
                                    <div key={g.label} className="gauge-wrap">
                                        <svg viewBox="0 0 100 100" className="gauge-svg">
                                            <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" strokeDasharray={`${L} ${C}`} strokeLinecap="round" transform="rotate(135 50 50)" />
                                            <circle cx="50" cy="50" r={r} fill="none" stroke={gc} strokeWidth="9" strokeOpacity="0.12" strokeDasharray={`${L} ${C}`} strokeLinecap="round" transform="rotate(135 50 50)" style={{ strokeDashoffset: offset, transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1) 0.1s' }} />
                                            <circle cx="50" cy="50" r={r} fill="none" stroke={gc} strokeWidth="7" strokeDasharray={`${L} ${C}`} strokeLinecap="round" transform="rotate(135 50 50)" style={{ strokeDashoffset: offset, transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1) 0.2s', filter: `drop-shadow(0 0 5px ${gc})` }} />
                                            <text x="50" y="48" textAnchor="middle" dominantBaseline="middle" fill="#f0f6fc" fontSize="15" fontWeight="700" fontFamily="JetBrains Mono, monospace">{g.value}{g.unit}</text>
                                            <text x="50" y="64" textAnchor="middle" fill="rgba(139,148,158,0.8)" fontSize="8" fontFamily="Inter, sans-serif" letterSpacing="0.5">{g.label.toUpperCase()}</text>
                                        </svg>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="dash-services">
                            <span className="dash-services-label">Servicios</span>
                            {[
                                { name: 'nginx', active: true }, { name: 'mysql', active: true },
                                { name: 'pm2', active: true },   { name: 'redis', active: false },
                                { name: 'docker', active: true },{ name: 'postgresql', active: false },
                            ].map(s => (
                                <div key={s.name} className={`dash-service ${s.active ? 'on' : 'off'}`}>
                                    <span className="dash-service-dot" />{s.name}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="dash-features-row">
                        {[
                            { icon: <BarChart2 size={14} />, text: 'Gráficas históricas de CPU y RAM' },
                            { icon: <Activity size={14} />,  text: 'Actualización automática cada 5 s' },
                            { icon: <Shield size={14} />,    text: 'Control de servicios systemd' },
                            { icon: <GitCommit size={14} />, text: 'Detección de commits desactualizados' },
                        ].map(f => (
                            <div key={f.text} className="dash-feature-pill">
                                <span style={{ color: 'var(--primary)' }}>{f.icon}</span>{f.text}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Cómo funciona ── */}
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

            {/* ── CTA ── */}
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
                        <Cloud size={16} /><span>CloudCore</span>
                    </div>
                    <p className="footer-copy">© 2025 CloudCore. Infraestructura SaaS. · Desarrollado por <span className="footer-dev">AbstracDev</span></p>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
