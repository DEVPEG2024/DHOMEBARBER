import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, Flag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { GANG_LEADERBOARD_QUERY_KEY } from '@/lib/gangCardApi';
import FeedSheet from '@/components/feed/FeedSheet';
import { invalidateFeed } from '@/lib/feed/feedCache';
import { useEscapeLayer } from '@/lib/feed/escapeStack';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
import { feedErrorText } from '@/lib/feed/useFeed';

/**
 * Menu « Signaler ou bloquer » d'une publication ou d'un commentaire (App Store 1.2 : ni l'un ni
 * l'autre ne se retire). `layer="top"` quand il s'ouvre depuis la fenêtre des commentaires.
 *
 * `target` : `{ type: 'post'|'comment', id, authorKey, authorEmail, authorName, content }`.
 * Publication du salon sans auteur (Last Minute, Moment du Gang posés par le serveur) : rien à
 * bloquer, le signalement reste possible.
 *
 * @param {object} props
 * @param {object} props.target
 * @param {'base'|'top'} [props.layer]
 * @param {() => void} props.onClose
 * @param {(target: object) => void} props.onReport
 * @param {(target: object) => void} props.onBlock   `{ key, email, name }` de l'auteur
 */
export default function PostMenu({ target, layer = 'base', onClose, onReport, onBlock }) {
  const isComment = target.type === 'comment';
  const canBlock = !!(target.authorKey || target.authorEmail);
  return (
    <FeedSheet title={`${isComment ? 'Commentaire' : 'Publication'} de ${target.authorName || 'un membre'}`} onClose={onClose} layer={layer}>
      <div className="pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <button
          type="button"
          onClick={() => onReport(target)}
          className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-secondary/60 hover:bg-secondary text-sm font-semibold text-foreground transition-colors"
        >
          <Flag className="w-4 h-4 text-amber-400" aria-hidden="true" />
          Signaler {isComment ? 'ce commentaire' : 'cette publication'}
        </button>
        {canBlock && (
          <button
            type="button"
            onClick={() => onBlock({ key: target.authorKey, email: target.authorEmail, name: target.authorName })}
            className="flex items-center gap-3 w-full px-4 py-3.5 mt-2 rounded-xl bg-secondary/60 hover:bg-secondary text-sm font-semibold text-red-400 transition-colors"
          >
            <Ban className="w-4 h-4" aria-hidden="true" />
            Bloquer {target.authorName || 'cet utilisateur'}
          </button>
        )}
        <button type="button" onClick={onClose} className="w-full px-4 py-3 mt-3 text-sm font-medium text-muted-foreground">
          Annuler
        </button>
      </div>
    </FeedSheet>
  );
}

/**
 * Confirmation de blocage : `UserBlock.create` sur la clé publique de l'auteur (l'email en repli :
 * staff, anciennes réponses), puis le fil (v2 et ancien), les blocages et la Team of the Season
 * sont relus (le membre bloqué en disparaît tout de suite). Fenêtre centrée, fermée par Annuler,
 * Échap ou le retour Android (jamais par un tap à côté). À placer dans un `<AnimatePresence>`.
 *
 * @param {object} props
 * @param {{ key?: string, email?: string, name?: string }} props.target
 * @param {'base'|'top'} [props.layer]
 * @param {() => void} props.onClose
 * @param {(target: object) => void} [props.onBlocked]  bloqué : appelé avant la relecture du fil
 */
export function BlockConfirm({ target, layer = 'base', onClose, onBlocked }) {
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [blocking, setBlocking] = useState(false);
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = blocking ? () => {} : onClose;
  useAndroidBack(true, () => closeRef.current?.());
  // Échap : seulement si c'est la fenêtre du dessus (pile partagée, src/lib/feed/escapeStack.js)
  useEscapeLayer(true, () => closeRef.current?.());

  // Focus dans la fenêtre à l'ouverture. À la fermeture, rendu à l'élément d'origine seulement si le
  // focus est encore dans cette fenêtre (ou retombé sur `body`, la fenêtre retirée de la page) et que
  // l'élément d'origine y est toujours ; si une autre fenêtre l'a pris, on n'y touche pas
  useEffect(() => {
    const previous = document.activeElement;
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });
    return () => {
      const active = document.activeElement;
      const stillHere = !active || active === document.body || (panel && panel.contains(active));
      if (!stillHere) return;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  // Tab tourne dans la fenêtre (premier ↔ dernier élément) : le reste de la page est sous le voile
  const onKeyDown = (e) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)];
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };

  const confirm = async () => {
    // On bloque sur la clé publique de l'auteur ; l'email ne sert plus que de repli
    const payload = target.key
      ? { blocked_key: target.key, blocked_name: target.name }
      : target.email
        ? { blocked_email: target.email, blocked_name: target.name }
        : null;
    if (!payload) {
      toast.error('Impossible de bloquer cet utilisateur');
      onClose();
      return;
    }
    setBlocking(true);
    try {
      await api.entities.UserBlock.create(payload);
      // Avant la relecture : la page retire ce qu'elle montre de lui (publication ouverte par un lien)
      onBlocked?.(target);
      qc.invalidateQueries({ queryKey: ['userBlocks'] });
      invalidateFeed(qc);
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['postComments'] });
      // Team of the Season en tête du fil : le membre bloqué en disparaît tout de suite
      qc.invalidateQueries({ queryKey: GANG_LEADERBOARD_QUERY_KEY });
      toast.success(`${target.name || 'Utilisateur'} bloqué. Tu ne verras plus ses publications.`);
      setBlocking(false);
      onClose();
    } catch (err) {
      toast.error(feedErrorText(err, 'Erreur lors du blocage'));
      setBlocking(false);
    }
  };

  const z = layer === 'top' ? 'z-[70]' : 'z-[60]';
  return createPortal(
    <>
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 ${z} bg-black/65 touch-none`}
      />
      <div className={`fixed inset-0 ${z} flex items-center justify-center p-5 pointer-events-none`}>
        <motion.div
          ref={panelRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="feed-block-title"
          aria-describedby="feed-block-text"
          tabIndex={-1}
          data-app-overlay=""
          onKeyDown={onKeyDown}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 pointer-events-auto outline-none"
        >
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
            <Ban className="w-6 h-6 text-red-400" aria-hidden="true" />
          </div>
          <h2 id="feed-block-title" className="font-display text-base font-bold text-center">Bloquer {target.name || 'cet utilisateur'} ?</h2>
          <p id="feed-block-text" className="text-xs text-muted-foreground text-center mt-2">
            Tu ne verras plus ses publications ni ses commentaires. Tu pourras le débloquer depuis tes Paramètres.
          </p>
          <div className="flex gap-2 mt-5">
            <button
              type="button"
              onClick={() => closeRef.current?.()}
              disabled={blocking}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-secondary text-foreground disabled:opacity-60"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={blocking}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-red-500 text-white disabled:opacity-60 flex items-center justify-center"
            >
              {blocking ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Blocage en cours" /> : 'Bloquer'}
            </button>
          </div>
        </motion.div>
      </div>
    </>,
    document.body,
  );
}
