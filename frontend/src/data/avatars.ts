/**
 * Pack de fotos de perfil PREDETERMINADAS.
 *
 * La base de datos guarda únicamente el `id` (ej. 'av-07'), nunca la imagen:
 * las ilustraciones se sirven desde la web (DiceBear) y se resuelven aquí.
 */

export interface AvatarOption {
    id: string;
    label: string;
    url: string;
}

export interface AvatarPack {
    id: string;
    /** Clave i18n del nombre del pack. */
    nameKey: string;
    /** Clave i18n de la descripción del pack. */
    descKey: string;
    avatars: AvatarOption[];
}

const DICEBEAR = 'https://api.dicebear.com/9.x';

const build = (
    style: string,
    seeds: [string, string][],
    prefix: string,
    extra = '',
): AvatarOption[] =>
    seeds.map(([seed, label], i) => ({
        id: `av-${prefix}-${i + 1}`,
        label,
        url: `${DICEBEAR}/${style}/svg?seed=${encodeURIComponent(seed)}&radius=50${extra}`,
    }));

export const AVATAR_PACKS: AvatarPack[] = [
    {
        id: 'people',
        nameKey: 'avatars.packs.people.name',
        descKey: 'avatars.packs.people.desc',
        avatars: build('adventurer', [
            ['Aurora', 'Aurora'],
            ['Bruno', 'Bruno'],
            ['Camila', 'Camila'],
            ['Diego', 'Diego'],
            ['Elena', 'Elena'],
            ['Facundo', 'Facundo'],
            ['Gabriela', 'Gabriela'],
            ['Hugo', 'Hugo'],
        ], 'pe', '&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf'),
    },
    {
        id: 'bots',
        nameKey: 'avatars.packs.bots.name',
        descKey: 'avatars.packs.bots.desc',
        avatars: build('bottts', [
            ['Nebula', 'Nebula'],
            ['Quantum', 'Quantum'],
            ['Photon', 'Photon'],
            ['Kernel', 'Kernel'],
            ['Vector', 'Vector'],
            ['Cypher', 'Cypher'],
            ['Nova', 'Nova'],
            ['Atlas', 'Atlas'],
        ], 'bo', '&backgroundColor=1d3557,2a9d8f,264653,e76f51,457b9d'),
    },
    {
        id: 'pixel',
        nameKey: 'avatars.packs.pixel.name',
        descKey: 'avatars.packs.pixel.desc',
        avatars: build('pixel-art', [
            ['Retro', 'Retro'],
            ['Arcade', 'Arcade'],
            ['Konami', 'Konami'],
            ['Sprite', 'Sprite'],
            ['Bitmap', 'Bitmap'],
            ['Joystick', 'Joystick'],
            ['Cartucho', 'Cartucho'],
            ['GameOver', 'Game Over'],
        ], 'px', '&backgroundColor=b6e3f4,ffd5dc,d1d4f9,c0aede'),
    },
    {
        id: 'fun',
        nameKey: 'avatars.packs.fun.name',
        descKey: 'avatars.packs.fun.desc',
        avatars: build('fun-emoji', [
            ['Feliz', 'Feliz'],
            ['Guiño', 'Guiño'],
            ['Sorpresa', 'Sorpresa'],
            ['Genial', 'Genial'],
            ['Risa', 'Risa'],
            ['Tranqui', 'Tranqui'],
            ['Pícaro', 'Pícaro'],
            ['Estrella', 'Estrella'],
        ], 'fu', '&backgroundColor=ffd5dc,b6e3f4,c0aede,d1d4f9,ffdfbf'),
    },
];

export const ALL_AVATARS: AvatarOption[] = AVATAR_PACKS.flatMap(p => p.avatars);

export const DEFAULT_AVATAR_ID = ALL_AVATARS[0].id;

/** Devuelve la URL de un avatar del pack, o null si el id no existe. */
export const getAvatarUrl = (id?: string | null): string | null =>
    (id && ALL_AVATARS.find(a => a.id === id)?.url) || null;
