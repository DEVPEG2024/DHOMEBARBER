import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, UserRound, UserX, Loader2, X, RefreshCw } from 'lucide-react';
import { api } from '@/api/apiClient';

// Même clé de cache et même chargement que la recherche de la fiche RDV (last minute) :
// les comptes ne sont téléchargés qu'une fois par session, par lots (OFFSET côté serveur).
export const CLIENT_ACCOUNTS_QUERY_KEY = ['allUsersForSearch'];
const USERS_PAGE_SIZE = 200;
const USERS_MAX_PAGES = 25; // garde-fou : 5 000 comptes
const MAX_RESULTS = 30;

export async function fetchClientAccounts() {
  const all = [];
  for (let i = 0; i < USERS_MAX_PAGES; i++) {
    const page = await api.entities.User.list('full_name', USERS_PAGE_SIZE, i * USERS_PAGE_SIZE);
    all.push(...page);
    if (page.length < USERS_PAGE_SIZE) break;
  }
  return all;
}

/** Minuscules sans accents : « Héloïse » et « heloise » se trouvent l'un l'autre. */
export function foldText(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

/** Compte client (rôle `user`, ou sans rôle pour les très anciens comptes). */
const isClientAccount = (u) => !!u?.email && (!u.role || u.role === 'user');

function matches(user, query) {
  const q = foldText(query);
  if (!q) return false;
  const words = q.split(/\s+/).filter(Boolean);
  const haystack = `${foldText(user.full_name)} ${foldText(user.email)}`;
  if (words.every((w) => haystack.includes(w))) return true;
  // Téléphone : « 06 12 34 », « 0612 », « +33 6 12 » → chiffres seulement (au moins 3)
  const qDigits = digitsOnly(query);
  if (qDigits.length >= 3) {
    const phone = digitsOnly(user.phone);
    if (phone.includes(qDigits)) return true;
    // 06… saisi, +336… enregistré (ou l'inverse)
    const local = (d) => (d.startsWith('33') ? `0${d.slice(2)}` : d);
    if (local(phone).includes(local(qDigits))) return true;
  }
  return false;
}

/**
 * Recherche d'un compte client par nom, email ou téléphone (insensible à la casse et aux accents).
 * `onSelect({ email, full_name, phone })` au choix d'un compte ; `onNoAccount()` (facultatif) affiche
 * le bouton « Aucun compte (nom libre) » ; `onClose()` (facultatif) ajoute une croix.
 */
export default function ClientAccountPicker({ onSelect, onNoAccount, onClose, noAccountLabel = 'Aucun compte (nom libre)', autoFocus = true, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef(null);

  // Comptes chargés seulement quand une recherche commence (2 lettres ou 3 chiffres) : choisir
  // « Aucun compte » ne télécharge rien
  const searching = foldText(query).length >= 2 || digitsOnly(query).length >= 3;
  const { data: users = [], isLoading, isError, refetch } = useQuery({
    queryKey: CLIENT_ACCOUNTS_QUERY_KEY,
    queryFn: fetchClientAccounts,
    staleTime: 5 * 60 * 1000,
    enabled: searching,
  });

  useEffect(() => {
    // Sur téléphone, le clavier s'ouvre seulement après le tap qui a ouvert le panneau
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const clients = useMemo(() => users.filter(isClientAccount), [users]);
  const results = useMemo(() => {
    if (foldText(query).length < 2 && digitsOnly(query).length < 3) return [];
    return clients.filter((u) => matches(u, query)).slice(0, MAX_RESULTS);
  }, [clients, query]);

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold flex items-center gap-1.5"><UserRound className="w-3.5 h-3.5 text-primary" /> Compte client</p>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Fermer la recherche"
            className="w-7 h-7 -mr-1 rounded-full flex items-center justify-center text-muted-foreground hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Nom, email ou téléphone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          aria-label="Rechercher un compte client"
        />
      </div>

      {isLoading && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 py-1"><Loader2 className="w-3 h-3 animate-spin" /> Chargement des comptes…</p>
      )}
      {isError && !users.length && (
        <div className="flex items-center justify-between gap-2 text-[11px] text-red-400 py-1">
          <span>Impossible de charger les comptes (connexion ?).</span>
          <button type="button" onClick={() => refetch()} className="font-semibold flex items-center gap-1 shrink-0">
            <RefreshCw className="w-3 h-3" /> Réessayer
          </button>
        </div>
      )}
      {!isLoading && !searching && (
        <p className="text-[11px] text-muted-foreground">Tapez au moins 2 lettres du nom ou de l’email, ou 3 chiffres du téléphone.</p>
      )}

      {searching && results.length > 0 && (
        <ul className="max-h-52 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card divide-y divide-border/50">
          {results.map((u) => (
            <li key={u.id || u.email}>
              <button
                type="button"
                onClick={() => onSelect({ email: u.email, full_name: u.full_name || '', phone: u.phone || '' })}
                className="w-full text-left px-3 py-2 hover:bg-primary/10 transition-colors min-w-0"
              >
                <span className="block text-sm font-semibold text-foreground truncate">{u.full_name || u.email}</span>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
                  <span className="truncate min-w-0">{u.email}</span>
                  {u.phone && <span className="shrink-0 tabular-nums">{u.phone}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && !isLoading && results.length === 0 && users.length > 0 && (
        <p className="text-[11px] text-muted-foreground text-center py-1">Aucun compte client trouvé</p>
      )}

      {onNoAccount && (
        <button
          type="button"
          onClick={onNoAccount}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border border-dashed border-white/15 text-muted-foreground hover:bg-white/5 transition-all"
        >
          <UserX className="w-3.5 h-3.5" /> {noAccountLabel}
        </button>
      )}
    </div>
  );
}
