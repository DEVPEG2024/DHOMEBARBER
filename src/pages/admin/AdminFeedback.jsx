/**
 * Admin « Bugs et suggestions » (/admin/feedback) : messages envoyés par les clients depuis
 * Paramètres (entité `Feedback`). Filtres par type et statut, réponse au client (le serveur la lui
 * envoie en push), changement de statut, suppression. Lecture et écriture réservées à l'admin.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Trash2, Send, Smartphone, MapPin, MessageSquareText, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  FEEDBACK_QUERY_KEY, FEEDBACK_ADMIN_QUERY_KEY, FEEDBACK_TYPES, FEEDBACK_STATUSES,
  fetchAllFeedback, areaLabel, formatFeedbackDate, isBackendMissing,
} from '@/lib/feedbackApi';

const TYPE_FILTERS = [{ value: 'all', label: 'Tout' }, ...Object.entries(FEEDBACK_TYPES).map(([value, t]) => ({ value, label: `${t.emoji} ${t.label}s` }))];
const STATUS_FILTERS = [{ value: 'open', label: 'À traiter' }, ...Object.entries(FEEDBACK_STATUSES).map(([value, s]) => ({ value, label: s.label })), { value: 'all', label: 'Tous' }];

const isOpen = (f) => f.status === 'new' || f.status === 'in_progress' || !f.status;

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}

function FeedbackItem({ item, onUpdate, onDelete, busy }) {
  const [reply, setReply] = useState(item.admin_reply || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zoom, setZoom] = useState(false);
  const t = FEEDBACK_TYPES[item.type] || FEEDBACK_TYPES.idea;
  const ctx = item.context && typeof item.context === 'object' ? item.context : {};
  const area = areaLabel(item.area);
  const replyChanged = reply.trim() !== (item.admin_reply || '').trim();

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">
            {t.emoji} {t.label} · {formatFeedbackDate(item.created_at || item.created_date)}
          </p>
          <p className="text-sm font-semibold text-foreground truncate">{item.client_name || 'Client'}</p>
          {item.client_email && <p className="text-[11px] text-muted-foreground truncate">{item.client_email}</p>}
        </div>
        <select
          value={item.status || 'new'}
          onChange={e => onUpdate({ status: e.target.value })}
          disabled={busy}
          aria-label="Statut"
          className={`text-xs font-semibold rounded-full border px-2.5 py-1 bg-transparent shrink-0 ${(FEEDBACK_STATUSES[item.status] || FEEDBACK_STATUSES.new).className}`}
        >
          {Object.entries(FEEDBACK_STATUSES).map(([value, s]) => <option key={value} value={value} className="bg-background text-foreground">{s.label}</option>)}
        </select>
      </div>

      <p className="text-sm text-foreground whitespace-pre-line break-words">{item.message}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {area && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{area}</span>}
        {(ctx.platform || ctx.app_version) && (
          <span className="inline-flex items-center gap-1">
            <Smartphone className="w-3 h-3" />
            {[ctx.platform, ctx.app_version !== 'web' ? ctx.app_version : null, ctx.screen].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      {item.screenshot_url && (
        <button type="button" onClick={() => setZoom(true)} className="block">
          <img src={item.screenshot_url} alt="Capture du client" className="w-24 h-36 object-cover rounded-xl border border-border" />
        </button>
      )}

      <div className="space-y-2">
        <Textarea
          value={reply}
          onChange={e => setReply(e.target.value.slice(0, 1000))}
          placeholder="Répondre au client (il la reçoit en notification et la voit dans Paramètres)"
          rows={2}
          className="text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          {confirmDelete ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
              <Button size="sm" variant="destructive" onClick={onDelete} disabled={busy}>Supprimer</Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} className="text-muted-foreground" aria-label="Supprimer">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="sm"
            disabled={busy || !reply.trim() || !replyChanged}
            onClick={() => onUpdate({
              admin_reply: reply.trim(),
              ...(item.status === 'new' || !item.status ? { status: 'in_progress' } : {}),
            })}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" /> {item.admin_reply ? 'Modifier la réponse' : 'Répondre'}
          </Button>
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" onClick={() => setZoom(false)} aria-label="Fermer" className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
          <img src={item.screenshot_url} alt="Capture du client" className="max-w-full max-h-full object-contain rounded-xl" />
        </div>
      )}
    </div>
  );
}

export default function AdminFeedback() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open');
  const [busyId, setBusyId] = useState(null);

  const feedbackQ = useQuery({ queryKey: FEEDBACK_ADMIN_QUERY_KEY, queryFn: fetchAllFeedback, retry: false });
  const all = useMemo(() => (Array.isArray(feedbackQ.data) ? feedbackQ.data : []), [feedbackQ.data]);
  const backendMissing = feedbackQ.isError && isBackendMissing(feedbackQ.error);

  const items = useMemo(() => all.filter(f => {
    if (typeFilter !== 'all' && f.type !== typeFilter) return false;
    if (statusFilter === 'open') return isOpen(f);
    if (statusFilter !== 'all') return (f.status || 'new') === statusFilter;
    return true;
  }), [all, typeFilter, statusFilter]);

  const openCount = all.filter(isOpen).length;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEY });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }) => api.entities.Feedback.update(id, patch),
    onMutate: ({ id }) => setBusyId(id),
    onSuccess: (_, { patch }) => {
      invalidate();
      if (patch.admin_reply) toast.success('Réponse envoyée au client');
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la mise à jour'),
    onSettled: () => setBusyId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Feedback.delete(id),
    onMutate: (id) => setBusyId(id),
    onSuccess: () => { invalidate(); toast.success('Message supprimé'); },
    onError: (err) => toast.error(err?.message || 'Erreur lors de la suppression'),
    onSettled: () => setBusyId(null),
  });

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Clients</p>
        <h1 className="font-display text-2xl font-bold">Bugs et suggestions</h1>
        {!backendMissing && (
          <p className="text-sm text-muted-foreground mt-1">
            {openCount === 0 ? 'Rien à traiter.' : `${openCount} message${openCount > 1 ? 's' : ''} à traiter.`}
          </p>
        )}
      </div>

      {backendMissing && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 flex gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold">Le serveur ne connaît pas encore les retours clients.</p>
            <p className="text-xs mt-1 text-amber-200/80">
              Le correctif du backend (table <code>feedbacks</code>, entité <code>Feedback</code>) doit être déployé sur Heroku :
              voir <code>docs/backend-feedback.md</code>. En attendant, les clients envoient leur message par email au salon.
            </p>
          </div>
        </div>
      )}

      {!backendMissing && (
        <div className="space-y-2 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {TYPE_FILTERS.map(f => <Chip key={f.value} active={typeFilter === f.value} onClick={() => setTypeFilter(f.value)}>{f.label}</Chip>)}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {STATUS_FILTERS.map(f => <Chip key={f.value} active={statusFilter === f.value} onClick={() => setStatusFilter(f.value)}>{f.label}</Chip>)}
          </div>
        </div>
      )}

      {feedbackQ.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {feedbackQ.isError && !backendMissing && (
        <p className="text-sm text-red-400">{feedbackQ.error?.message || 'Erreur de chargement'}</p>
      )}

      {!feedbackQ.isLoading && !backendMissing && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <MessageSquareText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          {all.length === 0
            ? 'Aucun message pour l’instant. Les clients écrivent depuis Paramètres → Bugs et suggestions.'
            : 'Aucun message avec ces filtres.'}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {items.map(item => (
          <FeedbackItem
            key={item.id}
            item={item}
            busy={busyId === item.id}
            onUpdate={(patch) => updateMutation.mutate({ id: item.id, patch })}
            onDelete={() => deleteMutation.mutate(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
