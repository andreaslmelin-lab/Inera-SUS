import React, { useState } from 'react';
import { ShieldAlert, AlertCircle, Loader2, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { User, auth, db, updatePassword } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export interface ForcePasswordChangeModalProps {
  user: User;
  onPasswordChanged: () => void;
}

export const ForcePasswordChangeModal: React.FC<ForcePasswordChangeModalProps> = ({ 
  user, 
  onPasswordChanged 
}) => {
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 6) {
      setErr('Lösenordet måste vara minst 6 tecken.');
      return;
    }
    if (newPass !== confirmPass) {
      setErr('Lösenorden matchar inte.');
      return;
    }

    setLoading(true);
    setErr('');
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPass);
      }
      await updateDoc(doc(db, 'users', user.uid), {
        mustChangePassword: false,
        passwordLastChangedAt: serverTimestamp()
      });
      onPasswordChanged();
    } catch (e: any) {
      console.error('Fel vid lösenordsbyte:', e);
      if (e.code === 'auth/requires-recent-login') {
        setErr('Säkerhetskrav: Logga ut och in igen för att byta lösenord.');
      } else {
        setErr(e.message || 'Kunde inte uppdatera lösenordet.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card p-6 shadow-2xl max-w-md w-full border-inera-secondary-90 bg-white space-y-4"
      >
        <div className="flex items-center gap-3 text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
          <ShieldAlert size={28} className="shrink-0 text-amber-600" />
          <div>
            <h3 className="text-base font-bold text-amber-900 font-display">Lösenordsbyte krävs</h3>
            <p className="text-xs text-amber-800">Din administratör har begärt att du byter lösenord för ditt konto.</p>
          </div>
        </div>

        {err && (
          <div className="p-3 bg-inera-error-95 border border-inera-error-40 text-inera-error-40 text-xs font-bold rounded-lg flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{err}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-bold text-inera-neutral-20">Nytt lösenord (minst 6 tecken)</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="Ange nytt lösenord..."
              className="input w-full text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-inera-neutral-20">Bekräfta nytt lösenord</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="Upprepa nytt lösenord..."
              className="input w-full text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn--m btn--primary w-full flex items-center justify-center gap-2 mt-4"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
            <span>Spara nytt lösenord & Fortsätt</span>
          </button>
        </form>
      </motion.div>
    </div>
  );
};
export default ForcePasswordChangeModal;
