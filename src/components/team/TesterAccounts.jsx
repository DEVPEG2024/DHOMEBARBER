import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlaskConical, Plus, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest, apiUrl } from '@/api/apiClient';
import ClientAccountPicker from '@/components/agenda/ClientAccountPicker';
import LoadError, { friendlyError, queryFailed } from '@/components/shared/LoadError';

export const TESTER_ACCOUNTS_KEY = ['testerAccounts'];

/**
 * Comptes clients testeurs (Équipe, admin) : ils voient les fiches de test sur les pages client et
 * peuvent réserver avec elles (`GET` / `PUT /clients/testers`). Retrait en deux taps.
 */
export default function TesterAccounts() {
  const query = useQuery({
    queryKey: TESTER_ACCOUNTS_KEY,
    queryFn: async () => {
      const data = await apiRequest('GET', apiUrl('/clients/testers'));
      return Array.isArray(data?.testers) ? data.testers : [];
    },
  });
  const testers = query.data ?? [];
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);
  const [confirmEmail, setConfirmEmail] = useState(null);
  // « Retirer ? » retombe seul après 4 s
  useEffect(() => {
    if (!confirmEmail) return undefined;
    const t = setTimeout(() => setConfirmEmail(null), 4000);
    return () => clearTimeout(t);
  }, [confirmEmail]);

  const setTester = async (account, value) => {
    if (!account?.email || busy) return;
    setBusy(account.email);
    try {
      await apiRequest('PUT', apiUrl('/clients/testers'), { email: account.email, is_tester: value });
      const name = account.full_name || account.email;
      toast.success(value ? `${name} est testeur` : `${name} n'est plus testeur`, {
        description: value ? 'À sa prochaine ouverture de l\'app, il voit les fiches de test et peut réserver avec elles.' : undefined,
      });
      setAdding(false);
      setConfirmEmail(null);
      await query.refetch();
    } catch (err) {
      toast.error('Réglage impossible', { description: friendlyError(err, 'Réessayez dans un instant.') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-6 bg-card border border-border rounded-xl p-5" data-testid="tester-accounts">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
          <FlaskConical className="w-4 h-4 text-sky-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Comptes clients testeurs</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Ils voient les fiches de test sur les pages client (accueil, réservation, profil) et peuvent réserver avec elles.
            Les autres clients ne les voient jamais. En admin, vous les voyez déjà, mais un compte de l'équipe ne réserve pas pour lui-même.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {queryFailed(query) ? (
          <LoadError compact what="les comptes testeurs" error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
        ) : query.isPending ? (
          <div className="h-12 rounded-lg bg-white/5 animate-pulse" />
        ) : testers.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun compte testeur pour l'instant.</p>
        ) : (
          testers.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2">
              <UserRound className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{t.full_name || t.email}</p>
                {t.full_name && <p className="text-[11px] text-muted-foreground truncate">{t.email}</p>}
              </div>
              {confirmEmail === t.email ? (
                <button type="button" onClick={() => setTester(t, false)} disabled={!!busy}
                  className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500 text-white disabled:opacity-60">
                  {busy === t.email ? 'Retrait…' : 'Retirer ?'}
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmEmail(t.email)} disabled={!!busy}
                  className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-60">
                  Retirer
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-3">
        {adding ? (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">Cherchez un compte client (nom, email ou téléphone) :</p>
            <ClientAccountPicker onSelect={(acc) => setTester(acc, true)} onClose={() => setAdding(false)} />
            {busy && <p className="text-[11px] text-primary">Enregistrement…</p>}
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} disabled={!query.data}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 disabled:opacity-50">
            <Plus className="w-3.5 h-3.5" /> Ajouter un compte client
          </button>
        )}
      </div>
    </section>
  );
}
