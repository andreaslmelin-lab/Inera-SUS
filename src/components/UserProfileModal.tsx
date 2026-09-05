import React, { useState } from 'react';
import { User, auth, db, updatePassword, updateProfile } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { motion } from 'motion/react';
import { 
  User as LucideUser, X, AlertCircle, CheckCircle2, ShieldCheck, 
  Edit3, Key, Loader2 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { UserRole } from '../types';

export interface UserProfileModalProps {
  user: User;
  userDoc: any;
  userRole: UserRole;
  onClose: () => void;
  onUpdated: (newName: string) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  userDoc,
  userRole,
  onClose,
  onUpdated
}) => {
  const [displayName, setDisplayName] = useState(userDoc?.displayName || user.displayName || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const cleanName = displayName.trim();
      if (!cleanName) {
        setError('Visningsnamn kan inte vara tomt.');
        setLoading(false);
        return;
      }

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: cleanName });
      }
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: cleanName
      });

      if (isChangingPassword && newPassword) {
        if (newPassword.length < 6) {
          setError('Lösenordet måste vara minst 6 tecken långt.');
          setLoading(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setError('Lösenorden matchar inte.');
          setLoading(false);
          return;
        }
        if (auth.currentUser) {
          await updatePassword(auth.currentUser, newPassword);
          await updateDoc(doc(db, 'users', user.uid), {
            passwordLastChangedAt: serverTimestamp(),
            mustChangePassword: false
          });
        }
      }

      setSuccess('Din profil har uppdaterats!');
      onUpdated(cleanName);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setError('Av säkerhetsskäl krävs att du nyligen loggat in för att byta lösenord. Vänligen logga ut och in igen.');
      } else {
        setError(err.message || 'Kunde inte spara ändringar.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadge = () => {
    if (userRole === 'admin') {
      return {
        label: 'Administratör (Admin)',
        desc: 'Fullständig systembehörighet. Kan administrera alla användare, inbjudningar, grundstruktur, kataloger och alla SUS-mätningar.',
        color: 'bg-inera-primary-40/10 text-inera-primary-40 border-inera-primary-40/30'
      };
    }
    if (userRole === 'editor') {
      return {
        label: 'Redaktör (Editor)',
        desc: 'Skapande och redigering. Kan skapa och hantera SUS-omgångar, ladda upp mätningar och analysera alla resultat.',
        color: 'bg-inera-accent-40/10 text-inera-accent-40 border-inera-accent-40/30'
      };
    }
    return {
      label: 'Läsbehörig (Viewer)',
      desc: 'Granskningsbehörighet. Kan se dashboards, SUS-poäng, grafer, svar, kommentarssyntes och exportera data.',
      color: 'bg-inera-secondary-90 text-inera-neutral-20 border-inera-secondary-90'
    };
  };

  const roleInfo = getRoleBadge();

  return (
    <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card p-6 sm:p-7 shadow-xl max-w-lg w-full border-inera-secondary-90 bg-white space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-inera-secondary-90">
          <div className="flex items-center gap-3 text-inera-primary-40">
            <div className="w-10 h-10 rounded-full bg-inera-primary-40/10 flex items-center justify-center">
              <LucideUser size={22} className="text-inera-primary-40" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-display text-inera-neutral-10">Användarprofil</h3>
              <p className="text-xs text-inera-neutral-40">{user.email}</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-inera-neutral-40 hover:text-inera-neutral-10 p-1.5 rounded-lg hover:bg-inera-secondary-95"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="bg-inera-error-95 text-inera-error-40 border border-inera-error-40 p-3 rounded-lg text-xs flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-inera-success-95 text-inera-success-40 border border-inera-success-40 p-3 rounded-lg text-xs flex items-start gap-2">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <div className={cn("p-3.5 rounded-xl border text-xs space-y-1", roleInfo.color)}>
          <div className="flex items-center gap-2 font-bold">
            <ShieldCheck size={16} />
            <span>Roll: {roleInfo.label}</span>
          </div>
          <p className="opacity-90 leading-relaxed">{roleInfo.desc}</p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-inera-neutral-30 flex items-center gap-1.5">
              <Edit3 size={14} className="text-inera-primary-40" />
              Visningsnamn (För- och efternamn)
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="t.ex. Andreas Melin"
              className="input w-full text-sm"
              required
            />
            <p className="text-[11px] text-inera-neutral-40">Detta namn visas i menyer och rapporter.</p>
          </div>

          <div className="pt-2 border-t border-inera-secondary-90 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-inera-neutral-30 flex items-center gap-1.5">
                <Key size={14} className="text-inera-accent-40" />
                Byt lösenord
              </label>
              <button
                type="button"
                onClick={() => setIsChangingPassword(!isChangingPassword)}
                className="text-xs font-bold text-inera-primary-40 hover:underline"
              >
                {isChangingPassword ? 'Avbryt lösenordsbyte' : 'Ändra lösenord'}
              </button>
            </div>

            {isChangingPassword && (
              <div className="space-y-3 p-3 bg-inera-secondary-95 rounded-xl border border-inera-secondary-90">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-inera-neutral-30">Nytt lösenord</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minst 6 tecken"
                    className="input w-full text-sm bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-inera-neutral-30">Bekräfta nytt lösenord</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Upprepa nytt lösenord"
                    className="input w-full text-sm bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-inera-secondary-90">
            <button 
              type="button" 
              onClick={onClose} 
              disabled={loading}
              className="btn btn--m btn--secondary"
            >
              Avbryt
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="btn btn--m btn--primary flex items-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Spara ändringar
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
export default UserProfileModal;
