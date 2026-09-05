import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { 
  auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  sendPasswordResetEmail, updateProfile 
} from '../firebase';
import { 
  collection, doc, getDocs, setDoc, updateDoc, query, where, serverTimestamp 
} from 'firebase/firestore';
import { UserRole, Invitation } from '../types';
import { ADMIN_EMAILS } from '../constants';
import ineraLogo from '../Images/Inera logo 1.0 färg.svg';

export interface AuthScreenProps {
  initialError?: string;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ initialError = '' }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const inviteParam = params.get('invite');
      if (inviteParam) {
        setInviteCode(inviteParam.trim());
        setIsRegistering(true);
      }
    }
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanPassword = password;
    const lowerEmail = cleanEmail.toLowerCase();
    const cleanName = displayName.trim();

    try {
      setError('');
      setMessage('');
      setIsProcessing(true);

      if (isForgotPassword) {
        if (!cleanEmail) {
          setError('Ange din e-postadress för att återställa lösenordet.');
          setIsProcessing(false);
          return;
        }
        await sendPasswordResetEmail(auth, cleanEmail);
        setMessage(`En återställningslänk har skickats till ${cleanEmail}. Följ instruktionerna i e-postmeddelandet om du vill välja ett nytt lösenord.`);
        setIsForgotPassword(false);
        setPassword('');
        setConfirmPassword('');
        setIsProcessing(false);
        return;
      }

      if (!cleanEmail || !cleanPassword) {
        setError('Ange både e-postadress och lösenord.');
        setIsProcessing(false);
        return;
      }

      const isAllowedDomain = lowerEmail.endsWith('@inera.se') || lowerEmail.endsWith('@gmail.com') || ADMIN_EMAILS.includes(lowerEmail);

      if (!isAllowedDomain) {
        setError('Bara e-postadresser från inera.se eller godkända domäner är tillåtna.');
        setIsProcessing(false);
        return;
      }

      if (isRegistering) {
        if (!inviteCode.trim()) {
          setError('Inbjudningskod krävs.');
          setIsProcessing(false);
          return;
        }

        if (cleanPassword.length < 6) {
          setError('Lösenordet måste vara minst 6 tecken långt.');
          setIsProcessing(false);
          return;
        }

        if (cleanPassword !== confirmPassword) {
          setError('Lösenorden matchar inte.');
          setIsProcessing(false);
          return;
        }

        const cleanCode = inviteCode.trim();
        const lowerCode = cleanCode.toLowerCase();
        let assignedRole: UserRole = 'viewer';
        let matchedInvitationDoc: any = null;

        // Check fallback general codes
        if (lowerCode === 'ineraux' || lowerCode === 'ineraux2026') {
          assignedRole = ADMIN_EMAILS.includes(lowerEmail) ? 'admin' : 'viewer';
        } else {
          // Check in Firestore invitations collection
          try {
            const q = query(collection(db, 'invitations'), where('code', '==', cleanCode));
            const snap = await getDocs(q);
            if (snap.empty) {
              setError('Det var en felaktig inbjudningskod, kontakta ux@inera.se för korrekt kod.');
              setIsProcessing(false);
              return;
            }

            const invDoc = snap.docs[0];
            const invData = invDoc.data() as Invitation;

            if (invData.status !== 'active') {
              setError('Denna inbjudningskod har redan använts eller är inte längre aktiv.');
              setIsProcessing(false);
              return;
            }

            if (invData.email && invData.email.trim().toLowerCase() !== lowerEmail) {
              setError(`Denna inbjudningskod är utfärdad för e-postadressen ${invData.email}. Vänligen registrera med samma e-postadress.`);
              setIsProcessing(false);
              return;
            }

            assignedRole = invData.role || 'viewer';
            matchedInvitationDoc = invDoc;
          } catch (invErr: any) {
            console.error('Kunde inte verifiera inbjudningskod:', invErr);
            setError('Det var en felaktig inbjudningskod, kontakta ux@inera.se för korrekt kod.');
            setIsProcessing(false);
            return;
          }
        }

        // Super admin emails are always admin
        if (ADMIN_EMAILS.includes(lowerEmail)) {
          assignedRole = 'admin';
        }

        try {
          const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
          const finalName = cleanName || (matchedInvitationDoc?.data()?.name) || cleanEmail.split('@')[0];

          if (finalName) {
            await updateProfile(userCredential.user, { displayName: finalName });
          }

          // Create user document in Firestore
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            email: cleanEmail,
            displayName: finalName,
            role: assignedRole,
            inviteCode: cleanCode,
            isBlocked: false,
            createdAt: serverTimestamp(),
            lastLoggedIn: serverTimestamp()
          }, { merge: true });

          // Mark invitation as used if applicable
          if (matchedInvitationDoc) {
            await updateDoc(doc(db, 'invitations', matchedInvitationDoc.id), {
              status: 'used',
              usedAt: new Date().toISOString(),
              usedBy: userCredential.user.uid
            });
          }
        } catch (regErr: any) {
          if (regErr.code === 'auth/email-already-in-use') {
            setError('Ett konto med den här e-postadressen finns redan. Vänligen logga in.');
            setIsRegistering(false);
          } else if (regErr.code === 'auth/weak-password') {
            setError('Lösenordet måste vara minst 6 tecken långt.');
          } else {
            setError(regErr.message || 'Ett fel uppstod vid registrering.');
          }
        }
      } else {
        try {
          await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        } catch (signInErr: any) {
          if (
            signInErr.code === 'auth/invalid-credential' ||
            signInErr.code === 'auth/wrong-password' ||
            signInErr.code === 'auth/user-not-found'
          ) {
            setError('Felaktig e-postadress eller lösenord.');
          } else {
            setError(signInErr.message || 'Ett fel uppstod vid inloggning.');
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Ett fel uppstod.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-inera-secondary-95 p-4">
      <div className="card p-8 shadow-xl max-w-md w-full text-center border-inera-secondary-90 bg-white">
        <div className="flex justify-center mb-6">
          <img src={ineraLogo} alt="Inera Logotyp" className="h-12 w-auto" />
        </div>
        <h1 className="text-2xl font-bold font-display text-inera-primary-40 mb-1">SUS-analys</h1>
        <p className="text-sm text-inera-neutral-40 mb-8">
          {isForgotPassword 
            ? 'Återställ ditt lösenord' 
            : isRegistering 
              ? 'Skapa ett konto med din Inera-adress och inbjudningskod' 
              : 'Logga in för att hantera och visualisera SUS-mätningar för Ineras tjänster.'}
        </p>

        {error && (
          <div className="bg-inera-error-95 text-inera-error-40 border border-inera-error-40 p-4 rounded-lg text-sm text-left mb-6 flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="bg-inera-success-95 text-inera-success-40 border border-inera-success-40 p-4 rounded-lg text-sm text-left mb-6 flex items-start gap-2">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4 text-left mb-4">
          {isRegistering && (
            <div>
              <label className="block text-sm font-bold text-inera-neutral-20 mb-1">
                Inbjudningskod <span className="text-inera-error-40">*</span>
              </label>
              <input 
                type="password" 
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="input w-full font-mono text-sm"
                placeholder="Inbjudningskod"
                required
              />
            </div>
          )}

          {isRegistering && (
            <div>
              <label className="block text-sm font-bold text-inera-neutral-20 mb-1">
                Fullständigt namn / Visningsnamn
              </label>
              <input 
                type="text" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input w-full"
                placeholder="t.ex. Anna Svensson"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-inera-neutral-20 mb-1">E-post <span className="text-inera-error-40">*</span></label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full"
              placeholder="namn@inera.se"
              required
            />
          </div>

          {!isForgotPassword && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-bold text-inera-neutral-20">
                  {isRegistering ? 'Välj lösenord' : 'Lösenord'} <span className="text-inera-error-40">*</span>
                </label>
                {!isRegistering && (
                  <button 
                    type="button"
                    onClick={() => { setIsForgotPassword(true); setError(''); setMessage(''); }}
                    className="text-xs text-inera-primary-40 hover:underline font-semibold"
                  >
                    Glömt lösenordet?
                  </button>
                )}
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full"
                placeholder="Minst 6 tecken"
                required
              />
            </div>
          )}

          {isRegistering && (
            <div>
              <label className="block text-sm font-bold text-inera-neutral-20 mb-1">
                Bekräfta lösenord <span className="text-inera-error-40">*</span>
              </label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input w-full"
                placeholder="Upprepa valt lösenord"
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isProcessing || (isRegistering && !inviteCode.trim())}
            className="w-full btn btn--l btn--primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing && <Loader2 size={18} className="animate-spin" />}
            <span>
              {isForgotPassword ? 'Återställ lösenord' : (isRegistering ? 'Registrera' : 'Logga in')}
            </span>
          </button>
        </form>

        {isForgotPassword ? (
          <button 
            onClick={() => { setIsForgotPassword(false); setError(''); setMessage(''); }}
            type="button"
            className="text-sm text-inera-primary-40 hover:underline font-bold mt-4"
          >
            Tillbaka till inloggning
          </button>
        ) : (
          <button 
            onClick={() => { setIsRegistering(!isRegistering); setError(''); setMessage(''); }}
            type="button"
            className="text-sm text-inera-primary-40 hover:underline font-bold mt-4 block mx-auto"
          >
            {isRegistering ? 'Har du redan ett konto? Logga in.' : 'Inget konto? Skapa ett här.'}
          </button>
        )}
      </div>
    </div>
  );
};
export default AuthScreen;
