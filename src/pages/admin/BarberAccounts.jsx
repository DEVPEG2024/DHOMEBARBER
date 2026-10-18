import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api, apiRequest, API_BASE } from '@/api/apiClient';
import { motion } from 'framer-motion';
import { ShieldCheck, Plus, Trash2, Eye, EyeOff, KeyRound, Save, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import LoadError, { friendlyError } from '@/components/shared/LoadError';

// Seulement les permissions qui servent vraiment à un barber : Prestations, Équipe, Notifications,
// Paramètres (écritures réservées à l'admin par le serveur) et Congés (sans effet) ont été retirées.
// Une ancienne clé encore en base est simplement ignorée.
const ALL_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'clients', label: 'Clients' },
  { key: 'products', label: 'Textile (réservations)' },
  { key: 'orders', label: 'Commandes' },
  { key: 'reviews', label: 'Avis' },
  { key: 'stats', label: 'Statistiques' },
];
const KNOWN_PERMISSIONS = new Set(ALL_PERMISSIONS.map(p => p.key));
const PASSWORD_MIN = 8;
const PASSWORD_MESSAGE = `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_FORM = { email: '', password: '', full_name: '', employee_id: '', permissions: ['dashboard', 'agenda'] };

function apiCall(method, path, body) {
  return apiRequest(method, `${API_BASE}${path}`, body);
}

export default function BarberAccounts() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  // Nom et email repris de la fiche choisie : remplacés si l'admin change de fiche, jamais s'il les a tapés
  const autoFilled = useRef({ full_name: '', email: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editPerms, setEditPerms] = useState([]);
  const [editPassword, setEditPassword] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const {
    data: accountsData, isLoading, isError, error, refetch, isFetching, isPending, fetchStatus,
  } = useQuery({
    queryKey: ['barberAccounts'],
    queryFn: () => apiCall('GET', '/barber-accounts'),
  });
  const accounts = Array.isArray(accountsData) ? accountsData : [];
  // Liste non chargée : ni « Aucun compte », ni création (on recréerait un compte existant → 409)
  // (hors ligne la requête reste en pause : même traitement qu'un échec)
  const accountsFailed = (isError && !accountsData) || (isPending && fetchStatus === 'paused');
  const accountsReady = Array.isArray(accountsData);

  // Toutes les fiches, inactives comprises (même requête et même clé qu'Équipe) : une fiche créée
  // inactive (barber pas encore arrivé, essai) n'apparaissait nulle part ici, sans explication
  const employeesQuery = useQuery({
    queryKey: ['employees', 'all'],
    queryFn: () => api.entities.Employee.list('sort_order', 50),
  });
  const employees = employeesQuery.data ?? [];
  const employeesReady = Array.isArray(employeesQuery.data);

  // Fiches sans compte, les actives d'abord
  const availableEmployees = employees
    .filter(emp => !accounts.some(acc => String(acc.employee_id) === String(emp.id)))
    .sort((a, b) => Number(b.is_active !== false) - Number(a.is_active !== false));
  const selectedEmployee = employees.find(em => String(em.id) === String(form.employee_id)) || null;

  const selectEmployee = (id) => {
    const emp = employees.find(em => String(em.id) === String(id));
    setForm(prev => {
      const next = { ...prev, employee_id: id };
      // Champ vide ou encore rempli par la fiche précédente : repris de la nouvelle fiche
      if (!prev.full_name.trim() || prev.full_name === autoFilled.current.full_name) next.full_name = emp?.name || '';
      if (!prev.email.trim() || prev.email === autoFilled.current.email) next.email = emp?.email || '';
      autoFilled.current = { full_name: next.full_name, email: next.email };
      return next;
    });
  };

  // Arrivée depuis Équipe (« Créer son compte ») : ?employee=<id> ouvre le formulaire sur cette fiche
  const wantedEmployee = searchParams.get('employee');
  useEffect(() => {
    if (!wantedEmployee || !accountsReady || !employeesReady) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('employee');
      return next;
    }, { replace: true });
    const emp = employees.find(em => String(em.id) === String(wantedEmployee));
    if (!emp) return;
    if (accounts.some(acc => String(acc.employee_id) === String(emp.id))) {
      toast.info(`${emp.name} a déjà un compte : modifiez-le dans la liste`);
      return;
    }
    setShowCreate(true);
    selectEmployee(emp.id);
  }, [wantedEmployee, accountsReady, employeesReady]);

  const handleCreate = async () => {
    const email = form.email.trim();
    if (!form.employee_id) { toast.error('Choisissez le barber'); return; }
    if (!email) { toast.error('Indiquez l\'email de connexion du barber'); return; }
    if (!EMAIL_RE.test(email)) { toast.error('Adresse email invalide', { description: 'Exemple : prenom@dhomebarber.fr' }); return; }
    if (form.password.length < PASSWORD_MIN) { toast.error(PASSWORD_MESSAGE); return; }
    setSaving(true);
    try {
      const created = await apiCall('POST', '/barber-accounts', { ...form, email, full_name: form.full_name.trim() });
      queryClient.invalidateQueries({ queryKey: ['barberAccounts'] });
      // Les permissions vivent sur la fiche employé : Équipe ne doit pas les renvoyer périmées
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      const name = created?.employee_name || selectedEmployee?.name || 'Le barber';
      if (created?.employee_active === false || selectedEmployee?.is_active === false) {
        toast.warning('Compte créé, connexion bloquée pour l\'instant', {
          description: `La fiche de ${name} est inactive : il pourra se connecter dès qu'elle sera réactivée dans Équipe.`,
          duration: 10000,
        });
      } else {
        toast.success('Compte barber créé', { description: `${name} peut se connecter avec ${email}.` });
      }
      setForm(EMPTY_FORM);
      autoFilled.current = { full_name: '', email: '' };
      setShowPassword(false);
      setShowCreate(false);
    } catch (err) {
      toast.error('Impossible de créer le compte', { description: friendlyError(err, 'Réessayez dans un instant.') });
      // Fiche déjà dotée d'un compte ou supprimée entre-temps : listes relues
      if (err?.status === 409 || err?.status === 404) {
        queryClient.invalidateQueries({ queryKey: ['barberAccounts'] });
        queryClient.invalidateQueries({ queryKey: ['employees'] });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!accountToDelete) return;
    try {
      await apiCall('DELETE', `/barber-accounts/${accountToDelete.id}`);
      queryClient.invalidateQueries({ queryKey: ['barberAccounts'] });
      // Les permissions vivent sur la fiche employé : Équipe ne doit pas les renvoyer périmées
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Compte supprimé');
    } catch (err) {
      toast.error(friendlyError(err, 'Impossible de supprimer le compte'));
    } finally {
      setAccountToDelete(null);
    }
  };

  const startEdit = (acc) => {
    setEditingId(acc.id);
    let perms = acc.permissions;
    if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch (_) { perms = []; } }
    setEditPerms(perms || []);
    setEditPassword('');
  };

  const handleSaveEdit = async (acc) => {
    // Le serveur exige 8 caractères : jamais d'envoi silencieusement ignoré
    if (editPassword && editPassword.length < PASSWORD_MIN) {
      toast.error(PASSWORD_MESSAGE);
      return;
    }
    setSavingEdit(true);
    try {
      await apiCall('PUT', `/barber-accounts/${acc.id}`, {
        permissions: editPerms,
        ...(editPassword ? { password: editPassword } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['barberAccounts'] });
      // Les permissions vivent sur la fiche employé : Équipe ne doit pas les renvoyer périmées
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success(editPassword ? 'Mot de passe et permissions mis à jour' : 'Permissions mises à jour');
      setEditingId(null);
    } catch (err) {
      toast.error(friendlyError(err, 'Impossible de modifier les permissions'));
    } finally {
      setSavingEdit(false);
    }
  };

  const togglePerm = (perms, setPerms, key) => {
    setPerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Gestion</p>
          <h1 className="font-display text-2xl font-bold">Comptes Barbers</h1>
          {accountsReady && <p className="text-xs text-muted-foreground mt-1">{accounts.length} compte(s) barber</p>}
        </div>
        <Button size="sm" className="gap-1.5" disabled={!accountsReady} onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5" /> Créer un compte
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Nouveau compte barber
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Annuler</Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Barber *</Label>
              <select
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                value={form.employee_id}
                disabled={!employeesReady || availableEmployees.length === 0}
                onChange={e => selectEmployee(e.target.value)}
              >
                <option value="">
                  {!employeesReady ? 'Chargement des fiches…' : availableEmployees.length === 0 ? 'Aucune fiche sans compte' : 'Choisir un barber...'}
                </option>
                {availableEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}{emp.is_active === false ? ' (fiche inactive)' : emp.is_hidden ? ' (fiche de test)' : ''}</option>
                ))}
              </select>
              {employeesQuery.isError && !employeesReady && (
                <p className="text-[11px] text-red-400">
                  Impossible de charger les fiches de l'équipe.{' '}
                  <button type="button" className="underline" onClick={() => employeesQuery.refetch()}>Réessayer</button>
                </p>
              )}
              {employeesReady && availableEmployees.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Toutes les fiches ont déjà un compte. Ajoutez d'abord le nouveau barber dans{' '}
                  <Link to="/admin/team" className="text-primary underline">Équipe</Link>, puis revenez ici.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nom complet</Label>
              <Input value={form.full_name} onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
                className="bg-background border-border" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email *</Label>
              <Input type="email" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                className="bg-background border-border" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mot de passe *</Label>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} value={form.password}
                  onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                  className="bg-background border-border pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {selectedEmployee?.is_active === false && (
            <div role="note" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                La fiche de {selectedEmployee.name} est inactive : le compte sera créé, mais {selectedEmployee.name} ne pourra se connecter
                qu'une fois la fiche réactivée dans <Link to="/admin/team" className="underline">Équipe</Link> (interrupteur « Actif »).
                Une fiche active apparaît aussi dans la réservation des clients.
              </span>
            </div>
          )}

          <div className="mt-4">
            <Label className="text-xs mb-2 block">Permissions</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_PERMISSIONS.map(p => (
                <button key={p.key} type="button"
                  onClick={() => togglePerm(form.permissions, (fn) => setForm(prev => ({ ...prev, permissions: typeof fn === 'function' ? fn(prev.permissions) : fn })), p.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    form.permissions.includes(p.key)
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-secondary/50 border-border text-muted-foreground hover:border-primary/20'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={handleCreate} disabled={saving} className="gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              {saving ? 'Création...' : 'Créer le compte'}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Accounts list */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Chargement...</div>
      ) : accountsFailed ? (
        <LoadError what="les comptes barbers" error={error} onRetry={refetch} retrying={isFetching} />
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Aucun compte barber. Créez-en un pour donner accès au back-office à vos barbers.
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc, i) => {
            const isEditing = editingId === acc.id;
            let perms = acc.permissions;
            if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch (_) { perms = []; } }
            perms = perms || [];
            // Fiche employé supprimée ou inactive : le serveur refuse la connexion et toute modification (409)
            const ficheClosed = !!acc.employee_id && acc.employee_active !== true;

            return (
              <motion.div key={acc.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{acc.full_name || acc.employee_name || acc.email}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{acc.email}</p>
                    {ficheClosed && (
                      <Badge variant="outline" className="mt-1 text-[10px] whitespace-normal bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400">
                        Accès coupé : fiche supprimée ou inactive (Équipe)
                      </Badge>
                    )}
                    {acc.employee_name && (
                      <p className="text-[10px] text-primary/70">Barber : {acc.employee_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditing && !ficheClosed && (
                      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => startEdit(acc)}>
                        <KeyRound className="w-3 h-3" /> Modifier
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500"
                      onClick={() => setAccountToDelete(acc)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Permissions display */}
                {!isEditing && !ficheClosed && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {perms.filter(p => KNOWN_PERMISSIONS.has(p)).length === 0 ? (
                      <span className="text-[10px] text-muted-foreground">Aucune permission</span>
                    ) : (
                      perms.filter(p => KNOWN_PERMISSIONS.has(p)).map(p => (
                        <Badge key={p} variant="outline" className="text-[10px] bg-primary/5 border-primary/20 text-primary">
                          {ALL_PERMISSIONS.find(ap => ap.key === p)?.label || p}
                        </Badge>
                      ))
                    )}
                  </div>
                )}

                {/* Edit mode */}
                {isEditing && (
                  <div className="mt-4 pt-3 border-t border-border">
                    <Label className="text-xs mb-2 block">Permissions</Label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {ALL_PERMISSIONS.map(p => (
                        <button key={p.key} type="button"
                          onClick={() => togglePerm(editPerms, setEditPerms, p.key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            editPerms.includes(p.key)
                              ? 'bg-primary/10 border-primary/30 text-primary'
                              : 'bg-secondary/50 border-border text-muted-foreground hover:border-primary/20'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="space-y-1 flex-1 max-w-xs">
                        <Label className="text-xs">Nouveau mot de passe (optionnel)</Label>
                        <Input type="password" placeholder="8 caractères minimum, vide = inchangé" value={editPassword}
                          onChange={e => setEditPassword(e.target.value)} className="bg-background border-border" />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Annuler</Button>
                        <Button size="sm" className="gap-1" disabled={savingEdit} onClick={() => handleSaveEdit(acc)}>
                          <Save className="w-3 h-3" /> {savingEdit ? 'Sauvegarde...' : 'Sauvegarder'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!accountToDelete} onOpenChange={(open) => !open && setAccountToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le compte</AlertDialogTitle>
            <AlertDialogDescription>
              Supprimer le compte barber de <strong>{accountToDelete?.full_name || accountToDelete?.email}</strong> ?
              Le barber ne pourra plus se connecter au back-office.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
