import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
    Server, ShieldCheck, Cpu, Lock, Globe, Zap, Cloud,
    ChevronRight, Sun, Moon, ArrowRight, Activity,
    CheckCircle2, Rocket, Gauge
} from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { useT } from '../../i18n';
import type { TranslateFn } from '../../i18n';
import './Landing.css';

const buildSteps = (t: TranslateFn) => [
    { number: '01', icon: Server, title: t('landing.steps.s1.title'), desc: t('landing.steps.s1.desc') },
    { number: '02', icon: Rocket, title: t('landing.steps.s2.title'), desc: t('landing.steps.s2.desc') },
    { number: '03', icon: Gauge, title: t('landing.steps.s3.title'), desc: t('landing.steps.s3.desc') },
];

const buildDeepFeatures = (t: TranslateFn) =>
    ['console', 'stack', 'databases', 'backups', 'security', 'deploy', 'terminal', 'more'].map(key => ({
        title: t(`landing.features.${key}.title`),
        desc: t(`landing.features.${key}.desc`),
    }));

const commandTokens: { text: string; cls?: string }[] = [
    { text: 'cloudcore', cls: 't-cmd-bin' },
    { text: ' ' },
    { text: 'deploy', cls: 't-cmd-sub' },
    { text: ' ' },
    { text: '--vps', cls: 't-cmd-flag' },
    { text: ' ' },
    { text: 'main-server', cls: 't-cmd-val' },
    { text: ' ' },
    { text: '--domain', cls: 't-cmd-flag' },
    { text: ' ' },
    { text: 'cloudcore.com', cls: 't-cmd-val' },
];
const commandText = commandTokens.map(t => t.text).join('');

const Landing = () => {
    const t = useT();
    const deepFeatures = buildDeepFeatures(t);
    const steps = buildSteps(t);
    const navigate = useNavigate();
    const [navOpen, setNavOpen] = useState(false);
    const [isDark, setIsDark] = useState(false);

    // Mouse movement green spotlight effect
    const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });
    const [mouseActive, setMouseActive] = useState(false);

    // Terminal typing & step animation
    const [typedText, setTypedText] = useState("");
    const [terminalStep, setTerminalStep] = useState(0);

    // Live footer metrics (fluctuate subtly to match the LIVE badge)
    const [cpu, setCpu] = useState(2.1);
    const [ram, setRam] = useState(1.2);
    useEffect(() => {
        const id = setInterval(() => {
            setCpu(+(1.6 + Math.random() * 3).toFixed(1));
            setRam(+(1.1 + Math.random() * 0.9).toFixed(1));
        }, 2200);
        return () => clearInterval(id);
    }, []);

    // Render the command with syntax highlighting as it types out
    const renderTypedCommand = () => {
        let remaining = typedText.length;
        return commandTokens.map((tok, i) => {
            if (remaining <= 0) return null;
            const visible = tok.text.slice(0, remaining);
            remaining -= tok.text.length;
            return <span key={i} className={tok.cls}>{visible}</span>;
        });
    };

    // Scroll reveal for feature cards & steps
    useEffect(() => {
        const items = document.querySelectorAll<HTMLElement>('.landing-root .reveal');
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('revealed');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
        );
        items.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (terminalStep === 0) {
            if (typedText.length < commandText.length) {
                timer = setTimeout(() => {
                    setTypedText(commandText.slice(0, typedText.length + 1));
                }, 35);
            } else {
                timer = setTimeout(() => setTerminalStep(1), 350);
            }
        } else if (terminalStep === 1) {
            timer = setTimeout(() => setTerminalStep(2), 450);
        } else if (terminalStep === 2) {
            timer = setTimeout(() => setTerminalStep(3), 450);
        } else if (terminalStep === 3) {
            timer = setTimeout(() => setTerminalStep(4), 450);
        } else if (terminalStep === 4) {
            timer = setTimeout(() => setTerminalStep(5), 450);
        } else if (terminalStep === 5) {
            timer = setTimeout(() => setTerminalStep(6), 450);
        } else if (terminalStep === 6) {
            timer = setTimeout(() => {
                setTypedText("");
                setTerminalStep(0);
            }, 7500);
        }
        return () => clearTimeout(timer);
    }, [typedText, terminalStep]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
        if (!mouseActive) setMouseActive(true);
    };

    return (
        <div
            className={`landing-root ${isDark ? 'dark-theme' : ''}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMouseActive(false)}
        >
            {/* Interactive mouse follow green glow */}
            <div
                className="mouse-green-glow"
                style={{
                    left: `${mousePos.x}px`,
                    top: `${mousePos.y}px`,
                    opacity: mouseActive ? 1 : 0,
                }}
            />

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
                        <MorphIcon icon={Cloud} size={22} />
                        <span>CloudCore</span>
                    </div>
                    <div className={`landing-nav-links${navOpen ? ' open' : ''}`}>
                        <a href="#features" onClick={() => setNavOpen(false)}>{t('landing.nav.features')}</a>
                        <a href="#how" onClick={() => setNavOpen(false)}>{t('landing.nav.how')}</a>
                        <a href="#features" className="nav-link-mobile-cta" onClick={() => { setNavOpen(false); navigate('/login'); }}>{t('landing.nav.login')}</a>
                    </div>
                    <div className="landing-nav-actions">
                        <button className="theme-toggle-btn" onClick={() => setIsDark(!isDark)} title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}>
                            <MorphIcon icon={isDark ? Sun : Moon} size={18} spring="snappy" />
                        </button>
                        <button className="landing-btn-ghost" onClick={() => navigate('/login')}>{t('landing.nav.login')}</button>
                        <button className="landing-btn-primary" onClick={() => navigate('/register')}>
                            Empezar gratis <MorphIcon icon={ArrowRight} size={14} />
                        </button>
                    </div>
                    <button className="nav-hamburger" onClick={() => setNavOpen(!navOpen)} aria-label={t('landing.nav.menu')}>
                        <span /><span /><span />
                    </button>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="landing-hero-container">
                <div className="landing-hero-inner">
                    <div className="hero-content">
                        <h1 className="hero-title">
                            {t('landing.hero.titleLine1')}<br />
                            <span className="hero-gradient">{t('landing.hero.gradient')}</span>
                        </h1>
                        <p className="hero-sub">
                            {t('landing.hero.sub')}
                        </p>
                        <div className="hero-actions">
                            <button className="landing-btn-primary hero-cta" onClick={() => navigate('/register')}>
                                {t('landing.hero.createAccount')} <MorphIcon icon={ArrowRight} size={16} />
                            </button>
                            <button className="landing-btn-outline" onClick={() => navigate('/login')}>
                                {t('landing.hero.viewPanel')} <MorphIcon icon={ChevronRight} size={15} />
                            </button>
                        </div>
                    </div>

                    {/* Height-balanced Animated Terminal Box */}
                    <div className="hero-visual">
                        <div className="terminal-box">
                            <div className="terminal-header">
                                <div className="t-dots">
                                    <span className="t-dot red" />
                                    <span className="t-dot yellow" />
                                    <span className="t-dot green" />
                                </div>
                                <span className="t-title">cloudcore-cli — bash</span>
                                <span className="t-live-pill">
                                    <span className="live-dot" /> LIVE
                                </span>
                            </div>

                            <div className="terminal-body">
                                {/* Command Prompt */}
                                <div className="t-line prompt">
                                    <span className="t-user">cloudcore@server</span>:<span className="t-dir">~</span>$&nbsp;
                                    <span className="t-cmd">{renderTypedCommand()}</span>
                                    <span className="t-cursor">|</span>
                                </div>

                                {/* Step 1: SSH Connection */}
                                {terminalStep >= 1 && (
                                    <div className="t-animated-line">
                                        <MorphIcon icon={Server} size={14} className="t-step-icon blue" />
                                        <span className="t-text">{t('landing.term.connecting')}</span>
                                        <span className="t-val blue">104.248.192.12</span>
                                    </div>
                                )}

                                {/* Step 2: Firewall Security */}
                                {terminalStep >= 2 && (
                                    <div className="t-animated-line">
                                        <MorphIcon icon={ShieldCheck} size={14} className="t-step-icon green" />
                                        <span className="t-text">{t('landing.term.firewall')}</span>
                                        <span className="t-val green">{t('landing.term.protected')}</span>
                                    </div>
                                )}

                                {/* Step 3: Stack Provisioning */}
                                {terminalStep >= 3 && (
                                    <div className="t-animated-line">
                                        <MorphIcon icon={Cpu} size={14} className="t-step-icon purple" />
                                        <span className="t-text">{t('landing.term.installing')}</span>
                                        <span className="t-val green">v24.2.0 Ready</span>
                                    </div>
                                )}

                                {/* Step 4: SSL Certificate */}
                                {terminalStep >= 4 && (
                                    <div className="t-animated-line">
                                        <MorphIcon icon={Lock} size={14} className="t-step-icon green" />
                                        <span className="t-text">{t('landing.term.tls')}</span>
                                        <span className="t-val green">{t('landing.term.sslActive')}</span>
                                    </div>
                                )}

                                {/* Step 5: DNS & Health Check */}
                                {terminalStep >= 5 && (
                                    <div className="t-animated-line">
                                        <MorphIcon icon={Globe} size={14} className="t-step-icon blue" />
                                        <span className="t-text">{t('landing.term.dns')}</span>
                                        <span className="t-val green">200 OK (12ms)</span>
                                    </div>
                                )}

                                {/* Step 6: Success Line (Clean Text, No Background Box) */}
                                {terminalStep >= 6 && (
                                    <div className="t-animated-success-line">
                                        <MorphIcon icon={Zap} size={16} className="t-success-icon" />
                                        <span>{t('landing.term.ready')} <strong className="t-domain">https://cloudcore.com</strong></span>
                                    </div>
                                )}
                            </div>

                            {/* Live System Status Bar */}
                            <div className="terminal-footer">
                                <div className="t-metric">
                                    <MorphIcon icon={Activity} size={12} className="t-metric-icon" />
                                    <span>CPU: <strong>{cpu.toFixed(1)}%</strong></span>
                                </div>
                                <div className="t-metric">
                                    <span>RAM: <strong>{ram.toFixed(1)} GB / 8 GB</strong></span>
                                </div>
                                <div className="t-metric">
                                    <span>Puertos: <strong>80, 443, 22</strong></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Features ── */}
            <section className="landing-section deep-features-section" id="features">
                <div className="landing-section-inner">
                    <h2 className="section-title">{t('landing.sections.featuresTitle')}</h2>
                    <p className="section-sub">{t('landing.sections.featuresSub')}</p>
                    <div className="deep-grid">
                        {deepFeatures.map((f, i) => (
                            <div
                                key={f.title}
                                className="deep-card reveal"
                                style={{ transitionDelay: `${(i % 2) * 0.08 + Math.floor(i / 2) * 0.06}s` }}
                            >
                                <h3 className="deep-card-title">{f.title}</h3>
                                <p className="deep-card-desc">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Cómo funciona ── */}
            <section className="landing-section" id="how">
                <div className="landing-section-inner">
                    <h2 className="section-title">{t('landing.sections.howTitle')}</h2>
                    <div className="steps-grid">
                        {steps.map((s, i) => (
                            <div
                                key={i}
                                className="step-card reveal"
                                style={{ transitionDelay: `${i * 0.15}s` }}
                            >
                                <div className="step-head">
                                    <span className="step-badge">
                                        <MorphIcon icon={s.icon} size={26} strokeWidth={1.75} />
                                    </span>
                                    <span className="step-check">
                                        <MorphIcon icon={CheckCircle2} size={18} />
                                    </span>
                                    {i < steps.length - 1 && <span className="step-connector" />}
                                </div>
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
                    <h2>{t('landing.cta.title')}</h2>
                    <p>{t('landing.cta.sub')}</p>
                    <button className="landing-btn-primary hero-cta" onClick={() => navigate('/register')}>
                        {t('landing.hero.createAccount')} <MorphIcon icon={ArrowRight} size={16} />
                    </button>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="landing-footer">
                <div className="landing-footer-inner">
                    <div className="landing-logo">
                        <MorphIcon icon={Cloud} size={18} /><span>CloudCore</span>
                    </div>
                    <p className="footer-copy">{t('landing.footer.copy')} <span className="footer-dev">AbstracDev</span></p>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
