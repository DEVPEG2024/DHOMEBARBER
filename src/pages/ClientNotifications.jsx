import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, Trash2 } from 'lucide-react';

const STORAGE_KEY = 'dhome_notifications';

// Helper to get/set notifications in localStorage
function getNotifications() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveNotifications(notifs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs));
}

export function addNotification({ title, body }) {
  const notifs = getNotifications();
  notifs.unshift({
    id: Date.now(),
    title,
    body,
    date: new Date().toISOString(),
    read: false,
  });
  // Keep max 50
  saveNotifications(notifs.slice(0, 50));
}

export function getUnreadCount() {
  return getNotifications().filter(n => !n.read).length;
}

export default function ClientNotifications() {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const notifs = getNotifications();
    // Mark all as read
    const updated = notifs.map(n => ({ ...n, read: true }));
    saveNotifications(updated);
    setNotifications(updated);
  }, []);

  const handleClear = () => {
    saveNotifications([]);
    setNotifications([]);
  };

  const handleDelete = (id) => {
    const updated = notifications.filter(n => n.id !== id);
    saveNotifications(updated);
    setNotifications(updated);
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return "À l'instant";
    if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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
            <p className="text-xs text-muted-foreground">Vous serez notifié des rappels et promotions</p>
          </motion.div>
        ) : (
          <div className="space-y-2.5">
            {notifications.map((notif, i) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-2xl border border-white/8 bg-white/4 backdrop-blur-xl p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{notif.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{notif.body}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-2">{formatDate(notif.date)}</p>
                  </div>
                  <button onClick={() => handleDelete(notif.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
