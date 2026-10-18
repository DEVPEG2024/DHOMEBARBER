import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bug, Lightbulb, ChevronRight, MessageCircle } from 'lucide-react';
import { api } from '@/api/apiClient';
import {
  FEEDBACK_QUERY_KEY, FEEDBACK_TYPES, FEEDBACK_STATUSES, fetchMyFeedback, formatFeedbackDate,
} from '@/lib/feedbackApi';
import LoadError from '@/components/shared/LoadError';
import { useAndroidBack } from '@/lib/useAndroidBack';
import FeedbackSheet from './FeedbackSheet';

const ACTIONS = [
  { type: 'bug', icon: Bug, label: 'Signaler un bug', desc: 'Quelque chose ne marche pas comme prévu' },
  { type: 'idea', icon: Lightbulb, label: 'Proposer une amélioration', desc: 'Une idée, une envie, une fonction qui manque' },
];

/** Bloc « Bugs et suggestions » de Paramètres : deux entrées + le suivi des envois du client. */
export default function FeedbackSection({ user }) {
  const queryClient = useQueryClient();
  const [openType, setOpenType] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const { data, error, isError, refetch, isFetching } = useQuery({
    // Préfixe FEEDBACK_QUERY_KEY gardé : les invalidations existantes (envoi, admin) s'y appliquent
    queryKey: [...FEEDBACK_QUERY_KEY, 'mine', user?.email],
    queryFn: () => fetchMyFeedback(user?.email),
    enabled: !!user?.email,
  });
  const mine = Array.isArray(data) ? data : [];

  // Android : le bouton retour ferme la fenêtre (comme sa croix), la saisie n'est pas perdue
  useAndroidBack(!!openType, () => setOpenType(null));

  // Repli par email tant que le serveur ne connaît pas l'entité
  const { data: salonSettings = [] } = useQuery({
    queryKey: ['salonSettings'],
    queryFn: () => api.entities.SalonSettings.list(),
    enabled: !!openType,
  });
  const salonEmail = salonSettings?.[0]?.email || '';

  return (
    <>
      <div className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl overflow-hidden mb-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-4 pb-2">Bugs et suggestions</p>
        {ACTIONS.map(({ type, icon: Icon, label, desc }) => (
          <button
            key={type}
            type="button"
            onClick={() => setOpenType(type)}
            className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-white/5 transition-colors border-t border-white/5 first-of-type:border-t-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ))}

        {isError && !data && (
          <div className="border-t border-white/5 px-4 pt-3 pb-4">
            <LoadError compact what="vos envois" error={error} onRetry={refetch} retrying={isFetching} />
          </div>
        )}

        {mine.length > 0 && (
          <div className="border-t border-white/5 px-4 pt-3 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">Mes envois</p>
            <ul className="space-y-2">
              {mine.map(f => {
                const t = FEEDBACK_TYPES[f.type] || FEEDBACK_TYPES.idea;
                const s = FEEDBACK_STATUSES[f.status] || FEEDBACK_STATUSES.new;
                const open = expanded === f.id;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : f.id)}
                      aria-expanded={open}
                      className="w-full text-left rounded-xl bg-white/4 border border-white/8 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">{t.emoji} {t.label} · {formatFeedbackDate(f.created_at || f.created_date)}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${s.className}`}>{s.label}</span>
                      </div>
                      <p className={`text-sm text-foreground mt-1 whitespace-pre-line break-words ${open ? '' : 'line-clamp-2'}`}>{f.message}</p>
                      {f.admin_reply && (
                        <div className="mt-2 rounded-lg bg-primary/10 border border-primary/20 p-2.5 flex gap-2">
                          <MessageCircle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                          <p className={`text-xs text-foreground whitespace-pre-line break-words ${open ? '' : 'line-clamp-2'}`}>
                            <span className="font-semibold text-primary">Le salon : </span>{f.admin_reply}
                          </p>
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Portail : le bloc parent est animé (transform), un `fixed` y serait piégé */}
      {createPortal(
        <AnimatePresence>
          {openType && (
            <FeedbackSheet
              key="feedback-sheet"
              type={openType}
              salonEmail={salonEmail}
              onClose={() => setOpenType(null)}
              onSent={() => queryClient.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEY })}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
