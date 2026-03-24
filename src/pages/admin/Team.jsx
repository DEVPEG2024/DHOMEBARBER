import React, { useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Mail, Upload } from 'lucide-react';
import ImageCropDialog from '@/components/shared/ImageCropDialog';
import { Button } from '@/components/ui/button';

const BARBER_COLORS = ['#3fcf8e','#60a5fa','#f59e0b','#a78bfa','#f472b6','#34d399','#fb923c','#38bdf8','#e879f9','#4ade80'];
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche' };

const defaultHours = DAYS.reduce((acc, d) => ({
  ...acc,
  [d]: d === 'sunday' ? { start: '09:00', end: '19:00', closed: true } : { start: '09:00', end: '19:00', closed: false }
}), {});

export default function Team() {
  const [editEmployee, setEditEmployee] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [showCrop, setShowCrop] = useState(false);
  const queryClient = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.entities.Employee.list('sort_order', 50),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (data.id) {
        const { id, ...rest } = data;
        return api.entities.Employee.update(id, rest);
      }
      return api.entities.Employee.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowDialog(false);
      toast.success('Collaborateur sauvegardé');
    },
    onError: () => {
      toast.error('Erreur lors de la sauvegarde');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Employee.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Collaborateur supprimé');
    },
    onError: () => {
      toast.error('Erreur lors de la suppression');
    },
  });

  const openNew = () => {
    const nextColor = BARBER_COLORS[employees.length % BARBER_COLORS.length];
    setEditEmployee({ name: '', title: '', bio: '', email: '', phone: '', is_active: true, working_hours: defaultHours, color: nextColor });
    setShowDialog(true);
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {employees.map(emp => (
          <div key={emp.id} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 ring-2"
                style={{ background: (emp.color || BARBER_COLORS[0]) + '22', ringColor: emp.color || BARBER_COLORS[0], borderColor: emp.color || BARBER_COLORS[0], border: `2px solid ${emp.color || BARBER_COLORS[0]}` }}>
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
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Mail className="w-3 h-3" /> {emp.email}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditEmployee({ ...emp, working_hours: emp.working_hours || defaultHours }); setShowDialog(true); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  onClick={() => deleteMutation.mutate(emp.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editEmployee?.id ? 'Modifier' : 'Nouveau'} Collaborateur</DialogTitle>
          </DialogHeader>
          {editEmployee && (
            <div className="space-y-4">
              {/* Photo upload */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 flex items-center justify-center"
                  style={{ borderColor: editEmployee.color || BARBER_COLORS[0], background: (editEmployee.color || BARBER_COLORS[0]) + '22' }}>
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
                    <div key={day} className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-muted-foreground">{DAY_LABELS[day]}</span>
                      <Switch
                        checked={!editEmployee.working_hours?.[day]?.closed}
                        onCheckedChange={v => updateHours(day, 'closed', !v)}
                      />
                      {!editEmployee.working_hours?.[day]?.closed && (
                        <>
                          <Input type="time" value={editEmployee.working_hours?.[day]?.start || '09:00'}
                            onChange={e => updateHours(day, 'start', e.target.value)}
                            className="w-24 h-7 text-xs bg-secondary border-border" />
                          <span className="text-muted-foreground">-</span>
                          <Input type="time" value={editEmployee.working_hours?.[day]?.end || '19:00'}
                            onChange={e => updateHours(day, 'end', e.target.value)}
                            className="w-24 h-7 text-xs bg-secondary border-border" />
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
                onClick={() => saveMutation.mutate(editEmployee)}>
                Sauvegarder
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ImageCropDialog
        open={showCrop}
        onOpenChange={setShowCrop}
        imageSrc={cropSrc}
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