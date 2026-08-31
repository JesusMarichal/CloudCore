import { useCallback, useEffect, useState } from 'react';
import {
    Users,
    Search,
    Shield,
    User as UserIcon,
    Lock,
    LockOpen,
    Server,
    KeyRound,
    RefreshCw,
    Trash2,
    TriangleAlert,
    X,
} from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { useI18n } from '../../i18n';
import { useToast } from '../../components/toast-context';
import { AdminService } from '../../services/admin.service';
import type { AdminUser, AdminUserDetail, UpdateUserPatch, UserRole } from '../../services/admin.service';
import { PRICING_TIERS } from '../../config/pricing-tiers';
import { useSession } from '../../services/session-context';
import { getAvatarUrl } from '../../data/avatars';
import './Clients.css';

type RoleFilter = 'ALL' | UserRole;

interface EditForm {
    name: string;
    email: string;
    role: UserRole;
}

/** Del `pri_...` espejado al nombre del plan, para no pintar el ID crudo. */
const planLabel = (priceId: string): string | null => {
    for (const tier of PRICING_TIERS) {
        if (tier.priceId.month === priceId) return `${tier.name} · mes`;
        if (tier.priceId.year === priceId) return `${tier.name} · año`;
    }
    return null;
};

const initialsOf = (user: Pick<AdminUser, 'name' | 'email'>) =>
    (user.name || user.email)
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || '?';

const formOf = (user: AdminUser): EditForm => ({
    name: user.name ?? '',
    email: user.email ?? '',
    role: user.role,
});

const Clients = () => {
    const { t, lang } = useI18n();
    const showToast = useToast();
    const locale = lang === 'en' ? 'en-US' : 'es-ES';

    // Quien soy sale de la sesion validada, no de localStorage: de ahi depende
    // que no pueda cambiarme el rol ni borrarme a mi mismo.
    const { user: currentUser } = useSession();

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [counts, setCounts] = useState({ total: 0, admins: 0, clients: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');

    const [detail, setDetail] = useState<AdminUserDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [closingDetail, setClosingDetail] = useState(false);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState<EditForm | null>(null);
    /** Cuenta pendiente de confirmar la baja; null = sin dialogo abierto. */
    const [confirmTarget, setConfirmTarget] = useState<AdminUser | null>(null);
    const [deleting, setDeleting] = useState(false);

    const isSelf = (id: string) => id === currentUser?.id;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await AdminService.listUsers({ search, role: roleFilter });
            setUsers(data.users);
            setCounts({ total: data.total, admins: data.admins, clients: data.clients });
        } catch (err) {
            setError(err instanceof Error ? err.message : t('clients.loadError'));
        } finally {
            setLoading(false);
        }
    }, [search, roleFilter, t]);

    // El buscador filtra en el servidor; se espera a que el usuario deje de teclear.
    useEffect(() => {
        const id = setTimeout(() => { void load(); }, 250);
        return () => clearTimeout(id);
    }, [load]);

    const openDetail = async (id: string) => {
        setDetailLoading(true);
        try {
            const data = await AdminService.getUser(id);
            setDetail(data);
            setForm(formOf(data));
        } catch (err) {
            showToast(err instanceof Error ? err.message : t('clients.loadError'));
        } finally {
            setDetailLoading(false);
        }
    };

    const closeDetail = () => {
        setClosingDetail(true);
        setTimeout(() => {
            setDetail(null);
            setForm(null);
            setClosingDetail(false);
        }, 280);
    };

    useEffect(() => {
        if (!detail && !confirmTarget) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (confirmTarget) setConfirmTarget(null);
            else closeDetail();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [detail, confirmTarget]);

    /** Refleja en la tabla el usuario que acaba de cambiar, sin recargar todo. */
    const mergeUser = (updated: AdminUser) => {
        setCounts((current) => {
            const before = users.find((u) => u.id === updated.id);
            if (!before || before.role === updated.role) return current;
            const delta = updated.role === 'ADMIN' ? 1 : -1;
            return { ...current, admins: current.admins + delta, clients: current.clients - delta };
        });
        setUsers((current) => current.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
        setDetail((current) => (current && current.id === updated.id ? { ...current, ...updated } : current));
    };

    const applyPatch = async (user: AdminUser, patch: UpdateUserPatch, successMessage?: string) => {
        setSaving(true);
        try {
            const result = await AdminService.updateUser(user.id, patch);
            mergeUser(result.user);
            if (result.changed) {
                setForm(formOf(result.user));
                showToast(successMessage ?? t('clients.saved'), 'success');
            }
            return true;
        } catch (err) {
            showToast(err instanceof Error ? err.message : t('clients.saveError'));
            return false;
        } finally {
            setSaving(false);
        }
    };

    /** Solo viaja lo que el admin ha tocado de verdad. */
    const pendingPatch = (): UpdateUserPatch => {
        if (!detail || !form) return {};
        const patch: UpdateUserPatch = {};
        if (form.name.trim() !== (detail.name ?? '')) patch.name = form.name.trim();
        if (form.email.trim() !== (detail.email ?? '')) patch.email = form.email.trim();
        if (form.role !== detail.role) patch.role = form.role;
        return patch;
    };

    const dirty = Object.keys(pendingPatch()).length > 0;

    const saveEdits = async () => {
        if (!detail) return;
        const patch = pendingPatch();
        if (Object.keys(patch).length === 0) return;
        await applyPatch(detail, patch);
    };

    const unlock = async (user: AdminUser) => {
        setSaving(true);
        try {
            const result = await AdminService.unlockUser(user.id);
            mergeUser(result.user);
            showToast(t('clients.unlocked', { name: user.name || user.email }), 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : t('clients.unlockError'));
        } finally {
            setSaving(false);
        }
    };

    const removeAccount = async () => {
        const target = confirmTarget;
        if (!target) return;
        setDeleting(true);
        try {
            await AdminService.deleteUser(target.id);
            setUsers((current) => current.filter((u) => u.id !== target.id));
            setCounts((current) => ({
                total: current.total - 1,
                admins: current.admins - (target.role === 'ADMIN' ? 1 : 0),
                clients: current.clients - (target.role === 'CLIENT' ? 1 : 0),
            }));
            showToast(t('clients.deleted', { name: target.name || target.email }), 'success');
            setConfirmTarget(null);
            if (detail?.id === target.id) closeDetail();
        } catch (err) {
            showToast(err instanceof Error ? err.message : t('clients.deleteError'));
        } finally {
            setDeleting(false);
        }
    };

    const formatDate = (iso: string | null) =>
        iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

    const formatDateTime = (iso: string | null) =>
        iso
            ? new Date(iso).toLocaleString(locale, {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })
            : '—';

    const Avatar = ({ user }: { user: AdminUser }) => {
        const url = getAvatarUrl(user.avatar);
        return url
            ? <img className="cli-avatar" src={url} alt="" />
            : <span className="cli-avatar cli-avatar--initials">{initialsOf(user)}</span>;
    };

    const RoleBadge = ({ role }: { role: UserRole }) => (
        <span className={`cli-role cli-role--${role.toLowerCase()}`}>
            <MorphIcon icon={role === 'ADMIN' ? Shield : UserIcon} size={12} />
            {t(`clients.role.${role}`)}
        </span>
    );

    return (
        <div className="clients-container">
            <header className="page-header">
                <div>
                    <h1><MorphIcon icon={Users} size={24} className="icon-blue" /> {t('clients.title')}</h1>
                    <p className="text-muted">{t('clients.subtitle')}</p>
                </div>
                <button className="btn-secondary" onClick={() => void load()} disabled={loading}>
                    <MorphIcon icon={RefreshCw} size={14} />
                    {t('clients.refresh')}
                </button>
            </header>

            <div className="cli-summary">
                <div className="cli-summary-card">
                    <span className="cli-summary-value">{counts.total}</span>
                    <span className="cli-summary-label">{t('clients.summaryTotal')}</span>
                </div>
                <div className="cli-summary-card">
                    <span className="cli-summary-value">{counts.admins}</span>
                    <span className="cli-summary-label">{t('clients.summaryAdmins')}</span>
                </div>
                <div className="cli-summary-card">
                    <span className="cli-summary-value">{counts.clients}</span>
                    <span className="cli-summary-label">{t('clients.summaryClients')}</span>
                </div>
            </div>

            <div className="cli-controls">
                <div className="search-bar">
                    <MorphIcon icon={Search} size={14} />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('clients.searchPlaceholder')}
                        aria-label={t('clients.searchPlaceholder')}
                    />
                </div>
                <div className="cli-filter" role="group" aria-label={t('clients.filterRole')}>
                    {(['ALL', 'ADMIN', 'CLIENT'] as RoleFilter[]).map((option) => (
                        <button
                            key={option}
                            type="button"
                            className={roleFilter === option ? 'cli-filter-btn active' : 'cli-filter-btn'}
                            onClick={() => setRoleFilter(option)}
                        >
                            {t(`clients.filter.${option}`)}
                        </button>
                    ))}
                </div>
            </div>

            {error && <p className="cli-error">{error}</p>}

            <div className="server-container">
                <div className="table-header">
                    <h3>{t('clients.tableTitle')}</h3>
                    <span className="text-muted cli-count">{t('clients.showing', { count: users.length })}</span>
                </div>

                {loading ? (
                    <div className="empty-state"><p>{t('clients.loading')}</p></div>
                ) : users.length === 0 ? (
                    <div className="empty-state">
                        <h4>{t('clients.emptyTitle')}</h4>
                        <p>{t('clients.emptyDesc')}</p>
                    </div>
                ) : (
                    <div className="cli-table-scroll">
                        <table className="server-table">
                            <thead>
                                <tr>
                                    <th>{t('clients.colAccount')}</th>
                                    <th>{t('clients.colRole')}</th>
                                    <th>{t('clients.colPlan')}</th>
                                    <th>{t('clients.colServers')}</th>
                                    <th>{t('clients.colStatus')}</th>
                                    <th>{t('clients.colCreated')}</th>
                                    <th className="cli-col-actions">{t('clients.colActions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => {
                                    const self = isSelf(user.id);
                                    return (
                                        <tr key={user.id}>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="cli-identity"
                                                    onClick={() => void openDetail(user.id)}
                                                    title={t('clients.viewDetail')}
                                                >
                                                    <Avatar user={user} />
                                                    <span className="cli-identity-text">
                                                        <span className="cli-name">
                                                            {user.name || '—'}
                                                            {self && <span className="cli-you">{t('clients.you')}</span>}
                                                        </span>
                                                        <span className="cli-email">{user.email}</span>
                                                    </span>
                                                </button>
                                            </td>
                                            <td><RoleBadge role={user.role} /></td>
                                            <td>
                                                {user.subscription ? (
                                                    <span className="cli-plan">
                                                        {planLabel(user.subscription.priceId) ?? t('clients.unknownPlan')}
                                                        <span className={`cli-sub-status cli-sub-status--${user.subscription.status}`}>
                                                            {user.subscription.status}
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <span className="text-muted">{t('clients.noPlan')}</span>
                                                )}
                                            </td>
                                            <td>{user.serverCount}</td>
                                            <td>
                                                {user.lockedUntil ? (
                                                    <span className="cli-flag cli-flag--locked">
                                                        <MorphIcon icon={Lock} size={12} />
                                                        {t('clients.locked')}
                                                    </span>
                                                ) : (
                                                    <span className="cli-flag cli-flag--ok">{t('clients.active')}</span>
                                                )}
                                                {user.twoFactorEnabled && (
                                                    <span className="cli-flag cli-flag--2fa" title={t('clients.twoFactorOn')}>
                                                        <MorphIcon icon={KeyRound} size={12} /> 2FA
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-muted">{formatDate(user.createdAt)}</td>
                                            <td className="cli-col-actions">
                                                <div className="cli-row-actions">
                                                    <select
                                                        className="cli-role-select"
                                                        value={user.role}
                                                        disabled={self || saving}
                                                        aria-label={t('clients.changeRole')}
                                                        title={self ? t('clients.cannotChangeSelf') : t('clients.changeRole')}
                                                        onChange={(e) =>
                                                            void applyPatch(
                                                                user,
                                                                { role: e.target.value as UserRole },
                                                                t('clients.roleChanged', {
                                                                    name: user.name || user.email,
                                                                    role: t(`clients.role.${e.target.value}`),
                                                                }),
                                                            )
                                                        }
                                                    >
                                                        <option value="CLIENT">{t('clients.role.CLIENT')}</option>
                                                        <option value="ADMIN">{t('clients.role.ADMIN')}</option>
                                                    </select>
                                                    <button
                                                        type="button"
                                                        className="cli-icon-btn cli-icon-btn--danger"
                                                        disabled={self}
                                                        title={self ? t('clients.cannotDeleteSelf') : t('clients.deleteAccount')}
                                                        aria-label={t('clients.deleteAccount')}
                                                        onClick={() => setConfirmTarget(user)}
                                                    >
                                                        <MorphIcon icon={Trash2} size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Ficha de la cuenta ────────────────────────────────────────── */}
            {detail && form && (
                <div className={`drawer-scrim ${closingDetail ? 'closing' : ''}`} onClick={closeDetail}>
                    <aside
                        className={`drawer cli-detail-drawer ${closingDetail ? 'closing' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label={t('clients.detailOf', { name: detail.name || detail.email })}
                    >
                        <header className="drawer-header">
                            <div className="cli-detail-identity">
                                <Avatar user={detail} />
                                <div className="drawer-title">
                                    <h3>{detail.name || detail.email}</h3>
                                    <p>{detail.email}</p>
                                </div>
                            </div>
                            <button className="drawer-close" onClick={closeDetail} aria-label={t('common.close')}>
                                <MorphIcon icon={X} size={18} />
                            </button>
                        </header>

                        <div className="drawer-body">
                            {/* ── Edición ─────────────────────────────────── */}
                            <section>
                                <h4 className="drawer-section-title">{t('clients.sectionEdit')}</h4>
                                <div className="cli-form">
                                    <label className="cli-field">
                                        <span>{t('clients.fieldName')}</span>
                                        <input
                                            type="text"
                                            value={form.name}
                                            maxLength={255}
                                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        />
                                    </label>
                                    <label className="cli-field">
                                        <span>{t('clients.fieldEmail')}</span>
                                        <input
                                            type="email"
                                            value={form.email}
                                            maxLength={255}
                                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                                        />
                                    </label>
                                    <label className="cli-field">
                                        <span>{t('clients.colRole')}</span>
                                        <select
                                            value={form.role}
                                            disabled={isSelf(detail.id)}
                                            title={isSelf(detail.id) ? t('clients.cannotChangeSelf') : undefined}
                                            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                                        >
                                            <option value="CLIENT">{t('clients.role.CLIENT')}</option>
                                            <option value="ADMIN">{t('clients.role.ADMIN')}</option>
                                        </select>
                                    </label>
                                </div>
                                <p className="cli-form-hint">{t('clients.editHint')}</p>
                            </section>

                            {/* ── Datos de solo lectura ───────────────────── */}
                            <section>
                                <h4 className="drawer-section-title">{t('clients.sectionAccount')}</h4>
                                <dl className="cli-facts">
                                    <div><dt>{t('clients.colRole')}</dt><dd><RoleBadge role={detail.role} /></dd></div>
                                    <div><dt>{t('clients.fieldId')}</dt><dd className="cli-mono">{detail.id}</dd></div>
                                    <div><dt>{t('clients.colCreated')}</dt><dd>{formatDateTime(detail.createdAt)}</dd></div>
                                    <div>
                                        <dt>{t('clients.fieldTwoFactor')}</dt>
                                        <dd>{detail.twoFactorEnabled ? t('clients.on') : t('clients.off')}</dd>
                                    </div>
                                    <div>
                                        <dt>{t('clients.fieldOnboarding')}</dt>
                                        <dd>{detail.onboardingDone ? t('clients.done') : t('clients.pending')}</dd>
                                    </div>
                                    <div>
                                        <dt>{t('clients.fieldGithub')}</dt>
                                        <dd>{detail.hasGithubToken ? t('clients.connected') : t('clients.notConnected')}</dd>
                                    </div>
                                </dl>
                            </section>

                            <section>
                                <h4 className="drawer-section-title">{t('clients.sectionSecurity')}</h4>
                                <div className={`cli-security ${detail.lockedUntil ? 'cli-security--locked' : ''}`}>
                                    <div>
                                        <p className="cli-security-state">
                                            <MorphIcon icon={detail.lockedUntil ? Lock : LockOpen} size={14} />
                                            {detail.lockedUntil
                                                ? t('clients.lockedUntil', { date: formatDateTime(detail.lockedUntil) })
                                                : t('clients.notLocked')}
                                        </p>
                                        <p className="cli-security-hint">
                                            {t('clients.failedAttempts', { count: detail.failedAttempts })}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        disabled={saving || (!detail.lockedUntil && detail.failedAttempts === 0)}
                                        onClick={() => void unlock(detail)}
                                    >
                                        <MorphIcon icon={LockOpen} size={14} />
                                        {t('clients.unlock')}
                                    </button>
                                </div>
                            </section>

                            <section>
                                <h4 className="drawer-section-title">{t('clients.sectionPlan')}</h4>
                                {detail.subscription ? (
                                    <dl className="cli-facts">
                                        <div>
                                            <dt>{t('clients.colPlan')}</dt>
                                            <dd>{planLabel(detail.subscription.priceId) ?? detail.subscription.priceId}</dd>
                                        </div>
                                        <div>
                                            <dt>{t('clients.fieldSubStatus')}</dt>
                                            <dd>
                                                <span className={`cli-sub-status cli-sub-status--${detail.subscription.status}`}>
                                                    {detail.subscription.status}
                                                </span>
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>{t('clients.fieldNextBilling')}</dt>
                                            <dd>{formatDate(detail.subscription.nextBilledAt)}</dd>
                                        </div>
                                        {detail.subscription.scheduledChangeAction && (
                                            <div>
                                                <dt>{t('clients.fieldScheduled')}</dt>
                                                <dd>
                                                    {detail.subscription.scheduledChangeAction} ·{' '}
                                                    {formatDate(detail.subscription.scheduledChangeAt)}
                                                </dd>
                                            </div>
                                        )}
                                    </dl>
                                ) : (
                                    <p className="text-muted">{t('clients.noPlanDesc')}</p>
                                )}
                            </section>

                            <section>
                                <h4 className="drawer-section-title">
                                    {t('clients.sectionServers', { count: detail.serverCount })}
                                </h4>
                                {detail.servers.length === 0 ? (
                                    <p className="text-muted">{t('clients.noServers')}</p>
                                ) : (
                                    <ul className="cli-server-list">
                                        {detail.servers.map((server) => (
                                            <li key={server.id}>
                                                <MorphIcon icon={Server} size={14} />
                                                <span className="cli-server-name">{server.name}</span>
                                                <span className="cli-mono">{server.ip}</span>
                                                <span className="cli-server-status">{server.status}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>

                            {/* ── Baja definitiva ─────────────────────────── */}
                            {!isSelf(detail.id) && (
                                <section>
                                    <h4 className="drawer-section-title cli-danger-title">
                                        <MorphIcon icon={TriangleAlert} size={13} />
                                        {t('clients.dangerZone')}
                                    </h4>
                                    <div className="cli-danger">
                                        <p className="cli-danger-text">{t('clients.deleteWarning')}</p>
                                        <button
                                            type="button"
                                            className="cli-danger-btn"
                                            onClick={() => setConfirmTarget(detail)}
                                        >
                                            <MorphIcon icon={Trash2} size={14} />
                                            {t('clients.deleteAccount')}
                                        </button>
                                    </div>
                                </section>
                            )}
                        </div>

                        <footer className="drawer-footer">
                            <span className="cli-dirty-hint">{dirty ? t('clients.unsaved') : ''}</span>
                            <div className="cli-footer-actions">
                                <button
                                    className="btn-secondary"
                                    disabled={!dirty || saving}
                                    onClick={() => setForm(formOf(detail))}
                                >
                                    {t('clients.discard')}
                                </button>
                                <button
                                    className="btn-primary"
                                    disabled={!dirty || saving}
                                    onClick={() => void saveEdits()}
                                >
                                    {saving ? t('common.saving') : t('common.save')}
                                </button>
                            </div>
                        </footer>
                    </aside>
                </div>
            )}

            {/* ── Confirmacion de baja ──────────────────────────────────────── */}
            {confirmTarget && (
                <div
                    className="cli-confirm-scrim"
                    onClick={() => !deleting && setConfirmTarget(null)}
                >
                    <div
                        className="cli-confirm"
                        onClick={(e) => e.stopPropagation()}
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="cli-confirm-title"
                    >
                        <div className="cli-confirm-icon">
                            <MorphIcon icon={TriangleAlert} size={20} />
                        </div>
                        <h3 id="cli-confirm-title">{t('clients.confirmDeleteTitle')}</h3>
                        <p>
                            {t('clients.confirmDeleteText', {
                                name: confirmTarget.name || confirmTarget.email,
                                email: confirmTarget.email,
                            })}
                        </p>
                        {confirmTarget.serverCount > 0 && (
                            <p className="cli-confirm-note">
                                {t('clients.confirmDeleteServers', { count: confirmTarget.serverCount })}
                            </p>
                        )}
                        <div className="cli-confirm-actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={deleting}
                                onClick={() => setConfirmTarget(null)}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                className="cli-danger-btn"
                                disabled={deleting}
                                onClick={() => void removeAccount()}
                            >
                                <MorphIcon icon={Trash2} size={14} />
                                {deleting ? t('clients.deleting') : t('clients.deleteCta')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {detailLoading && !detail && <div className="cli-detail-loading">{t('clients.loading')}</div>}
        </div>
    );
};

export default Clients;
