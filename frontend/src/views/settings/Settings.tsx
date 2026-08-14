import { useState, useEffect } from 'react';
import {
    Github, KeyRound, Save, CheckCircle2, AlertCircle,
    ShieldCheck, Lock, Eye, EyeOff, QrCode, Shield,
    AlertTriangle, X, Check
} from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { API_URL } from '../../config';
import { AuthService } from '../../services/auth.service';
import { authFetch } from '../../services/apiFetch';
import { tokenStorage } from '../../services/tokenStorage';
import OTPInput from '../../components/OTPInput';
import './Settings.css';

// ── Sección: GitHub ───────────────────────────────────────────────────────────
const GithubSection = () => {
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null; msg: string }>({ type: null, msg: '' });

    useEffect(() => {
        if (!tokenStorage.getToken()) return;
        setLoading(true);
        authFetch(`${API_URL}/github/settings`)
            .then(r => r.json())
            .then(d => { if (d.success && d.token) setToken(d.token); })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        if (!tokenStorage.getToken()) return;
        setSaving(true);
        setStatus({ type: null, msg: '' });
        try {
            const r = await authFetch(`${API_URL}/github/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            });
            const d = await r.json();
            setStatus({ type: d.success ? 'success' : 'error', msg: d.success ? 'Token guardado correctamente.' : d.message });
        } catch {
            setStatus({ type: 'error', msg: 'Error de conexión' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="setting-card">
            <div className="setting-card-header">
                <div className="setting-icon github"><MorphIcon icon={Github} size={24} /></div>
                <div className="setting-title">
                    <h3>GitHub Integration</h3>
                    <p>Conecta CloudCore con GitHub usando un Personal Access Token para desplegar repositorios automáticamente.</p>
                </div>
            </div>
            <div className="setting-form">
                <div className="form-group">
                    <label>Personal Access Token</label>
                    <div className="input-with-icon">
                        <MorphIcon icon={KeyRound} size={16} className="input-icon" />
                        <input type="password" placeholder="ghp_************************************"
                            value={token} onChange={e => setToken(e.target.value)} disabled={loading} />
                    </div>
                    <span className="help-text">
                        Necesitas permisos de <code>repo</code>. Créalo en{' '}
                        <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer">GitHub Settings</a>.
                    </span>
                </div>
                {status.type && (
                    <div className={`status-alert ${status.type}`}>
                        <MorphIcon icon={status.type === 'success' ? CheckCircle2 : AlertCircle} size={16} />
                        <span>{status.msg}</span>
                    </div>
                )}
                <div className="setting-actions">
                    <button className="btn-save" onClick={handleSave} disabled={saving || loading}>
                        {saving ? 'Guardando...' : <><MorphIcon icon={Save} size={16} /> Guardar</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Sección: Cambiar contraseña ───────────────────────────────────────────────
const ChangePasswordSection = () => {
    const [form, setForm] = useState({ current: '', newPass: '', confirm: '' });
    const [show, setShow] = useState({ current: false, newPass: false, confirm: false });
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null; msg: string }>({ type: null, msg: '' });

    const strength = (p: string) => {
        let s = 0;
        if (p.length >= 8) s++;
        if (/[A-Z]/.test(p)) s++;
        if (/[0-9]/.test(p)) s++;
        if (/[^A-Za-z0-9]/.test(p)) s++;
        return s;
    };
    const str = strength(form.newPass);
    const strLabel = ['', 'Débil', 'Regular', 'Buena', 'Fuerte'][str];
    const strColor = ['', '#f85149', '#d29922', '#3fb950', '#58a6ff'][str];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus({ type: null, msg: '' });
        if (form.newPass !== form.confirm) {
            setStatus({ type: 'error', msg: 'Las contraseñas no coinciden' });
            return;
        }
        if (!tokenStorage.getToken()) return;
        setLoading(true);
        try {
            const result = await AuthService.changePassword(form.current, form.newPass);
            setStatus({ type: result.success ? 'success' : 'error', msg: result.message });
            if (result.success) setForm({ current: '', newPass: '', confirm: '' });
        } catch {
            setStatus({ type: 'error', msg: 'Error de conexión' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="setting-card">
            <div className="setting-card-header">
                <div className="setting-icon sec-blue"><MorphIcon icon={Lock} size={22} /></div>
                <div className="setting-title">
                    <h3>Cambiar Contraseña</h3>
                    <p>Actualiza tu contraseña periódicamente para mantener tu cuenta segura.</p>
                </div>
            </div>
            <form className="setting-form" onSubmit={handleSubmit}>
                {(['current', 'newPass', 'confirm'] as const).map(field => (
                    <div className="form-group" key={field}>
                        <label>
                            {field === 'current' ? 'Contraseña actual' :
                             field === 'newPass'  ? 'Nueva contraseña' : 'Confirmar nueva contraseña'}
                        </label>
                        <div className="input-with-icon">
                            <MorphIcon icon={Lock} size={16} className="input-icon" />
                            <input
                                type={show[field] ? 'text' : 'password'}
                                value={form[field]}
                                onChange={e => setForm({ ...form, [field]: e.target.value })}
                                placeholder="••••••••"
                                required
                                minLength={field === 'current' ? 1 : 8}
                            />
                            <button type="button" className="btn-eye" onClick={() => setShow({ ...show, [field]: !show[field] })}>
                                <MorphIcon icon={show[field] ? EyeOff : Eye} size={15} spring="snappy" />
                            </button>
                        </div>
                        {field === 'newPass' && form.newPass && (
                            <div className="password-strength">
                                <div className="strength-bars">
                                    {[1,2,3,4].map(i => (
                                        <div key={i} className="strength-bar" style={{ background: i <= str ? strColor : 'rgba(255,255,255,0.08)' }} />
                                    ))}
                                </div>
                                <span style={{ color: strColor, fontSize: '11px' }}>{strLabel}</span>
                            </div>
                        )}
                    </div>
                ))}
                {status.type && (
                    <div className={`status-alert ${status.type}`}>
                        <MorphIcon icon={status.type === 'success' ? CheckCircle2 : AlertCircle} size={16} />
                        <span>{status.msg}</span>
                    </div>
                )}
                <div className="setting-actions">
                    <button className="btn-save" type="submit" disabled={loading}>
                        {loading ? 'Actualizando...' : <><MorphIcon icon={Save} size={16} /> Actualizar Contraseña</>}
                    </button>
                </div>
            </form>
        </div>
    );
};

// ── Sección: 2FA ──────────────────────────────────────────────────────────────
const TwoFASection = () => {
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [step, setStep]       = useState<'idle' | 'setup' | 'disable'>('idle');
    const [qrUrl, setQrUrl]     = useState('');
    const [secret, setSecret]   = useState('');
    const [code, setCode]       = useState('');
    const [password, setPassword] = useState('');
    const [status, setStatus]   = useState<{ type: 'success' | 'error' | null; msg: string }>({ type: null, msg: '' });
    const [saving, setSaving]   = useState(false);

    useEffect(() => {
        if (!tokenStorage.getToken()) return;
        AuthService.get2FAStatus()
            .then(d => setEnabled(!!d.enabled))
            .finally(() => setLoading(false));
    }, []);

    const handleGenerate = async () => {
        if (!tokenStorage.getToken()) return;
        setSaving(true);
        setStatus({ type: null, msg: '' });
        try {
            const d = await AuthService.generate2FA();
            if (d.success) {
                setSecret(d.secret);
                const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(d.otpauthUrl)}`;
                setQrUrl(qr);
                setStep('setup');
            } else {
                setStatus({ type: 'error', msg: d.message });
            }
        } catch {
            setStatus({ type: 'error', msg: 'Error al generar QR' });
        } finally {
            setSaving(false);
        }
    };

    const handleEnable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tokenStorage.getToken()) return;
        setSaving(true);
        setStatus({ type: null, msg: '' });
        try {
            const d = await AuthService.enable2FA(code);
            if (d.success) {
                setEnabled(true);
                setStep('idle');
                setCode('');
                setStatus({ type: 'success', msg: '✓ 2FA activado. Tu cuenta ahora requiere código al iniciar sesión.' });
            } else {
                setStatus({ type: 'error', msg: d.message });
            }
        } catch {
            setStatus({ type: 'error', msg: 'Error al activar 2FA' });
        } finally {
            setSaving(false);
        }
    };

    const handleDisable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tokenStorage.getToken()) return;
        setSaving(true);
        setStatus({ type: null, msg: '' });
        try {
            const d = await AuthService.disable2FA(password);
            if (d.success) {
                setEnabled(false);
                setStep('idle');
                setPassword('');
                setStatus({ type: 'success', msg: '2FA desactivado.' });
            } else {
                setStatus({ type: 'error', msg: d.message });
            }
        } catch {
            setStatus({ type: 'error', msg: 'Error al desactivar 2FA' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="setting-card">
            <div className="setting-card-header">
                <div className={`setting-icon ${enabled ? 'sec-green' : 'sec-gray'}`}>
                    <MorphIcon icon={ShieldCheck} size={22} />
                </div>
                <div className="setting-title" style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h3>Autenticación de Dos Factores (2FA)</h3>
                        <span className={`twofa-badge ${enabled ? 'on' : 'off'}`}>
                            {enabled ? <><MorphIcon icon={Check} size={12} /> Activo</> : 'Inactivo'}
                        </span>
                    </div>
                    <p>Protege tu cuenta con Google Authenticator, Authy u otra app TOTP.</p>
                </div>
            </div>

            <div className="setting-form">
                {status.type && (
                    <div className={`status-alert ${status.type}`}>
                        <MorphIcon icon={status.type === 'success' ? CheckCircle2 : AlertCircle} size={16} />
                        <span>{status.msg}</span>
                    </div>
                )}

                {!loading && step === 'idle' && (
                    <div className="setting-actions">
                        {!enabled ? (
                            <button className="btn-save" onClick={handleGenerate} disabled={saving}>
                                {saving ? 'Generando...' : <><MorphIcon icon={QrCode} size={16} /> Activar 2FA</>}
                            </button>
                        ) : (
                            <button className="btn-danger" onClick={() => { setStep('disable'); setStatus({ type: null, msg: '' }); }}>
                                <MorphIcon icon={X} size={16} /> Desactivar 2FA
                            </button>
                        )}
                    </div>
                )}

                {step === 'setup' && (
                    <div className="twofa-setup">
                        <p className="twofa-step-label">Paso 1 — Escanea el código QR con tu app autenticadora</p>
                        <div className="twofa-qr-wrap">
                            {qrUrl && <img src={qrUrl} alt="QR 2FA" className="twofa-qr" />}
                        </div>
                        <p className="twofa-step-label">¿No puedes escanear? Ingresa este código manualmente:</p>
                        <div className="twofa-secret">
                            <code>{secret}</code>
                        </div>
                        <p className="twofa-step-label">Paso 2 — Ingresa el código de 6 dígitos para confirmar</p>
                        <form onSubmit={handleEnable} className="twofa-verify-form">
                            <OTPInput value={code} onChange={setCode} />
                            <div className="twofa-actions">
                                <button type="button" className="btn-ghost-sm"
                                    onClick={() => { setStep('idle'); setCode(''); setStatus({ type: null, msg: '' }); }}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-save" disabled={saving || code.length !== 6}>
                                    {saving ? 'Verificando...' : <><MorphIcon icon={Check} size={16} /> Confirmar y Activar</>}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {step === 'disable' && (
                    <form onSubmit={handleDisable} className="twofa-setup">
                        <p className="twofa-step-label">Ingresa tu contraseña para desactivar 2FA</p>
                        <div className="input-with-icon" style={{ maxWidth: '340px' }}>
                            <MorphIcon icon={Lock} size={16} className="input-icon" />
                            <input type="password" value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Tu contraseña actual" required autoFocus />
                        </div>
                        <div className="twofa-actions">
                            <button type="button" className="btn-ghost-sm"
                                onClick={() => { setStep('idle'); setPassword(''); }}>
                                Cancelar
                            </button>
                            <button type="submit" className="btn-danger" disabled={saving || !password}>
                                {saving ? 'Desactivando...' : <><MorphIcon icon={X} size={16} /> Desactivar</>}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

// ── Sección: Aviso de seguridad ───────────────────────────────────────────────
const SecurityTipsSection = () => (
    <div className="security-tips-card">
        <div className="security-tips-header">
            <MorphIcon icon={AlertTriangle} size={18} style={{ color: '#d29922' }} />
            <span>Buenas prácticas de seguridad</span>
        </div>
        <ul className="security-tips-list">
            <li><MorphIcon icon={Shield} size={13} /> Nunca compartas tus credenciales ni claves SSH con nadie.</li>
            <li><MorphIcon icon={Shield} size={13} /> Usa contraseñas únicas de al menos 12 caracteres con mayúsculas, números y símbolos.</li>
            <li><MorphIcon icon={Shield} size={13} /> Activa 2FA para proteger tu cuenta incluso si tu contraseña es comprometida.</li>
            <li><MorphIcon icon={Shield} size={13} /> CloudCore nunca te pedirá tu contraseña por correo o chat.</li>
            <li><MorphIcon icon={Shield} size={13} /> Revisa regularmente los servidores conectados y elimina accesos que ya no uses.</li>
        </ul>
    </div>
);

// ── Page ──────────────────────────────────────────────────────────────────────
const Settings = () => (
    <div className="settings-container">
        <div className="settings-header">
            <h2>Ajustes</h2>
            <p className="subtitle">Gestiona integraciones y la seguridad de tu cuenta</p>
        </div>
        <div className="settings-content">
            <GithubSection />
            <ChangePasswordSection />
            <TwoFASection />
            <SecurityTipsSection />
        </div>
    </div>
);

export default Settings;
