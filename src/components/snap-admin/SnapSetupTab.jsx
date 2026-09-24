import React, { useEffect, useState } from 'react';
import { Loader2, Save, KeyRound, Layers, RotateCcw, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { groupLabel, tokenEnvironment } from '@/lib/snapLenses';

const SNAP_PORTAL = 'https://my-lenses.snapchat.com/';

export function EnvBadge({ env }) {
  if (env === 'production') return <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-semibold">Production</span>;
  if (env === 'staging') return <span className="rounded-full bg-amber-400/15 text-amber-300 px-2 py-0.5 text-[10px] font-semibold">Staging</span>;
  if (env === 'unknown') return <span className="rounded-full bg-secondary text-muted-foreground px-2 py-0.5 text-[10px] font-semibold">Environnement inconnu</span>;
  return <span className="rounded-full bg-red-500/15 text-red-300 px-2 py-0.5 text-[10px] font-semibold">Aucun jeton</span>;
}

const SOURCE_LABEL = { admin: 'saisi ici', heroku: 'variable Heroku' };
const maskToken = (t) => (t ? `${t.slice(0, 10)}…${t.slice(-6)}` : '—');

/**
 * Jeton d'API Camera Kit et groupes de lentilles. Ce qui est saisi ici prime sur les variables
 * Heroku ; « Revenir à Heroku » efface la saisie. C'est ce qui permet de passer du jeton de
 * staging à celui de production sans déploiement.
 */
export default function SnapSetupTab({ config, onSave, saving }) {
  const [token, setToken] = useState('');
  const [groups, setGroups] = useState((config?.groups?.value || []).join('\n'));
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    setToken('');
    setGroups((config?.groups?.value || []).join('\n'));
    setConfirmReset(false);
  }, [config?.updated_at]);

  const pastedEnv = token.trim() ? tokenEnvironment(token) : null;
  const groupsChanged = groups.split(/[\s,;]+/).filter(Boolean).join(',') !== (config?.groups?.value || []).join(',');
  const canSave = !!token.trim() || groupsChanged;
  const fromAdmin = config?.token?.source === 'admin' || config?.groups?.source === 'admin';

  const save = () => {
    const patch = {};
    if (token.trim()) patch.api_token = token.trim();
    if (groupsChanged) patch.lens_group_ids = groups;
    onSave(patch);
  };

  const resetToHeroku = () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    onSave({ api_token: null, lens_group_ids: null });
  };

  return (
    <div className="space-y-5">
      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">Configuration en service</h3>
        <dl className="space-y-3 text-xs">
          <div className="flex items-start gap-3">
            <KeyRound className="w-4 h-4 text-muted-foreground shrink-0 mt-px" />
            <div className="min-w-0">
              <dt className="flex flex-wrap items-center gap-2 font-semibold">Jeton d'API <EnvBadge env={config?.token?.environment} /></dt>
              <dd className="text-muted-foreground mt-0.5">
                <span className="font-mono">{maskToken(config?.token?.value)}</span>
                {config?.token?.source && <> · {SOURCE_LABEL[config.token.source]}</>}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Layers className="w-4 h-4 text-muted-foreground shrink-0 mt-px" />
            <div className="min-w-0">
              <dt className="font-semibold">Groupes de lentilles {config?.groups?.source && <span className="font-normal text-muted-foreground">· {SOURCE_LABEL[config.groups.source]}</span>}</dt>
              <dd className="mt-1 space-y-0.5">
                {(config?.groups?.value || []).map((g) => (
                  <p key={g} className="text-muted-foreground"><span className="text-foreground">{groupLabel(g)}</span> <span className="font-mono text-[10px]">{g}</span></p>
                ))}
                {!config?.groups?.value?.length && <p className="text-red-300">Aucun groupe</p>}
              </dd>
            </div>
          </div>
        </dl>
        {fromAdmin && (
          <button type="button" onClick={resetToHeroku} disabled={saving}
            className={`mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold ${confirmReset ? 'text-red-300' : 'text-muted-foreground hover:text-foreground'}`}>
            <RotateCcw className="w-3 h-3" />
            {confirmReset ? 'Confirmer : effacer la saisie et revenir aux variables Heroku' : 'Revenir aux variables Heroku'}
          </button>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold">Modifier</h3>
        <div>
          <Label className="text-xs">Nouveau jeton d'API Camera Kit</Label>
          <Textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Collez le jeton complet (il commence par eyJ…)"
            rows={3}
            spellCheck={false}
            className="mt-1 bg-secondary border-border font-mono text-[11px]"
          />
          {pastedEnv && (
            <p className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">Jeton détecté : <EnvBadge env={pastedEnv} /></p>
          )}
        </div>
        <div>
          <Label className="text-xs">Groupes de lentilles (un identifiant par ligne, 5 au plus)</Label>
          <Textarea
            value={groups}
            onChange={(e) => setGroups(e.target.value)}
            rows={3}
            spellCheck={false}
            className="mt-1 bg-secondary border-border font-mono text-[11px]"
          />
        </div>
        <Button onClick={save} disabled={!canSave || saving} className="bg-primary text-primary-foreground text-xs">
          {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          Enregistrer
        </Button>
      </section>

      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          Passer en production
          {config?.token?.environment === 'production' && <CheckCircle2 className="w-4 h-4 text-primary" />}
        </h3>
        {config?.token?.environment === 'staging' && (
          <p className="mb-3 flex items-start gap-2 text-[11px] text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            Jeton de staging : les clients voient le filigrane « Camera Kit Staging » sur la caméra.
          </p>
        )}
        <ol className="space-y-2 text-xs text-muted-foreground list-decimal pl-4">
          <li>Snap a approuvé la version « Initial Version » de l'app D'Home Barber.</li>
          <li>Dans le portail Camera Kit (Apps → D'Home Barber), appuyez sur <span className="text-foreground font-semibold">Push to Production</span>.</li>
          <li>Tableau <span className="text-foreground">API Tokens</span> : copiez le jeton <span className="text-foreground font-semibold">Production</span>, collez-le ci-dessus, enregistrez.</li>
          <li><span className="text-foreground">Tester en direct</span> : le filigrane « Camera Kit Staging » a disparu.</li>
        </ol>
        <a href={SNAP_PORTAL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          Ouvrir le portail Snap <ExternalLink className="w-3 h-3" />
        </a>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Nouvelle lentille : publiez-la depuis Lens Studio dans le groupe du salon, elle apparaît dans l'onglet Lentilles.
          Pour qu'elle propose la palette ou les styles de barbe, déclarez-le dans Lens Studio
          (Project Info → Vendor Data : <code className="text-foreground">dhb = hair-color</code>, <code className="text-foreground">beard</code> ou <code className="text-foreground">hair-color+beard</code>).
        </p>
      </section>
    </div>
  );
}
