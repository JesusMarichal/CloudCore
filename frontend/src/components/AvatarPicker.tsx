import React, { useState } from 'react';
import { Check } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { AVATAR_PACKS } from '../data/avatars';
import { useT } from '../i18n';
import './AvatarPicker.css';

interface AvatarPickerProps {
    value: string | null;
    onChange: (avatarId: string) => void;
    /** Compacta la cuadrícula (usado dentro del dashboard). */
    compact?: boolean;
}

const AvatarPicker: React.FC<AvatarPickerProps> = ({ value, onChange, compact = false }) => {
    const t = useT();
    const initialPack = AVATAR_PACKS.find(p => p.avatars.some(a => a.id === value)) ?? AVATAR_PACKS[0];
    const [packId, setPackId] = useState(initialPack.id);

    const pack = AVATAR_PACKS.find(p => p.id === packId) ?? AVATAR_PACKS[0];

    return (
        <div className={`avatar-picker${compact ? ' compact' : ''}`}>
            <div className="avatar-packs" role="tablist">
                {AVATAR_PACKS.map(p => (
                    <button
                        key={p.id}
                        type="button"
                        role="tab"
                        aria-selected={p.id === packId}
                        className={`avatar-pack-tab${p.id === packId ? ' active' : ''}`}
                        onClick={() => setPackId(p.id)}
                    >
                        {t(p.nameKey)}
                    </button>
                ))}
            </div>

            <p className="avatar-pack-desc">{t(pack.descKey)}</p>

            <div className="avatar-grid">
                {pack.avatars.map(a => {
                    const selected = a.id === value;
                    return (
                        <button
                            key={a.id}
                            type="button"
                            className={`avatar-option${selected ? ' selected' : ''}`}
                            onClick={() => onChange(a.id)}
                            title={a.label}
                            aria-label={t('avatars.choose', { name: a.label })}
                            aria-pressed={selected}
                        >
                            <img src={a.url} alt={a.label} loading="lazy" />
                            {selected && (
                                <span className="avatar-check">
                                    <MorphIcon icon={Check} size={12} />
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default AvatarPicker;
