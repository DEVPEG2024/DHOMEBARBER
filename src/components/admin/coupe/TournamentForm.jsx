/**
 * Créer ou modifier un tournoi (planche validée le 3 nov. 2026, écran 11). Fenêtre fermée par sa
 * croix (ou le retour Android, géré par DialogContent).
 * - Créer : nom, jour et heure (heure de Paris, 08:00–20:00, au moins 30 min après maintenant),
 *   8 ou 16 joueurs, « Prévenir les joueurs de la Coupe maintenant » → `POST /coupe/admin/tournaments`.
 * - Modifier (tournoi encore ouvert) : nom et heure seulement → `PATCH`, seuls les champs changés.
 * Le serveur reste juge : son message s'affiche tel quel dans la fenêtre.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { adminErrorMessage, isUncertainSend } from '@/lib/adminErrors';
import { coupeTournamentKey, invalidateTournaments } from '@/lib/coupe/coupeApi';
import { createTournament, updateTournament } from './tournoisAdminApi';
import {
  NAME_MAX, START_MAX, START_MIN, checkForm, defaultStart, durationMin, formSummary, isNight, msOf, parisClockOf,
  parisKeyOf, startsAtValue, suggestedName,
} from './tournoisAdminFormat';

const INPUT = 'h-11 rounded-xl bg-secondary/60 border-border text-[15px]';

function emptyForm() {
  const { day, time } = defaultStart();
  return { name: suggestedName(day), day, time, size: 8, notify: true };
}

function formOf(t) {
  const at = msOf(t?.starts_at);
  return {
    name: String(t?.name || ''),
    day: at == null ? '' : parisKeyOf(at),
    time: at == null ? '' : parisClockOf(at),
    size: Number(t?.size) === 16 ? 16 : 8,
    notify: false,
  };
}

function Field({ id, label, children }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={id} className="text-xs font-semibold text-foreground/85">{label}</label>
      {children}
    </div>
  );
}

/**
 * `tournament` : celui à modifier (null = création). `onCreated(t)` : après la création (le suivi
 * s'ouvre). `onClose()` : fermeture.
 */
export default function TournamentForm({ open, tournament = null, onClose, onCreated }) {
  const editing = !!tournament;
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  // Valeurs du tournoi prises à l'ouverture : le suivi le relit toutes les 3 s, la saisie en cours
  // ne doit jamais être écrasée par une relecture
  const [initial, setInitial] = useState(null);

  // Formulaire remis à neuf à chaque ouverture (seulement à l'ouverture)
  useEffect(() => {
    if (!open) return;
    const init = tournament ? formOf(tournament) : null;
    setInitial(init);
    setForm(init ? { ...init } : emptyForm());
    setError('');
  }, [open]);

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setError('');
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!editing) {
        return createTournament({ name: form.name, startsAt: startsAtValue(form.day, form.time), size: form.size, notify: form.notify });
      }
      const patch = {};
      if (form.name.trim() !== initial.name.trim()) patch.name = form.name;
      if (form.day !== initial.day || form.time !== initial.time) patch.startsAt = startsAtValue(form.day, form.time);
      if (!Object.keys(patch).length) return null;
      return updateTournament(tournament.id, patch);
    },
    onSuccess: (data) => {
      if (data && typeof data === 'object' && data.id) queryClient.setQueryData(coupeTournamentKey(data.id), data);
      invalidateTournaments(queryClient);
      if (editing) {
        toast.success(data ? 'Tournoi modifié' : 'Rien n’a changé');
        onClose();
        return;
      }
      toast.success(form.notify ? 'Tournoi publié, les joueurs sont prévenus' : 'Tournoi publié');
      onCreated?.(data);
    },
    onError: (err) => {
      if (!editing && isUncertainSend(err)) {
        // Réponse perdue : le tournoi a peut-être été créé (et annoncé) ; la liste le dira
        invalidateTournaments(queryClient);
        setError('Pas de connexion internet : le tournoi a peut-être déjà été publié. Vérifiez la liste avant de recommencer.');
        return;
      }
      setError(adminErrorMessage(err, editing ? 'Modification impossible. Réessayez.' : 'Publication impossible. Réessayez.'));
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (mutation.isPending) return;
    const problem = checkForm(form);
    if (problem) {
      setError(problem);
      return;
    }
    mutation.mutate();
  };

  // À l'ouverture : le nom prend le focus avec une souris ; sur un écran tactile, le clavier
  // cacherait la moitié du formulaire, le focus va à la fenêtre
  const contentRef = useRef(null);
  const focusOnOpen = (event) => {
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (!coarse) return;
    event.preventDefault();
    contentRef.current?.focus({ preventScroll: true });
  };

  const today = parisKeyOf(Date.now());
  const night = form.notify && isNight();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !mutation.isPending) onClose(); }}>
      <DialogContent
        ref={contentRef}
        tabIndex={-1}
        onOpenAutoFocus={focusOnOpen}
        className="bg-card border-border max-w-md max-h-[92vh] overflow-y-auto focus:outline-none"
      >
        <DialogHeader className="text-left">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#ebc15e] font-semibold">Admin · La Coupe du Gang</p>
          <DialogTitle className="font-display text-xl">{editing ? 'Modifier le tournoi' : 'Nouveau tournoi'}</DialogTitle>
          <DialogDescription className="text-xs">
            {editing ? 'Le nom et l’heure se changent tant que le tournoi n’a pas commencé.' : 'Tournoi en direct, élimination directe, règlement v2.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex flex-col gap-3.5 min-w-0">
          <Field id="tournoi-nom" label="Nom">
            <Input
              id="tournoi-nom"
              value={form.name}
              maxLength={NAME_MAX}
              onChange={(e) => set({ name: e.target.value })}
              className={INPUT}
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2.5 min-w-0">
            <Field id="tournoi-jour" label="Jour">
              <Input
                id="tournoi-jour"
                type="date"
                min={today}
                value={form.day}
                onChange={(e) => set({ day: e.target.value })}
                className={`${INPUT} min-w-0`}
              />
            </Field>
            <Field id="tournoi-heure" label="Heure (20:00 au plus tard)">
              <Input
                id="tournoi-heure"
                type="time"
                min={START_MIN}
                max={START_MAX}
                step={300}
                value={form.time}
                onChange={(e) => set({ time: e.target.value })}
                className={`${INPUT} min-w-0`}
              />
            </Field>
          </div>
          <p className="-mt-1.5 text-[11px] text-muted-foreground">Heure de Paris · début entre 08:00 et 20:00, au moins 30 min après maintenant.</p>

          <div className="flex flex-col gap-1.5">
            <span id="tournoi-joueurs" className="text-xs font-semibold text-foreground/85">Joueurs</span>
            {editing ? (
              <p className="text-sm text-muted-foreground">{form.size} joueurs · ~{durationMin(form.size)} min (ne se change plus)</p>
            ) : (
              <div role="group" aria-labelledby="tournoi-joueurs" className="flex gap-1 rounded-xl border border-border bg-secondary/40 p-1">
                {[8, 16].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={form.size === n}
                    onClick={() => set({ size: n })}
                    className={`flex-1 h-9 rounded-lg text-sm font-bold transition-colors ${form.size === n ? 'bg-[#e01f26] text-white' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {n} · ~{durationMin(n)} min
                  </button>
                ))}
              </div>
            )}
          </div>

          {!editing && (
            <>
              <fieldset className="flex flex-col gap-1.5 min-w-0">
                <legend className="text-xs font-semibold text-foreground/85 mb-1.5">Format</legend>
                <p className="flex items-center gap-2.5 h-10 px-3 rounded-xl border border-[#e01f26] bg-[#e01f26]/10 text-sm min-w-0">
                  <Clock className="w-4 h-4 shrink-0 text-[#e01f26]" aria-hidden="true" />
                  <span className="min-w-0 truncate">En direct, à heure fixe</span>
                  <span className="ml-auto shrink-0 text-[11px] font-semibold text-[#ebc15e]">Recommandé</span>
                </p>
                {['Sur la semaine, un tour par jour', 'Soirée au salon, à deux sur un téléphone'].map((label) => (
                  <p key={label} className="flex items-center gap-2.5 min-h-10 py-2 px-3 rounded-xl border border-border bg-secondary/30 text-sm text-muted-foreground opacity-60 min-w-0">
                    <span className="min-w-0">{label}</span>
                    <span className="ml-auto shrink-0 text-[11px] font-semibold">Plus tard</span>
                  </p>
                ))}
              </fieldset>

              <p className="flex items-center gap-2 text-[13px] text-foreground/85">
                <Users className="w-4 h-4 shrink-0 text-[#ebc15e]" aria-hidden="true" />
                Ouvert à tout le monde : clients, barbers, salon
              </p>

              <div className="flex items-start gap-3 min-w-0">
                <Switch
                  id="tournoi-prevenir"
                  checked={form.notify}
                  onCheckedChange={(v) => set({ notify: !!v })}
                  aria-label="Prévenir les joueurs de la Coupe maintenant"
                  className="mt-0.5 data-[state=checked]:bg-[#e01f26]"
                />
                <label htmlFor="tournoi-prevenir" className="min-w-0 text-sm leading-snug">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Bell className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> Prévenir les joueurs de la Coupe maintenant
                  </span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    Une notification à la publication. Aucune notification ne part entre 21:00 et 08:00.
                    {night ? ` Il est ${parisClockOf(Date.now())} : l’annonce ne partira pas maintenant.` : ''}
                  </span>
                </label>
              </div>
            </>
          )}

          <p className="text-xs text-muted-foreground leading-relaxed">{formSummary(form)}</p>

          {error && (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500 break-words">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={mutation.isPending}
            className="h-12 rounded-xl bg-[#e01f26] text-white hover:bg-[#c81a20] font-display text-lg font-bold uppercase tracking-wide"
          >
            {mutation.isPending
              ? (editing ? 'Enregistrement…' : 'Publication…')
              : (editing ? 'Enregistrer' : 'Publier le tournoi')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
