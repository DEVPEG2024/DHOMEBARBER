import React, { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ACTIVITY_TYPES } from '@/lib/adminActivity';
import { ALERT_GROUPS, useAdminAlertPrefs } from '@/lib/adminAlerts';
import LoadError from '@/components/shared/LoadError';

/**
 * Réglages des alertes de l'admin : pour chaque type d'action client, « Notifier » (push sur le
 * téléphone + toast dans l'app) ou seulement « Noté dans le fil ». Toutes les actions restent
 * dans Activité clients quel que soit le réglage. Fermeture par la croix ou « Annuler ».
 */
export default function AlertSettingsDialog({ open, onOpenChange }) {
  const { prefs, isLoading, isError, error, refetch, isFetching, settings, save, saving } = useAdminAlertPrefs();
  const [draft, setDraft] = useState({});

  // Copie de travail remise à jour à chaque ouverture
  useEffect(() => {
    if (open) setDraft({ ...prefs });
  }, [open, settings?.admin_alerts]);

  const allTypes = ALERT_GROUPS.flatMap(g => g.types);
  const enabledCount = allTypes.filter(t => draft[t] !== false).length;
  const setType = (type, on) => setDraft(d => {
    const next = { ...d };
    if (on) delete next[type]; else next[type] = false;
    return next;
  });
  const setAll = (on) => setDraft(on ? {} : Object.fromEntries(allTypes.map(t => [t, false])));

  const submit = async () => {
    try {
      await save(draft);
      toast.success('Réglages des alertes enregistrés ✓');
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.message && !/^HTTP \d+$/.test(err.message)
        ? err.message
        : 'Impossible d’enregistrer les réglages. Réessayez.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Réglages des alertes</DialogTitle>
          <DialogDescription>
            Choisissez les actions des clients qui vous envoient une notification. Les autres sont
            seulement notées dans Activité clients, sans vous déranger.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-secondary animate-pulse" />)}
          </div>
        ) : isError ? (
          <LoadError compact what="les réglages des alertes" error={error} onRetry={refetch} retrying={isFetching} />
        ) : !settings ? (
          <p className="text-sm text-muted-foreground">Paramètres du salon introuvables : enregistrez d’abord la page Paramètres.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{enabledCount} / {allTypes.length} avec notification</span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setAll(true)}>Tout notifier</Button>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setAll(false)}>Tout en silencieux</Button>
              </div>
            </div>

            <div className="space-y-4">
              {ALERT_GROUPS.map(group => (
                <section key={group.title}>
                  <h3 className="text-[11px] uppercase tracking-[0.15em] text-primary font-semibold mb-1.5">{group.title}</h3>
                  <div className="rounded-xl border border-border divide-y divide-border">
                    {group.types.map(type => {
                      const meta = ACTIVITY_TYPES[type] || { label: type, emoji: '🔔' };
                      const on = draft[type] !== false;
                      const id = `alert-${type}`;
                      return (
                        <div key={type} className="flex items-center gap-3 px-3 py-2.5 min-w-0">
                          <span className="text-lg shrink-0" aria-hidden="true">{meta.emoji}</span>
                          <label htmlFor={id} className="flex-1 min-w-0 cursor-pointer">
                            <span className="block text-sm font-medium text-foreground">{meta.label}</span>
                            <span className={`flex items-center gap-1 text-[11px] ${on ? 'text-primary' : 'text-muted-foreground'}`}>
                              {on
                                ? <><BellRing className="w-3 h-3" aria-hidden="true" /> Notification</>
                                : <><BellOff className="w-3 h-3" aria-hidden="true" /> Noté dans le fil, sans notification</>}
                            </span>
                          </label>
                          <Switch id={id} checked={on} onCheckedChange={(v) => setType(type, v)} aria-label={`Notification : ${meta.label}`} />
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground">
              S’applique aux notifications sur votre téléphone et aux messages qui s’affichent dans l’app.
              Les actions faites par vous ou un barber ne notifient jamais.
            </p>
          </>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving || isLoading || isError || !settings}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
