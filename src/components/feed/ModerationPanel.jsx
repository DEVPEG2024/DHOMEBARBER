import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { hapticFeedback } from '@/lib/capacitor';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import { timeAgo } from '@/lib/feed/rules';
import { invalidateFeed } from '@/lib/feed/feedCache';
import { feedErrorText } from '@/lib/feed/useFeed';

/**
 * Admin : signalements en attente du fil (App Store 1.2). « Supprimer le contenu » en deux taps
 * (publication, photo, commentaires et réactions effacés), « Ignorer », ou « Clore » quand le contenu
 * est déjà supprimé. Ordre : d'abord le contenu, ensuite seulement le signalement (si la suppression
 * échoue, le signalement reste sous les yeux de l'admin). En échec : LoadError, jamais un panneau
 * absent (l'admin croirait n'avoir rien à modérer). Rien pour un autre rôle.
 *
 * @param {object} props
 * @param {object} props.user
 */
export default function ModerationPanel({ user }) {
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const [handling, setHandling] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  useEffect(() => {
    if (!confirmDelete || handling) return undefined;
    const t = setTimeout(() => setConfirmDelete(null), 4000);
    return () => clearTimeout(t);
  }, [confirmDelete, handling]);

  const reportsQuery = useQuery({
    queryKey: ['postReports'],
    queryFn: () => api.entities.PostReport.filter({ status: 'pending' }, '-created_at', 50),
    enabled: isAdmin,
  });
  if (!isAdmin) return null;
  const reports = reportsQuery.data ?? [];

  const handleReport = async (report, action) => {
    setHandling(report.id);
    try {
      let deleted = false;
      if (action === 'delete') {
        try {
          if (report.comment_id) { await api.entities.PostComment.delete(report.comment_id); deleted = true; }
          else if (report.post_id) { await api.entities.Post.delete(report.post_id); deleted = true; }
        } catch (err) {
          if (err?.status !== 404) throw err; // déjà supprimé : rien à faire
        }
      }
      try {
        await api.entities.PostReport.update(report.id, {
          status: action === 'dismiss' ? 'dismissed' : 'handled',
          handled_by: user.email,
          handled_at: new Date().toISOString(),
        });
      } catch (err) {
        // Le serveur a pu clore ce signalement en même temps que la suppression du contenu
        if (!(deleted && err?.status === 404)) throw err;
      }
      qc.invalidateQueries({ queryKey: ['postReports'] });
      // Fil v2 (pages, commentaires), ancien fil et dernière publication de l'accueil
      invalidateFeed(qc);
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['postComments'] });
      toast.success(action === 'dismiss'
        ? 'Signalement ignoré'
        : action === 'close' ? 'Signalement clos'
          : deleted ? 'Contenu supprimé' : 'Signalement traité (contenu déjà supprimé)');
    } catch (err) {
      toast.error(feedErrorText(err, 'Erreur lors du traitement'));
      // La liste doit refléter l'état réel (une étape a pu passer)
      qc.invalidateQueries({ queryKey: ['postReports'] });
    } finally {
      setHandling(null);
      setConfirmDelete(null);
    }
  };

  // Échec ou hors connexion au premier chargement : jamais un panneau absent
  if (queryFailed(reportsQuery)) {
    return (
      <LoadError
        compact
        className="mb-6"
        what="les signalements"
        error={reportsQuery.error}
        onRetry={reportsQuery.refetch}
        retrying={reportsQuery.isFetching}
      />
    );
  }
  if (!reports.length) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-500/20">
        <ShieldAlert className="w-4 h-4 text-amber-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">Signalements en attente ({reports.length})</p>
      </div>
      <div className="divide-y divide-border">
        {reports.map((r) => {
          // Contenu déjà supprimé (post_id / comment_id passés à NULL) : il ne reste qu'à clore
          const gone = !r.post_id && !r.comment_id;
          const busy = handling === r.id;
          return (
            <div key={r.id} className="px-4 py-3 space-y-2">
              <p className="text-xs text-muted-foreground break-words">
                <span className="font-semibold text-foreground">{r.reporter_name || r.reporter_email}</span>
                {' '}a signalé {gone ? 'un contenu déjà supprimé' : r.comment_id ? 'un commentaire' : 'une publication'} de{' '}
                <span className="font-semibold text-foreground">{r.reported_name || r.reported_email || 'inconnu'}</span>
                {' '}· {timeAgo(r.created_at)}
              </p>
              <p className="text-xs font-semibold text-amber-400 break-words">{r.reason}{r.details ? ` — ${r.details}` : ''}</p>
              {r.content_snapshot && (
                <p className="text-xs text-foreground/80 bg-secondary/50 rounded-lg px-3 py-2 whitespace-pre-wrap break-words line-clamp-4">{r.content_snapshot}</p>
              )}
              {/* Boutons de 28 px, zone de tap portée à 40 px (pseudo-élément), d'où l'écart de 12 px entre deux lignes */}
              <div className="flex flex-wrap gap-x-2 gap-y-3 pt-1">
                {gone ? (
                  <button
                    type="button"
                    onClick={() => handleReport(r, 'close')}
                    disabled={busy}
                    className="relative after:absolute after:inset-x-0 after:-inset-y-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-muted-foreground text-xs font-semibold hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" /> Clore
                  </button>
                ) : confirmDelete === r.id ? (
                  <>
                    <span className="self-center text-xs text-foreground">Supprimer ?</span>
                    <button
                      type="button"
                      onClick={() => handleReport(r, 'delete')}
                      disabled={busy}
                      className="relative after:absolute after:inset-x-0 after:-inset-y-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />} Oui, supprimer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(null)}
                      disabled={busy}
                      className="relative after:absolute after:inset-x-0 after:-inset-y-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-muted-foreground text-xs font-semibold hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      Non
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => { hapticFeedback(); setConfirmDelete(r.id); }}
                      disabled={busy}
                      className="relative after:absolute after:inset-x-0 after:-inset-y-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/15 text-red-400 text-xs font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Supprimer le contenu
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReport(r, 'dismiss')}
                      disabled={busy}
                      className="relative after:absolute after:inset-x-0 after:-inset-y-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-muted-foreground text-xs font-semibold hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" /> Ignorer
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
