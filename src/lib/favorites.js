/**
 * Favoris du client : prestations et produits marqués d'un cœur.
 * Rangés sur l'appareil, par compte (`localStorage['dhb-favorites:<user.id>']`, invité :
 * `dhb-favorites:guest`) : pas de changement serveur. Tous les composants qui utilisent
 * `useFavorites()` restent synchronisés (événement `dhb:favorites`, et `storage` entre onglets).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { hapticFeedback } from '@/lib/capacitor';

const EVENT = 'dhb:favorites';
const MAX_PER_KIND = 100;
const EMPTY = { services: [], products: [] };

const storageKey = (userId) => `dhb-favorites:${userId || 'guest'}`;

function read(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(userId)));
    return {
      services: Array.isArray(raw?.services) ? raw.services.map(String) : [],
      products: Array.isArray(raw?.products) ? raw.products.map(String) : [],
    };
  } catch {
    return EMPTY;
  }
}

function write(userId, value) {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(value)); } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * @returns {{
 *   services: Set<string>, products: Set<string>, count: number,
 *   isFavorite: (kind: 'services'|'products', id) => boolean,
 *   toggle: (kind: 'services'|'products', id, name?: string) => void,
 * }}
 */
export function useFavorites() {
  const { user } = useAuth();
  const userId = user?.id ? String(user.id) : null;
  const [data, setData] = useState(() => read(userId));

  useEffect(() => {
    setData(read(userId));
    const sync = () => setData(read(userId));
    const onStorage = (e) => { if (!e.key || e.key === storageKey(userId)) sync(); };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);

  const sets = useMemo(() => ({ services: new Set(data.services), products: new Set(data.products) }), [data]);

  const isFavorite = useCallback((kind, id) => sets[kind]?.has(String(id)) || false, [sets]);

  const toggle = useCallback((kind, id, name) => {
    const key = String(id);
    const current = read(userId);
    const list = current[kind] || [];
    const has = list.includes(key);
    const next = { ...current, [kind]: has ? list.filter(x => x !== key) : [key, ...list].slice(0, MAX_PER_KIND) };
    write(userId, next);
    hapticFeedback();
    if (!has) toast.success(name ? `« ${name} » dans vos favoris ❤️` : 'Ajouté à vos favoris ❤️');
  }, [userId]);

  return {
    services: sets.services,
    products: sets.products,
    count: data.services.length + data.products.length,
    isFavorite,
    toggle,
  };
}
