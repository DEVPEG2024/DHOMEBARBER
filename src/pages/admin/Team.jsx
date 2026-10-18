import React, { useEffect, useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Mail, Upload, Images } from 'lucide-react';
import ImageCropDialog from '@/components/shared/ImageCropDialog';
import GalleryEditor from '@/components/barber-gallery/GalleryEditor';
import { BARBER_PHOTO_ASPECT, BARBER_PHOTO_BG, BARBER_PHOTO_RATIO } from '@/lib/barberPhoto';
import { Button } from '@/components/ui/button';

const BARBER_COLORS = ['#3fcf8e','#60a5fa','#f59e0b','#a78bfa','#f472b6','#34d399','#fb923c','#38bdf8','#e879f9','#4ade80'];
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import LoadError from '@/components/shared/LoadError';

/** Message du serveur (409 « a N rendez-vous à venir… », photo refusée…), sinon le repli. */
const serverText = (err, fallback) =>
  (err?.message && !/^HTTP \d+$/.test(err.message) ? err.message : fallback);

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche' };

// Champs du formulaire : seuls ceux-là partent, et seulement s'ils ont changé. Renvoyer la fiche
// entière (copie du cache, parfois vieille de plusieurs heures) écrasait la photo, la bio, les
// compétences ou les permissions modifiées ailleurs (Mes paramètres du barber, Comptes barbers).
const FORM_FIELDS = ['name', 'title', 'email', 'phone', 'photo_url', 'bio', 'working_hours', 'color', 'is_active'];
const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const defaultHours = DAYS.reduce((acc, d) => ({
  ...acc,
  [d]: d === 'sunday' ? { start: '09:00', end: '19:00', closed: true } : { start: '09:00', end: '19:00', closed: false }
}), {});

export default function Team() {
  const [editEmployee, setEditEmployee] = useState(null);
  // Ligne d'origine de la fiche ouverte (relue sur le serveur) : base de la comparaison à l'envoi
  const [originalEmployee, setOriginalEmployee] = useState(null);
  const openToken = React.useRef(0);
  const [showDialog, setShowDialog] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [showCrop, setShowCrop] = useState(false);
  // Fiche dont on édite les réalisations (id : la fiche affichée suit le cache rechargé)
  const [galleryEmployeeId, setGalleryEmployeeId] = useState(null);
  const queryClient = useQueryClient();
  // Suppression en deux taps : la corbeille devient « Supprimer ? », qui retombe seule après 4 s
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  useEffect(() => {
    if (!confirmDeleteId) return undefined;
    const t = setTimeout(() => setConfirmDeleteId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmDeleteId]);

  const employeesQuery = useQuery({
    queryKey: ['employees', 'all'], // liste complète (inactifs inclus) : clé distincte des pages client
    queryFn: () => api.entities.Employee.list('sort_order', 50),
  });
  const employees = employeesQuery.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (data.id) {
        // Seuls les champs du formulaire qui ont changé (jamais skills, permissions,
        // experience_level, gallery, sort_order…)
        const base = originalEmployee && String(originalEmployee.id) === String(data.id) ? originalEmployee : {};
        const changes = {};
        for (const key of FORM_FIELDS) {
          if (data[key] !== undefined && !sameValue(data[key], base[key])) changes[key] = data[key];
        }
        if (Object.keys(changes).length === 0) return { unchanged: true };
        return api.entities.Employee.update(data.id, changes);
      }
      return api.entities.Employee.create(data);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowDialog(false);
      toast.success(res?.unchanged ? 'Aucune modification' : 'Collaborateur sauvegardé');
    },
    onError: (err) => {
      toast.error(serverText(err, 'Erreur lors de la sauvegarde'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Employee.delete(id),
    onSuccess: () => {
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Collaborateur supprimé');
    },
    onError: (err) => {
      setConfirmDeleteId(null);
      toast.error(serverText(err, 'Erreur lors de la suppression'));
    },
  });

  const openNew = () => {
    const nextColor = BARBER_COLORS[employees.length % BARBER_COLORS.length];
    openToken.current++;
    setOriginalEmployee(null);
    setEditEmployee({ name: '', title: '', bio: '', email: '', phone: '', is_active: true, working_hours: defaultHours, color: nextColor });
    setShowDialog(true);
  };

  // Ouverture d'une fiche : affichée tout de suite, puis remplacée par la ligne relue sur le
  // serveur (bio / vidéo modifiées ailleurs) tant que rien n'a encore été touché
  const openEdit = async (emp) => {
    setConfirmDeleteId(null);
    const token = ++openToken.current;
    const initial = { ...emp, working_hours: emp.working_hours || defaultHours };
    setOriginalEmployee(emp);
    setEditEmployee(initial);
    setShowDialog(true);
    try {
      const rows = await api.entities.Employee.filter({ id: emp.id }, null, 1);
      const fresh = Array.isArray(rows) ? rows[0] : null;
      if (!fresh || token !== openToken.current) return;
      setOriginalEmployee(fresh);
      setEditEmployee((cur) => (cur && sameValue(cur, initial) ? { ...fresh, working_hours: fresh.working_hours || defaultHours } : cur));
    } catch { /* hors ligne : la fiche du cache reste, la sauvegarde ne renvoie que les champs changés */ }
  };

  const updateHours = (day, field, value) => {
    setEditEmployee(prev => ({
      ...prev,
      working_hours: {
        ...prev.working_hours,
        [day]: { ...prev.working_hours?.[day], [field]: value }
      }
    }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Gestion</p>
          <h1 className="font-display text-2xl font-bold">Équipe</h1>
        </div>
        <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg">
          <Plus className="w-4 h-4 mr-1.5" /> Ajouter
        </Button>
      </div>

      {employeesQuery.isError && !employeesQuery.data ? (
        <LoadError what="l'équipe" error={employeesQuery.error} onRetry={employeesQuery.refetch} retrying={employeesQuery.isFetching} />
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {employees.map(emp => (
          <div key={emp.id} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-14 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{ aspectRatio: BARBER_PHOTO_ASPECT, background: emp.photo_url ? BARBER_PHOTO_BG : (emp.color || BARBER_COLORS[0]) + '22', border: `2px solid ${emp.color || BARBER_COLORS[0]}` }}>
                {emp.photo_url ? (
                  <img src={emp.photo_url} alt={emp.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-bold" style={{ color: emp.color || BARBER_COLORS[0] }}>{emp.name?.charAt(0)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{emp.name}</h3>
                  {!emp.is_active && <span className="text-[9px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">Inactif</span>}
                </div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{emp.title || 'Barber'}</p>
                {emp.email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 min-w-0">
                    <Mail className="w-3 h-3 shrink-0" /> <span className="truncate">{emp.email}</span>
                  </p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(emp)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Réalisations de ${emp.name}`}
                  onClick={() => setGalleryEmployeeId(emp.id)}>
                  <Images className="w-3.5 h-3.5" />
                </Button>
                {confirmDeleteId === emp.id ? (
                  <button
                    type="button"
                    onClick={() => { if (!deleteMutation.isPending) deleteMutation.mutate(emp.id); }}
                    disabled={deleteMutation.isPending}
                    className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-red-500 text-white disabled:opacity-60"
                  >
                    {deleteMutation.isPending ? 'Suppression…' : 'Supprimer ?'}
                  </button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    aria-label={`Supprimer ${emp.name}`}
                    disabled={deleteMutation.isPending}
                    onClick={() => setConfirmDeleteId(emp.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
            {confirmDeleteId === emp.id && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Suppression définitive. Pour le retirer de la réservation sans rien perdre, passez plutôt sa fiche en Inactif.
              </p>
            )}
          </div>
        ))}
      </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden grid-cols-[minmax(0,1fr)]">
          <DialogHeader>
            <DialogTitle className="font-display">{editEmployee?.id ? 'Modifier' : 'Nouveau'} Collaborateur</DialogTitle>
          </DialogHeader>
          {editEmployee && (
            <div className="space-y-4">
              {/* Photo upload */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-28 rounded-xl overflow-hidden border-2 flex items-center justify-center"
                  style={{ aspectRatio: BARBER_PHOTO_ASPECT, borderColor: editEmployee.color || BARBER_COLORS[0], background: editEmployee.photo_url ? BARBER_PHOTO_BG : (editEmployee.color || BARBER_COLORS[0]) + '22' }}>
                  {editEmployee.photo_url ? (
                    <img src={editEmployee.photo_url} alt="Photo" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold" style={{ color: editEmployee.color || BARBER_COLORS[0] }}>
                      {editEmployee.name?.charAt(0) || '?'}
                    </span>
                  )}
                </div>
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => { setCropSrc(reader.result); setShowCrop(true); };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }} />
                  <span className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-all cursor-pointer">
                    <Upload className="w-3 h-3" /> Changer la photo
                  </span>
                </label>
                <p className="text-[10px] text-muted-foreground text-center">Format portrait (1748 × 2480), buste centré, fond sombre</p>
              </div>

              {/* Video URL — stored in bio with marker */}
              <div>
                <Label className="text-xs">URL vidéo de présentation</Label>
                <Input value={(() => { const b = editEmployee.bio || ''; const m = '\n%%VIDEO%%'; const i = b.indexOf(m); return i >= 0 ? b.slice(i + m.length) : ''; })()} onChange={e => {
                  const marker = '\n%%VIDEO%%';
                  const raw = editEmployee.bio || '';
                  const idx = raw.indexOf(marker);
                  const textPart = idx >= 0 ? raw.slice(0, idx) : raw;
                  const v = e.target.value.trim();
                  setEditEmployee({ ...editEmployee, bio: v ? textPart + marker + v : textPart });
                }}
                  className="bg-secondary border-border mt-1" placeholder="https://youtube.com/watch?v=... ou lien .mp4" />
              </div>

              <div>
                <Label className="text-xs">Nom complet</Label>
                <Input value={editEmployee.name} onChange={e => setEditEmployee({ ...editEmployee, name: e.target.value })}
                  className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs">Titre</Label>
                <Input value={editEmployee.title || ''} onChange={e => setEditEmployee({ ...editEmployee, title: e.target.value })}
                  className="bg-secondary border-border mt-1" placeholder="Ex: Master Barber" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input value={editEmployee.email || ''} onChange={e => setEditEmployee({ ...editEmployee, email: e.target.value })}
                    className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Téléphone</Label>
                  <Input value={editEmployee.phone || ''} onChange={e => setEditEmployee({ ...editEmployee, phone: e.target.value })}
                    className="bg-secondary border-border mt-1" />
                </div>
              </div>

              <div>
                <Label className="text-xs mb-2 block">Horaires</Label>
                <div className="space-y-2">
                  {DAYS.map(day => (
                    <div key={day} className="flex items-center gap-2 text-xs min-w-0">
                      <span className="w-14 shrink-0 text-muted-foreground">{DAY_LABELS[day]}</span>
                      <Switch
                        checked={!editEmployee.working_hours?.[day]?.closed}
                        onCheckedChange={v => updateHours(day, 'closed', !v)}
                      />
                      {!editEmployee.working_hours?.[day]?.closed && (
                        <>
                          <Input type="time" value={editEmployee.working_hours?.[day]?.start || '09:00'}
                            onChange={e => updateHours(day, 'start', e.target.value)}
                            className="flex-1 min-w-0 max-w-24 h-7 px-2 text-xs bg-secondary border-border" />
                          <span className="shrink-0 text-muted-foreground">-</span>
                          <Input type="time" value={editEmployee.working_hours?.[day]?.end || '19:00'}
                            onChange={e => updateHours(day, 'end', e.target.value)}
                            className="flex-1 min-w-0 max-w-24 h-7 px-2 text-xs bg-secondary border-border" />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs mb-2 block">Couleur agenda</Label>
                <div className="flex gap-2 flex-wrap">
                  {BARBER_COLORS.map(c => (
                    <button key={c} onClick={() => setEditEmployee({ ...editEmployee, color: c })}
                      className="w-7 h-7 rounded-full transition-all hover:scale-110"
                      style={{ background: c, outline: editEmployee.color === c ? `3px solid white` : 'none', outlineOffset: '2px' }} />
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Actif</Label>
                <Switch checked={editEmployee.is_active} onCheckedChange={v => setEditEmployee({ ...editEmployee, is_active: v })} />
              </div>
              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={saveMutation.isPending}
                onClick={() => { if (saveMutation.isPending) return; saveMutation.mutate(editEmployee); }}>
                {saveMutation.isPending ? 'Enregistrement…' : 'Sauvegarder'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Réalisations d'un barber : chaque geste est enregistré tout de suite */}
      {(() => {
        const galleryEmployee = employees.find(e => String(e.id) === String(galleryEmployeeId));
        return (
          <Dialog open={!!galleryEmployee} onOpenChange={(open) => !open && setGalleryEmployeeId(null)}>
            <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">Réalisations de {galleryEmployee?.name}</DialogTitle>
              </DialogHeader>
              {galleryEmployee && <GalleryEditor key={galleryEmployee.id} employee={galleryEmployee} />}
            </DialogContent>
          </Dialog>
        );
      })()}

      <ImageCropDialog
        open={showCrop}
        onOpenChange={setShowCrop}
        imageSrc={cropSrc}
        cropShape="rect"
        aspect={BARBER_PHOTO_RATIO}
        onCropComplete={async (croppedFile) => {
          try {
            const { file_url } = await api.integrations.Core.UploadFile({ file: croppedFile });
            setEditEmployee(prev => ({ ...prev, photo_url: file_url }));
          } catch {
            toast.error('Erreur lors de l\'upload de la photo');
          }
        }}
      />
    </div>
  );
}