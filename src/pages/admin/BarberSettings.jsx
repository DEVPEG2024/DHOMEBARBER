import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Camera, LogOut, Loader2, User, Save, Clock } from 'lucide-react';
import ImageCropDialog from '@/components/shared/ImageCropDialog';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche' };
const defaultHours = DAYS.reduce((acc, d) => ({
  ...acc,
  [d]: d === 'sunday' ? { start: '09:00', end: '19:00', closed: true } : { start: '09:00', end: '19:00', closed: false }
}), {});

function SkillSlider({ category, value, onChange }) {
  const level = value || 0;
  const labels = ['Non évalué', 'Débutant', 'Intermédiaire', 'Avancé', 'Expert', 'Maître'];

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-xl border border-border bg-secondary/30 p-4"
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
          style={{ backgroundColor: category.color + '20' }}
        >
          {category.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{category.name}</p>
          <p className="text-[11px] font-medium" style={{ color: level > 0 ? '#22c55e' : 'var(--muted-foreground)' }}>
            {labels[level]}
          </p>
        </div>
        <motion.span
          key={level}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          className="text-lg font-bold tabular-nums"
          style={{ color: level > 0 ? '#22c55e' : 'var(--muted-foreground)' }}
        >
          {level}/5
        </motion.span>
      </div>

      {/* Green gauge - full bar, clickable zones */}
      <div
        className="relative h-6 rounded-full overflow-hidden cursor-pointer"
        style={{ backgroundColor: '#27272a', border: '2px solid #3f3f46' }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const pct = x / rect.width;
          const newLevel = Math.ceil(pct * 5);
          onChange(newLevel === level ? 0 : newLevel);
        }}
      >
        <motion.div
          initial={false}
          animate={{ width: `${(level / 5) * 100}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            backgroundColor: '#22c55e',
            boxShadow: level > 0 ? '0 0 12px rgba(34, 197, 94, 0.4)' : 'none',
          }}
        />
      </div>
      <div className="flex justify-between mt-1.5 px-1">
        <span className="text-[9px] text-muted-foreground">0</span>
        <span className="text-[9px] text-muted-foreground">1</span>
        <span className="text-[9px] text-muted-foreground">2</span>
        <span className="text-[9px] text-muted-foreground">3</span>
        <span className="text-[9px] text-muted-foreground">4</span>
        <span className="text-[9px] text-muted-foreground">5</span>
      </div>
    </motion.div>
  );
}

function ExperienceGauge({ value }) {
  const getColor = (v) => {
    if (v < 25) return '#ef4444';
    if (v < 50) return '#f59e0b';
    if (v < 75) return '#3b82f6';
    return '#3fcf8e';
  };
  const getLabel = (v) => {
    if (v === 0) return 'Aucune compétence';
    if (v < 25) return '🌱 Junior';
    if (v < 50) return '💪 Confirmé';
    if (v < 75) return '🔥 Expérimenté';
    if (v < 90) return '⭐ Expert';
    return '👑 Maître';
  };

  const color = getColor(value);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-base font-bold" style={{ color }}>{getLabel(value)}</span>
        </div>
        <motion.span
          key={value}
          initial={{ scale: 1.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-2xl font-bold tabular-nums"
          style={{ color }}
        >
          {value}%
        </motion.span>
      </div>

      {/* Track */}
      <div className="relative h-4 rounded-full overflow-hidden bg-secondary">
        <motion.div
          initial={false}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: `linear-gradient(90deg, #ef4444, #f59e0b, #3b82f6, #3fcf8e)`,
            boxShadow: `0 0 12px ${color}40`,
          }}
        />
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
        <span>🌱 0</span>
        <span>💪 25</span>
        <span>🔥 50</span>
        <span>⭐ 75</span>
        <span>👑 100</span>
      </div>
    </div>
  );
}

export default function BarberSettings() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [showCrop, setShowCrop] = useState(false);
  const [skills, setSkills] = useState(null);
  const [bio, setBio] = useState('');
  const [workingHours, setWorkingHours] = useState(null);
  const [dirty, setDirty] = useState(false);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list('-created_at', 100),
  });

  const { data: skillCategories = [] } = useQuery({
    queryKey: ['skillCategories'],
    queryFn: () => base44.entities.SkillCategory.list('sort_order', 100),
  });

  const employee = employees.find(e => e.id === user?.employee_id);

  // Init from employee data
  useEffect(() => {
    if (employee && skills === null) {
      setSkills(employee.skills || []);
      setBio(employee.bio || '');
      setWorkingHours(employee.working_hours || defaultHours);
    }
  }, [employee]);

  // Calcul automatique du niveau d'expérience à partir des compétences
  const computedExperience = (() => {
    if (!skills || skills.length === 0 || skillCategories.length === 0) return 0;
    const totalPossible = skillCategories.length * 5;
    const totalPoints = skills.reduce((sum, s) => sum + (s.level || 0), 0);
    return Math.round((totalPoints / totalPossible) * 100);
  })();

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Employee.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
    },
  });

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !employee) return;
    const reader = new FileReader();
    reader.onload = () => { setCropSrc(reader.result); setShowCrop(true); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCroppedPhoto = async (croppedFile) => {
    if (!employee) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: croppedFile });
      updateMutation.mutate({ id: employee.id, data: { photo_url: file_url } }, {
        onSuccess: () => toast.success('Photo mise à jour'),
      });
    } catch {
      toast.error("Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  };

  const getSkillLevel = (categoryId) => {
    const s = (skills || []).find(s => s.category_id === categoryId);
    return s?.level || 0;
  };

  const updateHours = (day, field, value) => {
    setDirty(true);
    setWorkingHours(prev => ({
      ...prev,
      [day]: { ...prev?.[day], [field]: value }
    }));
  };

  const setSkillLevel = (categoryId, level) => {
    setDirty(true);
    setSkills(prev => {
      const existing = (prev || []).filter(s => s.category_id !== categoryId);
      if (level > 0) {
        return [...existing, { category_id: categoryId, level }];
      }
      return existing;
    });
  };

  const saveProfile = () => {
    if (!employee) return;
    updateMutation.mutate({
      id: employee.id,
      data: { skills, bio, experience_level: computedExperience, working_hours: workingHours }
    }, {
      onSuccess: () => {
        toast.success('Profil sauvegardé ✨');
        setDirty(false);
      },
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Mon compte</p>
          <h1 className="font-display text-2xl font-bold">Paramètres</h1>
        </div>
        {dirty && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <Button
              onClick={saveProfile}
              disabled={updateMutation.isPending}
              className="bg-primary text-primary-foreground text-xs"
            >
              {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Sauvegarder
            </Button>
          </motion.div>
        )}
      </div>

      <div className="space-y-6 max-w-md">
        {/* Profile photo */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-5">📸 Photo de profil</h3>
          <div className="flex items-center gap-5">
            <div className="relative group">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-secondary border border-border flex items-center justify-center">
                {employee?.photo_url ? (
                  <img src={employee.photo_url} alt={employee.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-muted-foreground/40" />
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{employee?.name || user?.full_name || '—'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
              <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Upload...</> : <><Camera className="w-3 h-3 mr-1.5" />Changer la photo</>}
              </Button>
            </div>
          </div>
        </div>

        {/* Bio */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">📝 À propos de moi</h3>
          <p className="text-[11px] text-muted-foreground mb-4">Présentez-vous aux clients en quelques lignes</p>
          <Textarea
            value={bio}
            onChange={(e) => { setBio(e.target.value); setDirty(true); }}
            placeholder="Ex: Passionné par la coiffure depuis 10 ans, spécialisé dans les coupes modernes et les dégradés..."
            className="bg-secondary border-border text-sm"
            rows={4}
          />
        </motion.div>

        {/* Working Hours */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Mes horaires
          </h3>
          <p className="text-[11px] text-muted-foreground mb-4">Définissez vos jours et heures de travail</p>
          <div className="space-y-2">
            {DAYS.map(day => {
              const dayData = workingHours?.[day] || defaultHours[day];
              const isOpen = !dayData?.closed;
              return (
                <div
                  key={day}
                  className={`rounded-lg px-3 py-2.5 transition-colors ${isOpen ? 'bg-secondary/50' : 'bg-secondary/20'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={isOpen}
                        onCheckedChange={v => updateHours(day, 'closed', !v)}
                      />
                      <span className={`text-sm font-medium ${isOpen ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {DAY_LABELS[day]}
                      </span>
                    </div>
                    {!isOpen && (
                      <span className="text-xs text-muted-foreground/60 italic">Repos</span>
                    )}
                  </div>
                  {isOpen && (
                    <div className="flex items-center gap-2 mt-2 ml-[52px]">
                      <Input
                        type="time"
                        value={dayData?.start || '09:00'}
                        onChange={e => updateHours(day, 'start', e.target.value)}
                        className="flex-1 h-9 text-sm text-center bg-background border-border font-medium"
                      />
                      <span className="text-muted-foreground text-xs">→</span>
                      <Input
                        type="time"
                        value={dayData?.end || '19:00'}
                        onChange={e => updateHours(day, 'end', e.target.value)}
                        className="flex-1 h-9 text-sm text-center bg-background border-border font-medium"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Skills */}
        {skillCategories.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-card border border-border rounded-xl p-6"
          >
            <h3 className="text-sm font-semibold mb-1">🎯 Mes spécialités</h3>
            <p className="text-[11px] text-muted-foreground mb-5">Évaluez votre niveau de 1 à 5</p>

            <div className="space-y-5">
              {skillCategories.map((cat, i) => (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <SkillSlider
                    category={cat}
                    value={getSkillLevel(cat.id)}
                    onChange={(level) => setSkillLevel(cat.id, level)}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Experience Level Gauge - calculé automatiquement */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">🏆 Niveau d'expérience</h3>
          <p className="text-[11px] text-muted-foreground mb-4">Calculé automatiquement selon vos compétences</p>
          <ExperienceGauge value={computedExperience} />
        </motion.div>

        {/* Account info */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-4">👤 Informations du compte</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nom</span>
              <span className="font-medium">{user?.full_name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user?.email || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rôle</span>
              <span className="font-medium capitalize">{user?.role || '—'}</span>
            </div>
          </div>
        </div>

        {/* Logout */}
        <Button
          onClick={logout}
          variant="outline"
          className="w-full border-red-500/20 bg-red-500/8 text-red-400 hover:bg-red-500/15 hover:text-red-400"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Déconnexion
        </Button>
      </div>

      <ImageCropDialog
        open={showCrop}
        onOpenChange={setShowCrop}
        imageSrc={cropSrc}
        onCropComplete={handleCroppedPhoto}
      />
    </div>
  );
}
