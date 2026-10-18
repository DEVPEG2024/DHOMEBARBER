import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, ImagePlus, Loader2, Send, Trash2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { hapticFeedback } from '@/lib/capacitor';
import { isNetworkError } from '@/components/shared/LoadError';
import {
  FEEDBACK_TYPES, FEEDBACK_AREAS, MESSAGE_MAX, collectContext, isBackendMissing,
} from '@/lib/feedbackApi';

const MIN_LENGTH = 10;

/**
 * Formulaire d'envoi d'un bug ou d'une suggestion, en bottom sheet. Fermeture par la croix
 * uniquement (règle des fenêtres de l'app). `salonEmail` sert de repli si le serveur ne connaît
 * pas encore l'entité : le message part alors par email.
 */
export default function FeedbackSheet({ type: initialType = 'bug', salonEmail, onClose, onSent }) {
  const [type, setType] = useState(initialType);
  const [message, setMessage] = useState('');
  const [area, setArea] = useState('');
  const [screenshot, setScreenshot] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [fallback, setFallback] = useState(false);
  const meta = FEEDBACK_TYPES[type];
  const trimmed = message.trim();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      setScreenshot(file_url);
    } catch (err) {
      // « Load failed » / « Failed to fetch » traduits ; le message HEIC d'UploadFile reste affiché
      toast.error(isNetworkError(err)
        ? 'Pas de connexion internet. Vérifiez votre réseau puis réessayez.'
        : (err?.message && !/^HTTP \d+$/.test(err.message) ? err.message : "Impossible d'ajouter la capture"));
    } finally {
      setUploading(false);
    }
  };

  const mailtoHref = () => {
    const subject = `${meta.label} — app D'Home Barber`;
    const areaText = FEEDBACK_AREAS.find(a => a.value === area)?.label;
    const body = `${trimmed}${area ? `\n\nEndroit : ${areaText}` : ''}`;
    return `mailto:${salonEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const submit = async () => {
    if (trimmed.length < MIN_LENGTH) {
      toast.error('Dites-nous-en un peu plus (10 caractères minimum).');
      return;
    }
    setSending(true);
    hapticFeedback();
    try {
      const context = await collectContext();
      await api.entities.Feedback.create({
        type,
        message: trimmed.slice(0, MESSAGE_MAX),
        area: area || null,
        screenshot_url: screenshot || null,
        context,
      });
      toast.success(type === 'bug' ? 'Merci, le bug est signalé 🙏' : 'Merci pour votre idée 💡');
      onSent?.();
      onClose?.();
    } catch (err) {
      if (isBackendMissing(err) && salonEmail) {
        setFallback(true);
      } else if (isNetworkError(err)) {
        toast.error('Pas de connexion internet. Vérifiez votre réseau puis réessayez.');
      } else {
        // Message du serveur (trop d'envois, message refusé…), sinon un texte lisible
        const serverMessage = err?.data?.error || err?.data?.message;
        toast.error(serverMessage || (err?.status >= 500
          ? 'Le serveur ne répond pas. Réessayez dans un instant.'
          : "Erreur lors de l'envoi"));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/65"
        aria-hidden="true"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-sheet-title"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-lg max-h-[92vh] rounded-t-3xl border-t border-white/10 bg-background flex flex-col overflow-hidden"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/5 border border-white/10 text-muted-foreground flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold">Aide-nous à progresser</p>
          <h2 id="feedback-sheet-title" className="font-display text-2xl font-bold text-foreground mt-1 pr-12">
            {meta.emoji} {meta.title}
          </h2>

          {fallback ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                L’envoi depuis l’app arrive très bientôt. En attendant, votre message part par email au salon : il est déjà rédigé.
              </p>
              <a
                href={mailtoHref()}
                onClick={() => setTimeout(() => onClose?.(), 300)}
                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" /> Envoyer par email
              </a>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {/* Bug / suggestion */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-white/4 border border-white/8">
                {Object.entries(FEEDBACK_TYPES).map(([key, t]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key)}
                    aria-pressed={type === key}
                    className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${type === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  >
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>

              <div>
                <label htmlFor="feedback-message" className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  {type === 'bug' ? 'Décrivez le problème' : 'Votre idée'}
                </label>
                <textarea
                  id="feedback-message"
                  value={message}
                  onChange={e => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                  placeholder={meta.placeholder}
                  rows={5}
                  className="w-full rounded-2xl bg-white/4 border border-white/10 p-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 resize-none"
                />
                <p className="text-[10px] text-muted-foreground text-right mt-1">{message.length} / {MESSAGE_MAX}</p>
              </div>

              <div>
                <label htmlFor="feedback-area" className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Où dans l’app ? <span className="font-normal">(facultatif)</span>
                </label>
                <select
                  id="feedback-area"
                  value={area}
                  onChange={e => setArea(e.target.value)}
                  className="w-full rounded-2xl bg-white/4 border border-white/10 px-3.5 py-3 text-sm text-foreground focus:outline-none focus:border-primary/50"
                >
                  {FEEDBACK_AREAS.map(a => <option key={a.value} value={a.value} className="bg-background">{a.label}</option>)}
                </select>
              </div>

              {/* Capture d'écran */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                  Capture d’écran <span className="font-normal">(facultatif)</span>
                </p>
                {screenshot ? (
                  <div className="relative w-28">
                    <img src={screenshot} alt="Capture jointe" className="w-28 h-40 object-cover rounded-xl border border-white/10" />
                    <button
                      type="button"
                      onClick={() => setScreenshot('')}
                      aria-label="Retirer la capture"
                      className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className={`flex items-center gap-2 w-full rounded-2xl border border-dashed border-white/15 px-3.5 py-3 text-sm text-muted-foreground cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4 text-primary" />}
                    {uploading ? 'Ajout de la capture…' : 'Ajouter une capture'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
                  </label>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                On joint votre nom et quelques infos techniques (téléphone, version de l’app) pour reproduire le souci. Vous suivez la réponse ici, dans Paramètres.
              </p>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={submit}
                disabled={sending || uploading || trimmed.length < MIN_LENGTH}
                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Envoi…' : 'Envoyer'}
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
