import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, Trash2, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isNative } from '@/lib/capacitor';
import {
  NOTIFICATIONS_EVENT, readNotifications, markAllNotificationsRead, removeNotification,
  clearNotifications, syncServiceWorkerNotifications,
} from '@/lib/pushNotifications';

const clearBadge = () => {
  try { navigator.clearAppBadge?.()?.catch?.(() => {}); } catch { /* pastille non gérée */ }
};

// Notifications rangées sur l'appareil, par compte (voir pushNotifications.js) : celles reçues
// app ouverte, celles touchées depuis l'écran verrouillé et, sur le web, celles que le service
// worker a gardées app fermée (fusionnées à l'ouverture de la page).
export default function ClientNotifications() {
  const { user } = useAuth();
  const userId = user?.id;
  // Barber (page /admin/my-notifications) : ses réglages et des liens vers l'espace admin seulement,
  // car RequireAuth le renvoie hors des pages client. L'admin, lui, navigue librement sur les pages
  // client : réglages dans /settings (pas de fiche barber requise) et tous ses liens « Voir »
  const isBarber = user?.role === 'barber';
  const [notifications, setNotifications] = useState(() => (userId ? readNotifications(userId) : []));

  // Relit la liste et la marque comme lue : la page est sous les yeux du client
  const refresh = useCallback(() => {
    if (!userId) return;
    markAllNotificationsRead(userId);
    setNotifications(readNotifications(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    refresh();
    clearBadge();
    // Web : notifications reçues app fermée, gardées par le service worker
    syncServiceWorkerNotifications(userId)
      .catch(() => 0)
      .then(() => { if (!cancelled) refresh(); });
    // Notification reçue pendant que la page est ouverte
    window.addEventListener(NOTIFICATIONS_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATIONS_EVENT, refresh);
    };
  }, [userId, refresh]);

  const handleClear = () => {
    clearNotifications(userId);
    setNotifications([]);
    clearBadge();
  };

  const handleDelete = (id) => {
    removeNotification(id, userId);
    setNotifications(readNotifications(userId));
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "À l'instant";
    if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 right-0 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-5 pt-8 pb-28">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold mb-1">Centre</p>
              <h1 className="font-display text-3xl font-bold text-foreground">Notifications</h1>
              <div className="h-0.5 w-12 mt-2 rounded-full bg-gradient-to-r from-primary to-primary/30" />
            </div>
            {notifications.length > 0 && (
              <button onClick={handleClear}
                className="text-xs text-muted-foreground hover:text-red-400 transition-colors">
                Tout effacer
              </button>
            )}
          </div>
        </motion.div>

        {notifications.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto mb-4">
              <Bell className="w-7 h-7 text-muted-foreground/25" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Aucune notification</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
              Rappels de rendez-vous, créneaux last minute, drops et événements : les notifications
              reçues sur cet appareil s’affichent ici.
              {isNative ? ' Une notification effacée de l’écran verrouillé sans être touchée n’y figure pas.' : ''}
            </p>
            <Link to={isBarber ? '/admin/my-settings' : '/settings'} className="inline-flex items-center gap-1 mt-4 text-xs font-semibold text-primary">
              Gérer les notifications <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-2.5">
            {notifications.map((notif, i) => {
              const rawTarget = notif.url && notif.url !== '/notifications' ? notif.url : null;
              const target = rawTarget && (!isBarber || String(rawTarget).startsWith('/admin')) ? rawTarget : null;
              return (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 10) * 0.03 }}
                  className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {notif.title && <p className="text-sm font-semibold text-foreground break-words">{notif.title}</p>}
                      {notif.body && <p className="text-xs text-muted-foreground mt-1 leading-relaxed break-words">{notif.body}</p>}
                      <div className="flex items-center gap-3 mt-2">
                        <p className="text-[11px] text-muted-foreground/60">{formatDate(notif.date)}</p>
                        {target && (
                          <Link to={target} className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary">
                            Voir <ChevronRight className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                    <button onClick={() => handleDelete(notif.id)} aria-label="Supprimer la notification"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
