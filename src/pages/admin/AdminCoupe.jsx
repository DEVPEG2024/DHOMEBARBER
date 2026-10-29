/**
 * Admin « La Coupe du Gang » (/admin/coupe, admin seulement, catégorie Clients du menu, 29 oct.
 * 2026). Contrat : docs/fonctions/coupe-du-gang-contrat.md, sections 2 et 5.3.
 * - Chiffres du jour et de la saison (mois civil de Paris) ;
 * - paires qui jouent le plus ensemble sur 30 jours : tous les matchs comptent (décision du
 *   propriétaire du 29 oct. 2026), deux complices peuvent donc se faire gagner des points, cette
 *   liste sert à repérer les matchs arrangés ;
 * - signalements des joueurs (nom, comportement, triche…) : « Traité » ou « Ignorer » ; le compte
 *   signalé (email, fiche du client) et, avec confirmation, « Exclure des classements » (Coupe et
 *   carte Gang, contrat section 7), « Réintégrer », « Remettre ses points à zéro » ;
 * - rappel de la coupure d'urgence : variable Heroku `COUPE_WS=off`.
 * Données : `GET /coupe/admin/overview`, `PATCH /coupe/admin/reports/:id`,
 * `POST` / `DELETE /coupe/admin/players/:keyHash/ban`, `POST /coupe/admin/players/:keyHash/reset`
 * (src/lib/coupe/coupeApi.js). La fiche du client est celle des Cartes Gang (GangClientSheet).
 */
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Ban, Check, Flag, Mail, Power, RefreshCw, RotateCcw, Trophy, UserCheck, UserCircle, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/lib/AuthContext';
import LoadError, { friendlyError, queryFailed } from '@/components/shared/LoadError';
import GangClientSheet from '@/components/gang-admin/GangClientSheet';
import {
  COUPE_REPORT_REASONS, invalidateCoupe, resetCoupePlayer, setCoupePlayerBanned, setCoupeReportStatus,
  useCoupeAdminOverview,
} from '@/lib/coupe/coupeApi';
import {
  CoupeRoleMark, coupePlayerName, coupeSeasonLabel, currentCoupeSeason,
} from '@/components/home/GamesSection';

const REPORT_STATUS = {
  pending: { label: 'À traiter', className: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  handled: { label: 'Traité', className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  dismissed: { label: 'Ignoré', className: 'bg-secondary text-muted-foreground border-border' },
};

const reasonLabel = (reason) => COUPE_REPORT_REASONS.find((r) => r.value === reason)?.label || 'Autre';
const count = (v) => Math.max(0, Math.round(Number(v) || 0));
const plural = (n, one, many) => (n === 1 ? one : many);

/** « 29 oct. · 14:05 », heure de Paris. */
function formatParis(iso) {
  const d = new Date(iso);
  if (!iso || !Number.isFinite(d.getTime())) return '';
  try {
    const day = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' }).format(d);
    const time = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(d);
    return `${day} · ${time}`;
  } catch {
    return '';
  }
}

/** Rôle d'un joueur d'une paire (`{ name, role }` ou simple nom). */
const roleOf = (player) => (player && typeof player === 'object' ? player.role : null);

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 min-w-0">
      <p className="text-[11px] text-muted-foreground truncate">{label}</p>
      <p className="font-display text-2xl font-bold text-foreground tabular-nums leading-tight mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
    </div>
  );
}

function PanelTitle({ icon: Icon, children, aside }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <h2 className="flex items-start gap-2 text-sm font-bold leading-snug text-foreground min-w-0">
        <Icon className="w-4 h-4 mt-0.5 text-primary shrink-0" aria-hidden="true" />
        <span className="min-w-0">{children}</span>
      </h2>
      {aside && <span className="pt-0.5 text-[11px] text-muted-foreground shrink-0">{aside}</span>}
    </div>
  );
}

function Player({ player }) {
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className="font-semibold text-foreground truncate">{coupePlayerName(player)}</span>
      <CoupeRoleMark role={roleOf(player)} />
    </span>
  );
}

function TopPairs({ pairs }) {
  const rows = Array.isArray(pairs) ? pairs.filter((p) => p && typeof p === 'object') : [];
  const max = Math.max(1, ...rows.map((p) => count(p.matches)));
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <PanelTitle icon={Users} aside="30 derniers jours">Paires qui jouent le plus ensemble</PanelTitle>
      <p className="-mt-1 mb-3 text-[11px] leading-snug text-muted-foreground">
        Tous les matchs comptent pour le classement : deux complices peuvent se faire gagner des points.
        Une paire qui revient très souvent, surtout en matchs à points, mérite un coup d’œil.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
          Aucun match en ligne sur les 30 derniers jours.
        </p>
      ) : (
        <ol className="space-y-3">
          {rows.map((p, i) => {
            const matches = count(p.matches);
            const ranked = count(p.ranked);
            return (
              <li key={`${coupePlayerName(p.a)}-${coupePlayerName(p.b)}-${i}`} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 text-sm min-w-0">
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                    <span className="text-[11px] text-muted-foreground tabular-nums w-5 shrink-0">{i + 1}.</span>
                    <Player player={p.a} />
                    <span className="text-muted-foreground" aria-hidden="true">⇄</span>
                    <span className="sr-only">contre</span>
                    <Player player={p.b} />
                  </p>
                  <p className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    <span className="font-bold text-foreground">{matches}</span> {plural(matches, 'match', 'matchs')}
                    <span className="block text-[10px]">dont {ranked} à points</span>
                  </p>
                </div>
                <div className="mt-1.5 ml-6 h-1.5 rounded-full bg-secondary overflow-hidden" aria-hidden="true">
                  {/* Barre en échelle horizontale (transform), proportionnelle au nombre de matchs */}
                  <div
                    className="h-full w-full origin-left rounded-full bg-[#ebc15e] transition-transform duration-700"
                    style={{ transform: `scaleX(${matches / max})` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// Actions sur le compte signalé : confirmation, puis message
const PLAYER_ACTIONS = {
  ban: {
    title: (name) => `Exclure ${name} des classements ?`,
    text: 'Il disparaît du classement de la Coupe et de celui des cartes Gang, et ne peut plus s’y remettre lui-même. Il peut toujours jouer, sans figurer au classement.',
    confirm: 'Exclure',
    done: (name) => `${name} est exclu des classements`,
    danger: true,
  },
  unban: {
    title: (name) => `Réintégrer ${name} ?`,
    text: 'Il pourra de nouveau apparaître dans les classements, s’il le choisit.',
    confirm: 'Réintégrer',
    done: (name) => `${name} peut de nouveau apparaître dans les classements`,
    danger: false,
  },
  reset: {
    title: (name) => `Remettre les points de ${name} à zéro ?`,
    text: 'Ses Points de Coupe de la saison et du classement général repartent de 0. Ses matchs restent dans l’historique. C’est définitif.',
    confirm: 'Remettre à zéro',
    done: (name) => `Points de ${name} remis à zéro`,
    danger: true,
  },
};

function ReportItem({ report, busy, onStatus, banned, playerBusy, onPlayerAction, onOpenClient }) {
  const status = REPORT_STATUS[report.status] || REPORT_STATUS.pending;
  const pending = !report.status || report.status === 'pending';
  const keyHash = report.reported_key_hash ? String(report.reported_key_hash) : '';
  const email = report.reported_email ? String(report.reported_email) : '';
  // Fiche du client (Cartes Gang) : seulement un compte client encore là (un barber a sa fiche dans Équipe)
  const canOpenClient = !!report.reported_user_id && (!report.reported_role || report.reported_role === 'user');
  return (
    <li className={`rounded-2xl border border-border bg-card p-4 space-y-2 min-w-0 ${pending ? '' : 'opacity-70'}`}>
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground min-w-0">
            <span className="truncate">{coupePlayerName(report.reported_name)}</span>
            {banned && (
              <span className="shrink-0 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-px text-[10px] font-semibold text-red-500">
                Exclu
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {reasonLabel(report.reason)}{report.created_at ? ` · ${formatParis(report.created_at)}` : ''}
          </p>
          {email ? (
            <a href={`mailto:${email}`} className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground min-w-0">
              <Mail className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{email}</span>
            </a>
          ) : (
            !report.reported_user_id && <p className="mt-0.5 text-[11px] text-muted-foreground">Compte supprimé</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${status.className}`}>
          {status.label}
        </span>
      </div>
      {report.details && (
        <p className="text-sm text-foreground whitespace-pre-line break-words">{report.details}</p>
      )}
      {(canOpenClient || keyHash) && (
        <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label={`Compte de ${coupePlayerName(report.reported_name)}`}>
          {canOpenClient && (
            <Button size="sm" variant="outline" onClick={() => onOpenClient(report)}>
              <UserCircle className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Fiche du client
            </Button>
          )}
          {keyHash && (banned ? (
            <Button size="sm" variant="outline" disabled={playerBusy} onClick={() => onPlayerAction('unban', report)}>
              <UserCheck className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Réintégrer
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={playerBusy} onClick={() => onPlayerAction('ban', report)} className="text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-500">
              <Ban className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Exclure des classements
            </Button>
          ))}
          {keyHash && (
            <Button size="sm" variant="outline" disabled={playerBusy} onClick={() => onPlayerAction('reset', report)}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Remettre ses points à zéro
            </Button>
          )}
        </div>
      )}
      {pending && (
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus('dismissed')} className="text-muted-foreground">
            <X className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Ignorer
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onStatus('handled')} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Check className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Traité
          </Button>
        </div>
      )}
    </li>
  );
}

function KillSwitchReminder({ off = false }) {
  return (
    <section className={`rounded-2xl border p-4 text-xs leading-relaxed ${off ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-card'}`}>
      <p className="flex items-start gap-2 text-sm font-bold leading-snug text-foreground">
        <Power className={`w-4 h-4 mt-0.5 shrink-0 ${off ? 'text-amber-500' : 'text-primary'}`} aria-hidden="true" />
        <span className="min-w-0">
          Coupure d’urgence : variable Heroku{' '}
          <code className="whitespace-nowrap rounded bg-secondary px-1.5 py-0.5 text-[12px]">COUPE_WS=off</code>
        </span>
      </p>
      <p className="mt-1.5 text-muted-foreground">
        Le jeu en ligne est alors refusé et La Coupe du Gang disparaît de l’app (accueil, fil, carte Gang,
        Mon espace, profils des barbers). Poser la variable redémarre le serveur : les matchs en cours
        s’arrêtent, sans points. Pour rouvrir le jeu, supprimer la variable.
      </p>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground break-all">
        heroku config:set COUPE_WS=off --app dhomebarber-api<br />
        heroku config:unset COUPE_WS --app dhomebarber-api
      </p>
    </section>
  );
}

export default function AdminCoupe() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();
  const query = useCoupeAdminOverview({ enabled: isAdmin });
  const { data, isPending, error, refetch, isFetching } = query;
  const [busyId, setBusyId] = useState(null);

  // 404 { code: 'disabled' } : jeu coupé (COUPE_WS=off) ; 404 sans code : serveur d'avant la Coupe
  const notFound = error?.status === 404 && !data;
  const switchedOff = notFound && error?.data?.code === 'disabled';
  const serverMissing = notFound && !switchedOff;
  const failed = !notFound && queryFailed(query);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => setCoupeReportStatus(id, status),
    onMutate: ({ id }) => setBusyId(id),
    onSuccess: (_res, { status }) => {
      toast.success(status === 'handled' ? 'Signalement traité' : 'Signalement ignoré');
      invalidateCoupe(queryClient);
    },
    onError: (err) => toast.error(friendlyError(err, 'Impossible d’enregistrer. Réessayez.')),
    onSettled: () => setBusyId(null),
  });

  // Compte signalé : exclusion des classements (ou réintégration), points remis à zéro. L'état
  // « exclu » vient du serveur (`reported_banned`) quand il le donne, sinon de la dernière action ici
  const [confirm, setConfirm] = useState(null); // { kind, report }
  const [bannedKeys, setBannedKeys] = useState({}); // key_hash → true | false
  const [clientEntry, setClientEntry] = useState(null);
  const playerMutation = useMutation({
    mutationFn: ({ kind, keyHash }) => (kind === 'reset' ? resetCoupePlayer(keyHash) : setCoupePlayerBanned(keyHash, kind === 'ban')),
    onSuccess: (_res, { kind, keyHash, name }) => {
      if (kind !== 'reset') setBannedKeys((m) => ({ ...m, [keyHash]: kind === 'ban' }));
      toast.success(PLAYER_ACTIONS[kind].done(name));
      invalidateCoupe(queryClient);
    },
    onError: (err) => toast.error(friendlyError(err, 'Impossible d’enregistrer. Réessayez.')),
    onSettled: () => setConfirm(null),
  });
  const isBanned = (report) => {
    const key = String(report.reported_key_hash || '');
    if (key && typeof bannedKeys[key] === 'boolean') return bannedKeys[key];
    return report.reported_banned === true;
  };
  const runConfirmed = () => {
    if (!confirm) return;
    const { kind, report } = confirm;
    playerMutation.mutate({ kind, keyHash: String(report.reported_key_hash), name: coupePlayerName(report.reported_name) });
  };
  const confirmDef = confirm ? PLAYER_ACTIONS[confirm.kind] : null;
  const confirmName = confirm ? coupePlayerName(confirm.report.reported_name) : '';

  if (user && !isAdmin) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Cette page est réservée à l'administrateur.
      </div>
    );
  }

  const season = coupeSeasonLabel(currentCoupeSeason());
  const reports = Array.isArray(data?.reports) ? data.reports.filter((r) => r && typeof r === 'object') : [];
  const pendingReports = reports.filter((r) => !r.status || r.status === 'pending').length;

  return (
    <div className="min-w-0 max-w-5xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Clients</p>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-[#ebc15e] shrink-0" aria-hidden="true" />
            La Coupe du Gang
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isPending && !failed && !notFound ? 'Chargement…' : `Matchs en ligne, paires et signalements · ${season}`}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Actualiser"
          className="text-muted-foreground shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {switchedOff && (
        <div role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm flex gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">Le jeu est coupé</p>
            <p className="text-xs text-muted-foreground mt-1">
              La variable Heroku <code>COUPE_WS=off</code> est posée : la Coupe est cachée dans l’app et aucun match en ligne ne démarre.
            </p>
          </div>
        </div>
      )}

      {serverMissing && (
        <div role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm flex gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">Le serveur ne connaît pas encore La Coupe du Gang.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Les routes <code>/coupe</code> du serveur (<code>routes/coupe.js</code>) doivent être déployées sur Heroku.
            </p>
          </div>
        </div>
      )}

      {isPending && !failed && !notFound && (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[76px] rounded-2xl border border-border bg-card animate-pulse" />)}
          </div>
          <div className="h-[220px] rounded-2xl border border-border bg-card animate-pulse" />
        </div>
      )}

      {failed && (
        <LoadError what="La Coupe du Gang" error={error} onRetry={refetch} retrying={isFetching} />
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_3fr] gap-4">
            <section aria-label="Aujourd’hui">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-2">Aujourd’hui</p>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Matchs" value={count(data.today?.matches)} />
                <Stat label="Joueurs" value={count(data.today?.players)} />
              </div>
            </section>
            <section aria-label={season}>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-2">{season}</p>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Matchs" value={count(data.season?.matches)} />
                <Stat label="Joueurs" value={count(data.season?.players)} />
                <Stat label="À points" value={count(data.season?.ranked)} hint="matchs classés" />
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <TopPairs pairs={data.top_pairs} />

            <section className="rounded-2xl border border-border bg-card p-4">
              <PanelTitle icon={Flag} aside={pendingReports > 0 ? `${pendingReports} à traiter` : null}>Signalements</PanelTitle>
              {reports.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
                  Aucun signalement. Les joueurs signalent un adversaire depuis la fin d’un match ou le classement.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {reports.map((r) => (
                    <ReportItem
                      key={r.id}
                      report={r}
                      busy={busyId === r.id}
                      onStatus={(status) => statusMutation.mutate({ id: r.id, status })}
                      banned={isBanned(r)}
                      playerBusy={playerMutation.isPending}
                      onPlayerAction={(kind, report) => setConfirm({ kind, report })}
                      onOpenClient={(report) => setClientEntry({
                        user_id: report.reported_user_id,
                        email: report.reported_email || '',
                        name: coupePlayerName(report.reported_name),
                      })}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <KillSwitchReminder off={switchedOff} />

      {/* Confirmation d'une action sur le compte signalé (fermée par « Annuler ») */}
      <AlertDialog open={!!confirm} onOpenChange={(open) => { if (!open && !playerMutation.isPending) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDef ? confirmDef.title(confirmName) : ''}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDef?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={playerMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); runConfirmed(); }}
              disabled={playerMutation.isPending}
              className={confirmDef?.danger ? 'bg-red-600 hover:bg-red-700' : undefined}
            >
              {playerMutation.isPending ? 'Enregistrement…' : confirmDef?.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GangClientSheet entry={clientEntry} onClose={() => setClientEntry(null)} />
    </div>
  );
}
