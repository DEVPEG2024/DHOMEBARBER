import React, { useEffect, useRef, useState } from 'react';
import { Search, UserRound, UserX, Loader2, X, RefreshCw } from 'lucide-react';
import { apiRequest, apiUrl } from '@/api/apiClient';

// Recherche côté serveur (`GET /clients/search?q=`, staff seulement) : 10 comptes clients au plus,
// triés par pertinence. Avant, l'agenda téléchargeait jusqu'à 5 000 comptes (téléphone et date de
// naissance compris) dès 2 lettres tapées, et la fiche « Modifier » le déclenchait à l'ouverture.
const SEARCH_DELAY = 250; // ms sans frappe avant d'interroger le serveur
const MAX_RESULTS = 10;
const MAX_QUERY_LENGTH = 100;

/** Minuscules sans accents : « Héloïse » et « heloise » se trouvent l'un l'autre. */
export function foldText(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const digitsOnly = (value) => String(value || '').replace(/\D/g, '');
const lettersCount = (value) => (String(value || '').match(/\p{L}/gu) || []).length;

/** Même règle que le serveur : au moins 2 lettres (nom, email) ou 3 chiffres (téléphone), sinon 400. */
export const isSearchableQuery = (value) => lettersCount(value) >= 2 || digitsOnly(value).length >= 3;

/** Compte client (rôle `user`, ou sans rôle) : le serveur ne renvoie que ceux-là, on le revérifie. */
const isClientAccount = (u) => !!u?.email && (!u.role || u.role === 'user');

/** `[{ id, email, full_name, phone }]` (10 au plus). Rejette avec `err.status` (404 : route absente). */
export async function searchClientAccounts(query) {
  const q = String(query || '').trim().slice(0, MAX_QUERY_LENGTH);
  const data = await apiRequest('GET', apiUrl(`/clients/search?q=${encodeURIComponent(q)}`));
  const list = Array.isArray(data?.results) ? data.results : [];
  return list.filter(isClientAccount).slice(0, MAX_RESULTS);
}

/**
 * Recherche d'un compte client par nom, email ou téléphone (insensible à la casse et aux accents,
 * côté serveur). `onSelect({ email, full_name, phone })` au choix d'un compte ; `onNoAccount()`
 * (facultatif) affiche le bouton « Aucun compte (nom libre) » ; `onClose()` (facultatif) ajoute
 * une croix. `initialQuery` pré-remplit le champ sans lancer de recherche : elle ne part qu'à la
 * première frappe ou au bouton « Rechercher ».
 */
export default function ClientAccountPicker({ onSelect, onNoAccount, onClose, noAccountLabel = 'Aucun compte (nom libre)', autoFocus = true, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery);
  // Recherche armée par une frappe ou par le bouton : rien n'est envoyé à l'ouverture
  const [armed, setArmed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  // status : idle | loading | done | error | unavailable (route absente) | invalid (400)
  const [search, setSearch] = useState({ status: 'idle', results: [] });
  const inputRef = useRef(null);

  const trimmed = query.trim();
  const searchable = isSearchableQuery(trimmed);

  useEffect(() => {
    // Sur téléphone, le clavier s'ouvre seulement après le tap qui a ouvert le panneau
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    if (!armed || !searchable) {
      setSearch({ status: 'idle', results: [] });
      return undefined;
    }
    // Réponse d'une frappe précédente arrivée en retard : ignorée (`cancelled`)
    let cancelled = false;
    setSearch((prev) => ({ status: 'loading', results: prev.results }));
    const timer = setTimeout(() => {
      searchClientAccounts(trimmed)
        .then((results) => { if (!cancelled) setSearch({ status: 'done', results }); })
        .catch((err) => {
          if (cancelled) return;
          const status = err?.status === 404 ? 'unavailable' : err?.status === 400 ? 'invalid' : 'error';
          setSearch({ status, results: [] });
        });
    }, SEARCH_DELAY);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [armed, searchable, trimmed, retryNonce]);

  const { status, results } = search;
  const loading = status === 'loading';

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
          maxLength={MAX_QUERY_LENGTH}
          onChange={(e) => { setQuery(e.target.value); setArmed(true); }}
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          aria-label="Rechercher un compte client"
        />
      </div>

      {/* Nom pré-rempli : la recherche ne part que sur demande */}
      {!armed && searchable && (
        <button type="button" onClick={() => setArmed(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-primary/15 text-primary hover:bg-primary/20 transition-colors min-w-0">
          <Search className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Rechercher « {trimmed} »</span>
        </button>
      )}

      {loading && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 py-1"><Loader2 className="w-3 h-3 animate-spin" /> Recherche…</p>
      )}
      {status === 'error' && (
        <div className="flex items-center justify-between gap-2 text-[11px] text-red-400 py-1">
          <span>Recherche impossible (connexion ?).</span>
          <button type="button" onClick={() => setRetryNonce((n) => n + 1)} className="font-semibold flex items-center gap-1 shrink-0">
            <RefreshCw className="w-3 h-3" /> Réessayer
          </button>
        </div>
      )}
      {status === 'unavailable' && (
        <p className="text-[11px] text-amber-300 py-1">Recherche indisponible pour l’instant.</p>
      )}
      {(status === 'invalid' || !searchable) && (
        <p className="text-[11px] text-muted-foreground">Tapez au moins 2 lettres du nom ou de l’email, ou 3 chiffres du téléphone.</p>
      )}

      {searchable && results.length > 0 && (
        <ul className={`max-h-52 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card divide-y divide-border/50 ${loading ? 'opacity-60' : ''}`}>
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
      {status === 'done' && results.length === 0 && (
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
