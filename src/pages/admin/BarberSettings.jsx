import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Camera, LogOut, Loader2, User, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

function SkillSlider({ category, value, onChange }) {
  const level = value || 0;
  const labels = ['', 'Débutant', 'Intermédiaire', 'Avancé', 'Expert', 'Maître'];

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="group"
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-lg transition-transform group-hover:scale-110"
          style={{ backgroundColor: category.color + '20', boxShadow: `0 4px 12px ${category.color}30` }}
        >
          {category.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{category.name}</p>
          <p className="text-[11px] font-medium transition-colors" style={{ color: level > 0 ? category.color : 'var(--muted-foreground)' }}>
            {labels[level] || 'Non évalué'}
          </p>
        </div>
        <span className="text-lg font-bold tabular-nums" style={{ color: level > 0 ? category.color : 'var(--muted-foreground)' }}>
          {level > 0 ? `${level}/5` : '—'}
        </span>
      </div>

      {/* Gauge */}
      <div className="flex gap-1.5 ml-[52px]">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(level === n ? 0 : n)}
            className="relative flex-1 h-3 rounded-full overflow-hidden transition-all duration-200"
            style={{ backgroundColor: 'var(--secondary)' }}
          >
            <motion.div
              initial={false}
              animate={{
                width: n <= level ? '100%' : '0%',
                opacity: n <= level ? 1 : 0,
              }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            <motion.div
              initial={false}
              animate={{ scale: n <= level ? [1, 1.4, 1] : 1 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 rounded-full"
              style={{
                backgroundColor: n <= level ? category.color : 'transparent',
                boxShadow: n <= level ? `0 0 8px ${category.color}60` : 'none',
              }}
            />
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function ExperienceGauge({ value, onChange }) {
  const getColor = (v) => {
    if (v < 25) return '#ef4444';
    if (v < 50) return '#f59e0b';
    if (v < 75) return '#3b82f6';
    return '#3fcf8e';
  };
  const getLabel = (v) => {
    if (v === 0) return 'Non défini';
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
      <div className="relative h-4 rounded-full overflow-hidden bg-secondary mb-2">
        <motion.div
          initial={false}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: `linear-gradient(90deg, #ef4444, #f59e0b, #3b82f6, #3fcf8e)`,
            boxShadow: `0 0 12px ${color}40`,
          }}
        />
      </div>

      {/* Slider input */}
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 appearance-none bg-transparent cursor-pointer"
        style={{
          accentColor: color,
        }}
      />

      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
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
  const [skills, setSkills] = useState(null);
  const [bio, setBio] = useState('');
  const [experienceLevel, setExperienceLevel] = useState(0);
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
      setExperienceLevel(employee.experience_level || 0);
    }
  }, [employee]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Employee.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
    },
  });

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !employee) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
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
      data: { skills, bio, experience_level: experienceLevel }
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

        {/* Experience Level Gauge */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">🏆 Niveau d'expérience</h3>
          <p className="text-[11px] text-muted-foreground mb-4">Ajustez votre niveau global d'expérience</p>
          <ExperienceGauge
            value={experienceLevel}
            onChange={(v) => { setExperienceLevel(v); setDirty(true); }}
          />
        </motion.div>

        {/* Skills */}
        {skillCategories.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
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
    </div>
  );
}
