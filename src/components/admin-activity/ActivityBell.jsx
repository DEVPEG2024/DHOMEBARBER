import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, X, CheckCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { ACTIVITY_TYPES, formatActivityTime, useUnreadActivity } from '@/lib/adminActivity';

/**
 * Cloche « Activité clients » de l'en-tête admin : badge du nombre d'actions clients non lues
 * et panneau déroulant des 8 dernières.
 *
 * Fermeture : croix, tap sur une action (on navigue), Échap, et aussi tap à côté. La règle
 * « fenêtres fermées par la croix uniquement » protège une saisie en cours ; ce panneau est un menu
 * de lecture (aucun champ), comme le volet de navigation admin qui se replie déjà au tap à côté :
 * le laisser ouvert par-dessus la page serait plus gênant qu'utile.
 *
 * `placement` : 'mobile' (sous l'en-tête mobile, toute la largeur moins 8 px de chaque côté) ou
 * 'sidebar' (à droite du volet latéral, sur ordinateur). Panneau en `position: fixed`, borné à la
 * largeur de l'écran : il ne peut pas élargir la page. Rendu par portail dans `body` : le `backdrop-blur`
 * de l'en-tête mobile et le `transform` du volet latéral feraient sinon de leur boîte le repère du `fixed`.
 */

const TONE_DOT = {
  green: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  red: 'bg-red-500/15 text-red-400 ring-red-500/30',
  blue: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  violet: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  gray: 'bg-muted text-muted-foreground ring-border',
};

const MAX_ITEMS = 8;

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

const PANEL_POSITION = {
  mobile: 'fixed top-[calc(3.5rem+env(safe-area-inset-top,0px)+4px)] left-2 right-2 sm:left-auto sm:w-[380px]',
  sidebar: 'fixed top-3 left-[268px] w-[380px] max-w-[calc(100vw-280px)]',
};

export default function ActivityBell({ placement = 'mobile', className = '' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { unread, count, markAllSeen } = useUnreadActivity();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onPointer = (e) => {
      if (panelRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  if (user?.role !== 'admin') return null;

  const items = (unread || []).slice(0, MAX_ITEMS);
  const badge = count > 99 ? '99+' : String(count);

  const goTo = (link) => {
    setOpen(false);
    if (link) navigate(link);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={count > 0 ? `Activité clients : ${count} non lue${count > 1 ? 's' : ''}` : 'Activité clients'}
        aria-expanded={open}
        className={`relative w-10 h-10 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors ${className}`}
      >
        <Bell className={`w-4 h-4 ${count > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
        {count > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-4 text-center">
            {badge}
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Activité clients"
          className={`${PANEL_POSITION[placement] || PANEL_POSITION.mobile} z-[60] bg-card border border-border rounded-xl shadow-2xl shadow-black/40 flex flex-col max-h-[min(70vh,560px)]`}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Activité clients</p>
              <p className="text-xs text-muted-foreground">
                {count > 0 ? `${count} action${count > 1 ? 's' : ''} non lue${count > 1 ? 's' : ''}` : 'Tout est lu'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aucune nouvelle action client.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map(ev => {
                  const meta = ACTIVITY_TYPES?.[ev.type] || {};
                  const tone = TONE_DOT[meta.tone] || TONE_DOT.gray;
                  return (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => goTo(ev.link || meta.adminPath)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-secondary/60 transition-colors"
                      >
                        <span className={`w-8 h-8 shrink-0 rounded-full ring-1 flex items-center justify-center text-sm ${tone}`} aria-hidden>
                          {meta.emoji || '•'}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium truncate">{ev.title || meta.label}</span>
                            <span className="text-[11px] text-muted-foreground shrink-0">{formatActivityTime(ev.at)}</span>
                          </span>
                          {ev.clientName && (
                            <span className="block text-xs text-foreground/80 truncate">{ev.clientName}</span>
                          )}
                          {ev.detail && (
                            <span className="block text-xs text-muted-foreground line-clamp-2 break-words">{ev.detail}</span>
                          )}
                          {ev.amount != null && Number.isFinite(Number(ev.amount)) && (
                            <span className="block text-xs font-semibold text-primary">{euro.format(Number(ev.amount))}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {count > items.length && (
              <p className="px-4 py-2 text-xs text-muted-foreground text-center">
                + {count - items.length} autre{count - items.length > 1 ? 's' : ''} non lue{count - items.length > 1 ? 's' : ''}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border shrink-0">
            <button
              type="button"
              onClick={() => markAllSeen()}
              disabled={count === 0}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Tout marquer comme lu
            </button>
            <Link
              to="/admin/activity"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
            >
              Voir toute l'activité
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
