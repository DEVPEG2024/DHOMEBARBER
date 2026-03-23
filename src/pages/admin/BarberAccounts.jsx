import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { ShieldCheck, Plus, Trash2, Eye, EyeOff, KeyRound, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const API_BASE = import.meta.env.PROD
  ? 'https://dhomebarber-api-3aabb8313cb6.herokuapp.com'
  : '';

const ALL_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'services', label: 'Prestations' },
  { key: 'team', label: 'Équipe' },
  { key: 'clients', label: 'Clients' },
  { key: 'products', label: 'Produits' },
  { key: 'orders', label: 'Commandes' },
  { key: 'reviews', label: 'Avis' },
  { key: 'stats', label: 'Statistiques' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'conges', label: 'Congés' },
  { key: 'settings', label: 'Paramètres' },
];

function getToken() {
  return localStorage.getItem('base44_access_token') || localStorage.getItem('token') || '';
}

async function apiCall(method, path, body) {
  const res = await fetch(`${API_BASE}/api/apps/null${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur serveur');
  }
  return res.json();
}

export default function BarberAccounts() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', employee_id: '', permissions: ['dashboard', 'agenda'] });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editPerms, setEditPerms] = useState([]);
  const [editPassword, setEditPassword] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['barberAccounts'],
    queryFn: () => apiCall('GET', '/barber-accounts'),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }),
  });

  // Employees without an account yet
  const availableEmployees = employees.filter(
    emp => !accounts.some(acc => acc.employee_id === emp.id)
  );

  const handleCreate = async () => {
    if (!form.email || !form.password || !form.employee_id) {
      toast.error('Remplissez tous les champs obligatoires');
      return;
    }
    setSaving(true);
    try {
      await apiCall('POST', '/barber-accounts', form);
      queryClient.invalidateQueries({ queryKey: ['barberAccounts'] });
      toast.success('Compte barber créé');
      setForm({ email: '', password: '', full_name: '', employee_id: '', permissions: ['dashboard', 'agenda'] });
      setShowCreate(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!accountToDelete) return;
    try {
      await apiCall('DELETE', `/barber-accounts/${accountToDelete.id}`);
      queryClient.invalidateQueries({ queryKey: ['barberAccounts'] });
      toast.success('Compte supprimé');
    } catch (err) {
      toast.error(err.message);
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
    setSavingEdit(true);
    try {
      await apiCall('PUT', `/barber-accounts/${acc.id}`, {
        permissions: editPerms,
        ...(editPassword.length >= 6 ? { password: editPassword } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['barberAccounts'] });
      toast.success('Permissions mises à jour');
      setEditingId(null);
    } catch (err) {
      toast.error(err.message);
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
          <p className="text-xs text-muted-foreground mt-1">{accounts.length} compte(s) barber</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
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
                onChange={e => {
                  const emp = employees.find(em => em.id === e.target.value);
                  setForm(prev => ({
                    ...prev,
                    employee_id: e.target.value,
                    full_name: emp?.name || prev.full_name,
                    email: emp?.email || prev.email,
                  }));
                }}
              >
                <option value="">Choisir un barber...</option>
                {availableEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
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
                    <p className="text-[10px] text-muted-foreground">{acc.email}</p>
                    {acc.employee_name && (
                      <p className="text-[10px] text-primary/70">Barber : {acc.employee_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditing && (
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
                {!isEditing && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {perms.length === 0 ? (
                      <span className="text-[10px] text-muted-foreground">Aucune permission</span>
                    ) : (
                      perms.map(p => (
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
                        <Input type="password" placeholder="Laisser vide pour ne pas changer" value={editPassword}
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
