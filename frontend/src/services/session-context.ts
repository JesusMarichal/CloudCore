import { createContext, useContext } from 'react';
import type { StoredUser } from './tokenStorage';

export type UserRole = 'ADMIN' | 'CLIENT';

export interface SessionValue {
    /** Usuario confirmado por el servidor. null si no hay sesión. */
    user: StoredUser | null;
    /**
     * Rol tal y como lo tiene la base de datos, no el que hay guardado en el
     * navegador. null mientras no se haya confirmado o si no hay sesión.
     */
    role: UserRole | null;
    /** true hasta que el servidor responde por primera vez. */
    loading: boolean;
    /** Vuelve a preguntar al servidor por el rol. */
    refresh: () => Promise<void>;
}

export const SessionContext = createContext<SessionValue | null>(null);

/**
 * Rol y datos del usuario, siempre revalidados contra el servidor.
 *
 * No leas `tokenStorage.getUser().role` para decidir qué se enseña: eso es una
 * copia en localStorage que el usuario puede editar y que además se queda
 * obsoleta en cuanto otro admin le cambia el rol. Este hook devuelve lo que dice
 * la base de datos.
 */
export const useSession = (): SessionValue => {
    const value = useContext(SessionContext);
    if (!value) {
        // Sin provider no se rompe la pantalla: se comporta como "sin sesión".
        return { user: null, role: null, loading: false, refresh: async () => undefined };
    }
    return value;
};
