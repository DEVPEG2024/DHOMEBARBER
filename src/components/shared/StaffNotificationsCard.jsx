import React, { useState, useEffect } from 'react';
import { Bell, Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/components/shared/LoadError';
import { isPushSupported, isSubscribed, subscribeToPush, unsubscribeFromPush, getPushPermission, syncPushSubscription } from '@/lib/pushNotifications';
import { isNative, platform } from '@/lib/capacitor';

/**
 * Notifications du staff sur cet appareil : nouveaux rendez-vous et annulations, réponse à une
 * demande de congé, ménage du jour (et activité des clients pour l'admin). Recours permanent (la
 * fenêtre d'activation ne revient que 2 fois) et seul moyen de les couper depuis l'espace pro.
 * Utilisée dans Mes paramètres (barber) et Paramètres (admin). Même logique que Settings.jsx.
 * L'interrupteur agit tout de suite : il ne dépend d'aucun bouton Sauvegarder.
 */
export default function StaffNotificationsCard({
  title = 'Notifications',
  description = 'Nouveaux rendez-vous, annulations, congés, ménage du jour',
}) {
  const supported = isPushSupported();
  const [permission, setPermission] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;
    let previous = null;
    const refresh = async () => {
      const perm = await getPushPermission().catch(() => 'unsupported');
      if (cancelled) return;
      setPermission(perm);
      if (perm === 'granted' && previous && previous !== 'granted') syncPushSubscription();
      previous = perm;
      const sub = perm === 'denied' ? false : await isSubscribed().catch(() => false);
      if (!cancelled) setEnabled(sub);
    };
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); };
  }, [supported]);

  const denied = permission === 'denied';
  const canOpenSettings = isNative && platform === 'ios';
  const toggle = async () => {
    if (denied || busy) return;
    setBusy(true);
    try {
      if (enabled) {
        await unsubscribeFromPush();
        setEnabled(false);
        toast.success('Notifications désactivées');
      } else {
        await subscribeToPush();
        setEnabled(true);
        setPermission('granted');
        syncPushSubscription();
        toast.success('Notifications activées');
      }
    } catch (err) {
      const perm = await getPushPermission().catch(() => null);
      if (perm) setPermission(perm);
      if (perm === 'denied') toast.error('Notifications refusées sur cet appareil');
      else toast.error(friendlyError(err, 'Erreur notifications', { foreign: "Impossible d'activer les notifications sur cet appareil. Réessayez." }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <button type="button" onClick={toggle} disabled={busy || !supported || denied}
        className="flex items-center justify-between w-full gap-3 text-left disabled:opacity-60">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-[11px] text-muted-foreground">
              {!supported
                ? "Ajoutez l'app à l'écran d'accueil, ou utilisez l'app du téléphone"
                : denied
                  ? (isNative ? 'Désactivées dans les réglages du téléphone' : 'Bloquées dans les réglages du navigateur')
                  : description}
            </p>
          </div>
        </div>
        <div className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${enabled ? 'bg-primary' : 'bg-muted'}`}>
          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </div>
      </button>
      {denied && (
        <div className="mt-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Vous ne serez prévenu ni des nouveaux rendez-vous ni des annulations.{' '}
            {canOpenSettings
              ? 'Réactivez-les en un geste dans les réglages.'
              : isNative
                ? (platform === 'android'
                  ? 'Pour les réactiver : Paramètres du téléphone → Applications → D’Home Barber → Notifications.'
                  : 'Pour les réactiver : Réglages → D’Home Barber → Notifications.')
                : 'Pour les réactiver : autorisez les notifications pour dhomebarber.fr dans les réglages du navigateur.'}
          </p>
          {canOpenSettings && (
            <button type="button" onClick={() => { window.location.href = 'app-settings:'; }}
              className="mt-2.5 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
              <SettingsIcon className="w-3.5 h-3.5" /> Ouvrir les réglages
            </button>
          )}
        </div>
      )}
    </div>
  );
}
