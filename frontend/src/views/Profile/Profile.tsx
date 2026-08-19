import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User, Mail, Shield, CalendarDays, Save, LogOut,
    CheckCircle2, AlertCircle, Image as ImageIcon,
} from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { AuthService } from '../../services/auth.service';
import { tokenStorage } from '../../services/tokenStorage';
import AvatarPicker from '../../components/AvatarPicker';
import { getAvatarUrl } from '../../data/avatars';
import { useI18n } from '../../i18n';
// Reutiliza las tarjetas/botones de Ajustes (.setting-card, .btn-save, .btn-danger...)
import '../settings/Settings.css';
import './Profile.css';

const Profile = () => {
    const navigate = useNavigate();
    const { lang, t } = useI18n();

    const [user, setUser] = useState(() => tokenStorage.getUser());
    const [selected, setSelected] = useState<string | null>(user?.avatar ?? null);
    const [createdAt, setCreatedAt] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null; msg: string }>({ type: null, msg: '' });

    // Refresca desde el servidor: el avatar pudo cambiarse en otro dispositivo.
    useEffect(() => {
        if (!tokenStorage.getToken()) return;
        AuthService.me()
            .then(d => {
                if (!d.success || !d.user) return;
                tokenStorage.updateUser({
                    name: d.user.name,
                    email: d.user.email,
                    role: d.user.role,
                    avatar: d.user.avatar,
                });
                setUser(tokenStorage.getUser());
                setSelected(d.user.avatar ?? null);
                setCreatedAt(d.user.createdAt ?? null);
            })
            .catch(() => { /* offline — se muestran los datos de la sesión local */ });
    }, []);

    const displayName = user?.name || user?.email || t('common.user');

    const initials = useMemo(() => (
        displayName
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0]?.toUpperCase())
            .join('') || '?'
    ), [displayName]);

    const avatarUrl = getAvatarUrl(selected ?? user?.avatar);
    const dirty = !!selected && selected !== (user?.avatar ?? null);

    const memberSince = createdAt
        ? new Date(createdAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES',
            { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

    const handleSaveAvatar = async () => {
        if (!selected || !tokenStorage.getToken()) return;
        setSaving(true);
        setStatus({ type: null, msg: '' });
        try {
            const d = await AuthService.updateAvatar(selected);
            if (d.success) {
                tokenStorage.updateUser({ avatar: d.user?.avatar ?? selected });
                setUser(tokenStorage.getUser());
                setStatus({ type: 'success', msg: t('profile.avatar.updated') });
                // El encabezado del dashboard lee el usuario de localStorage.
                window.dispatchEvent(new Event('cc-user-updated'));
            } else {
                setStatus({ type: 'error', msg: d.message || t('profile.avatar.error') });
            }
        } catch {
            setStatus({ type: 'error', msg: t('common.connectionError') });
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        tokenStorage.clearSession();
        navigate('/login');
    };

    return (
        <div className="profile-container">
            <div className="profile-page-header">
                <h2>{t('profile.title')}</h2>
                <p className="subtitle">{t('profile.subtitle')}</p>
            </div>

            <div className="profile-content">
                {/* ── Resumen de la cuenta ── */}
                <div className="profile-hero">
                    <div className="profile-hero-avatar">
                        {avatarUrl
                            ? <img src={avatarUrl} alt={t('profile.avatar.alt')} />
                            : <span className="profile-initials">{initials}</span>}
                    </div>
                    <div className="profile-hero-info">
                        <h3>{displayName}</h3>
                        <ul className="profile-meta">
                            <li><MorphIcon icon={Mail} size={14} /> {user?.email || '—'}</li>
                            <li>
                                <MorphIcon icon={Shield} size={14} />
                                <span className={`role-badge ${user?.role === 'ADMIN' ? 'admin' : 'client'}`}>
                                    {user?.role === 'ADMIN' ? t('profile.roleAdmin') : t('profile.roleClient')}
                                </span>
                            </li>
                            {memberSince && (
                                <li><MorphIcon icon={CalendarDays} size={14} /> {t('profile.memberSince', { date: memberSince })}</li>
                            )}
                        </ul>
                    </div>
                </div>

                {/* ── Foto de perfil ── */}
                <div className="setting-card">
                    <div className="setting-card-header">
                        <div className="setting-icon sec-blue"><MorphIcon icon={ImageIcon} size={22} /></div>
                        <div className="setting-title">
                            <h3>{t('profile.avatar.title')}</h3>
                            <p>{t('profile.avatar.desc')}</p>
                        </div>
                    </div>

                    <div className="setting-form">
                        <AvatarPicker value={selected} onChange={setSelected} compact />

                        {status.type && (
                            <div className={`status-alert ${status.type}`}>
                                <MorphIcon icon={status.type === 'success' ? CheckCircle2 : AlertCircle} size={16} />
                                <span>{status.msg}</span>
                            </div>
                        )}

                        <div className="setting-actions">
                            <button className="btn-save" onClick={handleSaveAvatar} disabled={saving || !dirty}>
                                {saving ? t('common.saving') : <><MorphIcon icon={Save} size={16} /> {t('profile.avatar.save')}</>}
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Sesión ── */}
                <div className="setting-card">
                    <div className="setting-card-header">
                        <div className="setting-icon sec-gray"><MorphIcon icon={User} size={22} /></div>
                        <div className="setting-title">
                            <h3>{t('profile.session.title')}</h3>
                            <p>{t('profile.session.desc')}</p>
                        </div>
                    </div>

                    <div className="setting-form">
                        <div className="setting-actions">
                            <button className="btn-danger" onClick={handleLogout}>
                                <MorphIcon icon={LogOut} size={16} /> {t('profile.session.logout')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
