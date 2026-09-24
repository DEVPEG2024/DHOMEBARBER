import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, AlertTriangle, CheckCircle2, Play, LayoutDashboard, Sparkles, KeyRound, Camera, CircleDashed,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  SNAP_ADMIN_KEY, snapStatsKey, fetchSnapAdmin, saveSnapAdmin, fetchSnapStats, loadSnapLenses, resetSnapSettings,
  buildEntries, isColorLens, isBeardLens,
} from '@/lib/snapLenses';
import SnapStats from '@/components/snap-admin/SnapStats';
import SnapLensesTab from '@/components/snap-admin/SnapLensesTab';
import SnapSetupTab, { EnvBadge } from '@/components/snap-admin/SnapSetupTab';

/**
 * Admin → Filtres Snap : allumer / éteindre les filtres, suivre leur utilisation, régler le
 * catalogue (lentilles, palette, styles de barbe, filtre à l'ouverture) et la configuration
 * Camera Kit (jeton, groupes). Backend : routes/snap.js ; page client : pages/SnapLenses.jsx.
 */
const TABS = [
  { key: 'overview', label: 'Vue d\'ensemble', icon: LayoutDashboard },
  { key: 'lenses', label: 'Lentilles', icon: Sparkles },
  { key: 'setup', label: 'Camera Kit', icon: KeyRound },
];

function Check({ ok, warn, children }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : CircleDashed;
  const color = ok ? 'text-primary' : warn ? 'text-amber-300' : 'text-red-300';
  return (
    <li className="flex items-start gap-2 text-xs">
      <Icon className={`w-4 h-4 shrink-0 ${color}`} />
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}

export default function AdminSnap() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = TABS.some((t) => t.key === requestedTab) ? requestedTab : 'overview';
  const setTab = (key) => setSearchParams(key === 'overview' ? {} : { tab: key }, { replace: true });
  const [days, setDays] = useState(30);

  const configQ = useQuery({ queryKey: SNAP_ADMIN_KEY, queryFn: fetchSnapAdmin, refetchOnWindowFocus: false });
  const config = configQ.data;

  const groupsKey = (config?.groups?.value || []).join(',');
  const lensesQ = useQuery({
    queryKey: ['snap', 'lenses', config?.token?.value || '', groupsKey],
    // L'instance Camera Kit reste hors du cache React Query : seules les données en sortent
    queryFn: () => loadSnapLenses(config.token.value, groupsKey).then(({ lenses, errors }) => ({ lenses, errors })),
    enabled: !!config?.configured,
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const statsQ = useQuery({
    queryKey: snapStatsKey(days),
    queryFn: () => fetchSnapStats(days),
    placeholderData: (prev) => prev,
  });

  const saveMut = useMutation({
    mutationFn: saveSnapAdmin,
    onSuccess: (data) => {
      queryClient.setQueryData(SNAP_ADMIN_KEY, data);
      // la page /snap et la carte de l'accueil relisent les paramètres publics
      resetSnapSettings();
      toast.success('Enregistré');
    },
    onError: (err) => toast.error(err?.message || 'Erreur lors de l\'enregistrement'),
  });

  const lenses = lensesQ.data?.lenses || [];
  const catalog = useMemo(() => ({
    lenses: config?.lenses, defaultLens: config?.default_lens, colors: config?.colors, beardStyles: config?.beard_styles,
  }), [config]);
  const entries = useMemo(() => buildEntries(lenses, catalog), [lenses, catalog]);
  const declares = lenses.some((l) => isColorLens(l) || isBeardLens(l));

  if (configQ.isLoading) {
    return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }
  if (configQ.error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        Impossible de charger la configuration des filtres : {configQ.error.message}
      </div>
    );
  }

  const status = config.live ? 'live' : config.configured ? 'off' : 'unconfigured';
  const STATUS = {
    live: { label: 'En ligne', cls: 'bg-primary/15 text-primary', text: 'Les clients voient les filtres sur l\'accueil et dans « Nouvelle tête ».' },
    off: { label: 'Éteint', cls: 'bg-secondary text-muted-foreground', text: 'Invisible des clients : la carte de l\'accueil est masquée et la caméra n\'est jamais demandée. Vous pouvez tester en direct.' },
    unconfigured: { label: 'Non configuré', cls: 'bg-red-500/15 text-red-300', text: 'Jeton ou groupe de lentilles manquant : renseignez-les dans l\'onglet Camera Kit.' },
  }[status];

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Camera Kit by Snap</p>
          <h1 className="font-display text-2xl font-bold">Filtres Snap</h1>
        </div>
        <Link to="/snap" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shrink-0">
          <Play className="w-3.5 h-3.5" /> Tester en direct
        </Link>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
                active ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {t.key === 'lenses' && lensesQ.isSuccess && (
                <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] leading-none ${active ? 'bg-primary-foreground/20' : 'bg-secondary'}`}>{lenses.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          <section className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-yellow-300" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    Filtres visibles par les clients
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS.cls}`}>{STATUS.label}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-md">{STATUS.text}</p>
                </div>
              </div>
              <Switch
                checked={config.enabled}
                disabled={saveMut.isPending}
                onCheckedChange={(v) => saveMut.mutate({ enabled: v })}
                aria-label="Filtres visibles par les clients"
              />
            </div>
          </section>

          <section className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-3">État des lieux</h3>
            <ul className="space-y-2">
              <Check ok={config.configured}>
                {config.configured
                  ? <>Camera Kit configuré : jeton et {config.groups.value.length} groupe{config.groups.value.length > 1 ? 's' : ''} de lentilles.</>
                  : <>Camera Kit incomplet : il manque {config.token.value ? 'le groupe de lentilles' : 'le jeton d\'API'}.</>}
              </Check>
              <Check ok={config.token.environment === 'production'} warn={config.token.environment === 'staging'}>
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  Jeton <EnvBadge env={config.token.environment} />
                  {config.token.environment === 'staging' && <>: filigrane « Camera Kit Staging » visible. <button type="button" onClick={() => setTab('setup')} className="underline text-foreground">Passer en production</button></>}
                </span>
              </Check>
              {config.configured && (
                lensesQ.isLoading
                  ? <li className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Lecture des lentilles chez Snap…</li>
                  : lensesQ.error
                    ? <Check>Camera Kit refuse le jeton : {lensesQ.error.message || 'erreur inconnue'}.</Check>
                    : (
                      <>
                        <Check ok={entries.length > 0} warn={entries.length === 0}>
                          {lenses.length} lentille{lenses.length > 1 ? 's' : ''} publiée{lenses.length > 1 ? 's' : ''},{' '}
                          {entries.length} pastille{entries.length > 1 ? 's' : ''} dans le carrousel des clients.{' '}
                          <button type="button" onClick={() => setTab('lenses')} className="underline text-foreground">Gérer</button>
                        </Check>
                        <Check ok={declares} warn={!declares}>
                          {declares
                            ? 'Palette de couleurs / styles de barbe déclarés par une lentille.'
                            : 'Aucune lentille ne déclare la palette ou la barbe (Vendor Data « dhb » dans Lens Studio) : chaque lentille reste un filtre unique, avec son effet d\'origine.'}
                        </Check>
                      </>
                    )
              )}
            </ul>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Avant d'allumer : « Tester en direct » ouvre la caméra avec exactement ce que verront les clients.
            </p>
          </section>

          <SnapStats
            stats={statsQ.data}
            days={days}
            onDaysChange={setDays}
            isLoading={statsQ.isLoading}
            error={statsQ.error}
          />
        </div>
      )}

      {tab === 'lenses' && (
        config.configured
          ? <SnapLensesTab config={config} lensesQuery={lensesQ} onSave={(patch) => saveMut.mutate(patch)} saving={saveMut.isPending} />
          : (
            <div className="bg-card border border-border rounded-xl p-5 text-xs text-muted-foreground">
              Renseignez d'abord le jeton et le groupe de lentilles dans l'onglet{' '}
              <button type="button" onClick={() => setTab('setup')} className="underline text-foreground">Camera Kit</button>.
            </div>
          )
      )}

      {tab === 'setup' && (
        <SnapSetupTab config={config} onSave={(patch) => saveMut.mutate(patch)} saving={saveMut.isPending} />
      )}
    </div>
  );
}
