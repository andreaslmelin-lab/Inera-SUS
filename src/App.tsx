import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Legend, Cell, PieChart, Pie
} from 'recharts';
import { 
  Upload, LayoutDashboard, Database, LogOut, ChevronRight, 
  TrendingUp, Users, MessageSquare, Filter, FileSpreadsheet,
  AlertCircle, CheckCircle2, Loader2, Search, ArrowLeft,
  Info, Calendar, ArrowUpRight, ArrowDownRight, Trash2, Settings,
  User as LucideUser, RefreshCw, Menu, X, ChevronDown, LayoutGrid,
  GitFork, Building2, Activity, Award, GraduationCap, Layers, CheckSquare,
  Edit3, Key, Lock, ShieldAlert
} from 'lucide-react';
import { auth, googleProvider, signInWithPopup, onAuthStateChanged, User, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword } from './firebase';
import { Product, ProductService, Measurement, MeasurementService, ResponseData, Variant } from './services';
import { loadProductMappings } from './services/catalogMappingService';
import { triggerSusMetricsSync } from './services/syncService';
import { cn, getSusGrade, calculateMedian, getMedianExplanation } from './lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot, query, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import ApiView from './components/ApiView';
import RawDataView from './components/RawDataView';
import CatalogMappingView from './components/CatalogMappingView';
import GrundstrukturView from './components/GrundstrukturView';
import SusAdminView from './components/SusAdminView';
import PublicSurveyView from './components/PublicSurveyView';
import ineraLogo from './Images/Inera logo 1.0 färg.svg';

const ADMIN_EMAILS = ['andreas.melin@inera.se', 'andreas.melin@inera', 'andreas.l.melin@gmail.com'];

// --- Components ---

const AuthScreen = ({ initialError = '' }: { initialError?: string }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState('');
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanPassword = password;
    const lowerEmail = cleanEmail.toLowerCase();

    try {
      setError('');
      setMessage('');

      if (isForgotPassword) {
        if (!cleanEmail) {
          setError('Ange din e-postadress för att återställa lösenordet.');
          return;
        }
        await sendPasswordResetEmail(auth, cleanEmail);
        setMessage(`En återställningslänk har skickats till ${cleanEmail}. Följ instruktionerna i e-postmeddelandet om du vill välja ett nytt lösenord.`);
        setIsForgotPassword(false);
        setPassword('');
        return;
      }

      if (!cleanEmail || !cleanPassword) {
        setError('Ange både e-postadress och lösenord.');
        return;
      }

      const isAllowedDomain = lowerEmail.endsWith('@inera.se') || lowerEmail.endsWith('@gmail.com') || ADMIN_EMAILS.includes(lowerEmail);

      if (!isAllowedDomain) {
        setError('Bara e-postadresser från inera.se eller godkända domäner är tillåtna.');
        return;
      }

      if (isRegistering) {
        if (!inviteCode.trim()) {
          setError('Inbjudningskod krävs.');
          return;
        }
        const cleanCode = inviteCode.trim().toLowerCase();
        if (cleanCode !== 'ineraux' && cleanCode !== 'ineraux2026') {
          setError('Det var en felaktig inbjudningskod, kontakta ux@inera.se för korrekt kod.');
          return;
        }

        try {
          await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
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
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-inera-secondary-95 p-4">
      <div className="card p-8 shadow-xl max-w-md w-full text-center border-inera-secondary-90 bg-white">
        <div className="flex justify-center mb-6">
          <img src={ineraLogo} alt="Inera Logotyp" className="h-12 w-auto" />
        </div>
        <h1 className="text-2xl font-bold font-display text-inera-primary-40 mb-1">Inera SUS Analys</h1>
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
          <div>
            <label className="block text-sm font-bold text-inera-neutral-20 mb-1">E-post</label>
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
                <label className="block text-sm font-bold text-inera-neutral-20">Lösenord</label>
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
                placeholder="Min. 6 tecken"
                required
              />
            </div>
          )}
          <button
            type="submit"
            disabled={isRegistering && !inviteCode.trim()}
            className="w-full btn btn--l btn--primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isForgotPassword ? 'Återställ lösenord' : (isRegistering ? 'Registrera' : 'Logga in')}
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

const AdminView = ({ 
  activeAdminTab = 'users',
  uploadNode,
  onResetCatalog
}: { 
  activeAdminTab?: 'users' | 'upload' | 'api' | 'rawdata' | 'catalog' | 'grundstruktur';
  uploadNode?: React.ReactNode;
  onResetCatalog?: () => void;
}) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals state
  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  const [userToEditName, setUserToEditName] = useState<any | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  const [userToChangePassword, setUserToChangePassword] = useState<any | null>(null);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [forceChangeOnLogin, setForceChangeOnLogin] = useState(true);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = collection(db, 'users');
      const snap = await getDocs(q);
      const userList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(userList);
    } catch(err: any) {
      setError(err.message || 'Kunde inte hämta användare');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleBlock = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isBlocked: !currentStatus
      });
      fetchUsers();
    } catch(err: any) {
      setError(err.message || 'Kunde inte blockera/avblockera användare');
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    try {
      await deleteDoc(doc(db, 'users', userToDelete.id));
      setUserToDelete(null);
      await fetchUsers();
    } catch(err: any) {
      setError(err.message || 'Kunde inte radera användaren');
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleSaveName = async () => {
    if (!userToEditName) return;
    setIsSavingName(true);
    setError('');
    try {
      await updateDoc(doc(db, 'users', userToEditName.id), {
        displayName: editDisplayName.trim()
      });
      setSuccessMsg(`Namnet uppdaterades för ${userToEditName.email}`);
      setTimeout(() => setSuccessMsg(''), 4000);
      setUserToEditName(null);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Kunde inte uppdatera namnet');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSavePasswordChange = async () => {
    if (!userToChangePassword) return;
    setIsSavingPassword(true);
    setError('');
    try {
      await updateDoc(doc(db, 'users', userToChangePassword.id), {
        mustChangePassword: forceChangeOnLogin,
        passwordChangedByAdminAt: serverTimestamp()
      });

      if (auth.currentUser && auth.currentUser.uid === userToChangePassword.id && adminNewPassword) {
        await updatePassword(auth.currentUser, adminNewPassword);
      }

      setSuccessMsg(`Lösenordsinställning sparades för ${userToChangePassword.displayName || userToChangePassword.email}. Användaren ombes byta lösenord vid nästa inloggning.`);
      setTimeout(() => setSuccessMsg(''), 5000);
      setUserToChangePassword(null);
      setAdminNewPassword('');
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Kunde inte uppdatera lösenordet');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSendResetEmail = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMsg(`Återställningslänk skickad till ${email}`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setError(err.message || 'Kunde inte skicka återställningslänk');
    }
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin text-inera-primary-40 mx-auto" size={32} /></div>;

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {activeAdminTab === 'users' && (
          <motion.div
            key="users"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="card p-6 shadow-md border-inera-secondary-90 bg-white"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold font-display text-inera-neutral-10">Användarhantering</h2>
                <p className="text-xs text-inera-neutral-40">Hantera konton, uppdatera namn, sätt nya lösenord och blockera användare.</p>
              </div>
            </div>

            {error && <div className="text-inera-error-40 mb-4 bg-inera-error-95 border-inera-error-40 border p-4 rounded-lg">{error}</div>}
            {successMsg && <div className="text-inera-success-40 mb-4 bg-inera-success-95 border-inera-success-40 border p-4 rounded-lg flex items-center gap-2"><CheckCircle2 size={18} /><span>{successMsg}</span></div>}
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-inera-secondary-90 text-sm text-inera-neutral-40">
                    <th className="pb-2 font-bold px-2">Namn</th>
                    <th className="pb-2 font-bold px-2">E-post</th>
                    <th className="pb-2 font-bold px-2">Senast inloggad</th>
                    <th className="pb-2 font-bold px-2">Status</th>
                    <th className="pb-2 font-bold px-2">Åtgärd</th>
                  </tr>
                </thead>
                <motion.tbody layout>
                  <AnimatePresence mode="popLayout">
                  {users.map((u) => (
                    <motion.tr 
                      key={u.id} 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-b border-inera-secondary-95 last:border-0 hover:bg-inera-secondary-95/50"
                    >
                      <td className="py-3 px-2 text-sm text-inera-neutral-10 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{u.displayName || 'Ej angivet'}</span>
                          <button
                            onClick={() => {
                              setUserToEditName(u);
                              setEditDisplayName(u.displayName || '');
                            }}
                            className="text-inera-neutral-40 hover:text-inera-primary-40 p-1 rounded hover:bg-inera-secondary-90 transition-colors"
                            title="Redigera namn"
                          >
                            <Edit3 size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-sm text-inera-neutral-20">{u.email}</td>
                      <td className="py-3 px-2 text-sm text-inera-neutral-20">
                        {u.lastLoggedIn ? format(u.lastLoggedIn.toDate ? u.lastLoggedIn.toDate() : new Date(u.lastLoggedIn.seconds * 1000), 'yyyy-MM-dd HH:mm') : 'Aldrig'}
                      </td>
                      <td className="py-3 px-2 text-sm">
                        {u.isBlocked ? (
                          <span className="bg-inera-error-95 text-inera-error-50 px-2 py-0.5 rounded text-xs font-bold uppercase border border-inera-error-40">Blockerad</span>
                        ) : u.mustChangePassword ? (
                          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-xs font-bold uppercase border border-amber-300 flex items-center gap-1 w-max">
                            <Lock size={10} /> Måste byta lösenord
                          </span>
                        ) : (
                          <span className="bg-inera-success-95 text-inera-success-50 px-2 py-0.5 rounded text-xs font-bold uppercase border border-inera-success-40">Aktiv</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => {
                              setUserToChangePassword(u);
                              setAdminNewPassword('');
                              setForceChangeOnLogin(true);
                            }}
                            className="btn btn--xs btn--secondary flex items-center gap-1"
                            title="Byt lösenord för användaren"
                          >
                            <Key size={13} />
                            Byt lösenord
                          </button>
                          <button 
                            onClick={() => toggleBlock(u.id, !!u.isBlocked)}
                            className={cn("btn btn--xs", u.isBlocked ? "btn--secondary" : "btn--tertiary")}
                          >
                            {u.isBlocked ? 'Avblockera' : 'Blockera'}
                          </button>
                          <button 
                            onClick={() => setUserToDelete(u)}
                            className="btn btn--xs btn--destructive flex items-center gap-1"
                            title="Radera användare"
                          >
                            <Trash2 size={13} />
                            Radera
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                  </AnimatePresence>
                </motion.tbody>
              </table>
            </div>

            {/* Edit Name Modal */}
            {userToEditName && (
              <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                <div className="card p-6 shadow-xl max-w-md w-full border-inera-secondary-90 bg-white space-y-4">
                  <div className="flex items-center gap-3 text-inera-primary-40">
                    <Edit3 size={22} />
                    <h3 className="text-lg font-bold font-display text-inera-neutral-10">Redigera användarnamn</h3>
                  </div>
                  <p className="text-xs text-inera-neutral-40">Uppdatera det namn som visas i gränssnittet och i menyer för användaren ({userToEditName.email}).</p>
                  
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-inera-neutral-30">Fullständigt namn / Visningsnamn</label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      placeholder="t.ex. Anna Svensson"
                      className="input w-full text-sm"
                      autoFocus
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button 
                      onClick={() => setUserToEditName(null)}
                      disabled={isSavingName}
                      className="btn btn--m btn--secondary"
                    >
                      Avbryt
                    </button>
                    <button 
                      onClick={handleSaveName}
                      disabled={isSavingName}
                      className="btn btn--m btn--primary flex items-center gap-2"
                    >
                      {isSavingName ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Spara namn
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Admin Change Password Modal */}
            {userToChangePassword && (
              <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                <div className="card p-6 shadow-xl max-w-md w-full border-inera-secondary-90 bg-white space-y-4">
                  <div className="flex items-center gap-3 text-[#a63363]">
                    <Key size={22} />
                    <h3 className="text-lg font-bold font-display text-inera-neutral-10">Byt lösenord</h3>
                  </div>
                  <p className="text-xs text-inera-neutral-40">
                    Sätt nytt lösenord eller aktivera krav på lösenordsbyte för <strong>{userToChangePassword.displayName || userToChangePassword.email}</strong>.
                  </p>

                  <div className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-inera-neutral-30">Nytt lösenord (valfritt / tillfälligt)</label>
                      <input
                        type="password"
                        value={adminNewPassword}
                        onChange={(e) => setAdminNewPassword(e.target.value)}
                        placeholder="Ange ett nytt lösenord..."
                        className="input w-full text-sm"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-xs font-bold text-inera-neutral-20 cursor-pointer pt-1">
                      <input 
                        type="checkbox" 
                        checked={forceChangeOnLogin}
                        onChange={(e) => setForceChangeOnLogin(e.target.checked)}
                        className="rounded border-neutral-300 text-inera-primary-40 focus:ring-inera-primary-40"
                      />
                      <span>Tvinga användaren att byta lösenord vid nästa inloggning</span>
                    </label>

                    <div className="pt-2 border-t border-inera-secondary-90">
                      <button
                        type="button"
                        onClick={() => handleSendResetEmail(userToChangePassword.email)}
                        className="text-xs font-bold text-inera-primary-40 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw size={12} />
                        Skicka länk för lösenordsåterställning per e-post
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t border-inera-secondary-90">
                    <button 
                      onClick={() => setUserToChangePassword(null)}
                      disabled={isSavingPassword}
                      className="btn btn--m btn--secondary"
                    >
                      Avbryt
                    </button>
                    <button 
                      onClick={handleSavePasswordChange}
                      disabled={isSavingPassword}
                      className="btn btn--m btn--primary flex items-center gap-2"
                    >
                      {isSavingPassword ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                      Spara inställningar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete User Warning Modal */}
            {userToDelete && (
              <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                <div className="card p-6 shadow-xl max-w-md w-full border-inera-secondary-90 bg-white space-y-4">
                  <div className="flex items-center gap-3 text-inera-error-40">
                    <AlertCircle size={24} />
                    <h3 className="text-lg font-bold font-display text-inera-neutral-10">Radera användare</h3>
                  </div>
                  <p className="text-sm text-inera-neutral-30">
                    Är du säker på att du vill radera användaren <strong className="text-inera-neutral-10">{userToDelete.email}</strong>? 
                    Användarens konto tas bort permanent från systemet. Denna åtgärd kan inte ångras.
                  </p>
                  <div className="flex justify-end gap-3 pt-2">
                    <button 
                      onClick={() => setUserToDelete(null)}
                      disabled={isDeletingUser}
                      className="btn btn--m btn--secondary"
                    >
                      Avbryt
                    </button>
                    <button 
                      onClick={handleDeleteUser}
                      disabled={isDeletingUser}
                      className="btn btn--m btn--destructive flex items-center gap-2"
                    >
                      {isDeletingUser ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      {isDeletingUser ? 'Raderar...' : 'Ja, radera användaren'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
        
        {activeAdminTab === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            {uploadNode}
          </motion.div>
        )}

        {activeAdminTab === 'api' && (
          <motion.div
            key="api"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            <ApiView />
          </motion.div>
        )}
        
        {activeAdminTab === 'rawdata' && (
          <motion.div
            key="rawdata"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            <RawDataView />
          </motion.div>
        )}

        {activeAdminTab === 'catalog' && (
          <motion.div
            key="catalog"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            <CatalogMappingView />
          </motion.div>
        )}

        {activeAdminTab === 'grundstruktur' && (
          <motion.div
            key="grundstruktur"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            <GrundstrukturView />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const HeaderNavItem = ({ icon: Icon, label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-3 py-1.5 text-sm font-bold transition-all border-b-2 whitespace-nowrap",
      active 
        ? "border-inera-primary-40 text-inera-primary-40" 
        : "border-transparent text-[#383d42] hover:text-inera-primary-40"
    )}
  >
    <Icon size={18} className={active ? "text-inera-primary-40" : "text-[#383d42]"} />
    <span>{label}</span>
  </button>
);

const StatCard = ({ icon: Icon, label, value, subValue, color, trend }: any) => (
  <div className="card p-6 shadow-sm flex items-start gap-4 border-inera-secondary-90">
    <div className={cn("p-3 rounded-lg", color)}>
      <Icon size={24} className="text-white" />
    </div>
    <div className="flex-1">
      <p className="text-sm text-inera-neutral-40 font-medium">{label}</p>
      <div className="flex items-baseline gap-2">
        <h3 className="text-2xl font-bold text-inera-neutral-10 mt-1">{value}</h3>
        {trend && (
          <span className={cn(
            "text-xs font-bold flex items-center gap-0.5",
            trend > 0 ? "text-inera-success-40" : "text-inera-error-40"
          )}>
            {trend > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend)}
          </span>
        )}
      </div>
      {subValue && <p className="text-xs text-inera-neutral-60 mt-1">{subValue}</p>}
    </div>
  </div>
);

const SusLegend = () => (
  <div className="card shadow-sm flex flex-wrap gap-6 items-center justify-between text-sm border-inera-secondary-90 py-3">
    <div className="flex flex-wrap gap-6 items-center">
      <span className="font-bold text-inera-neutral-20">SUS Betygsskala:</span>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-inera-success-50"></span>≥ 80.3 (Utmärkt)</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-inera-info-50"></span>68 - 80.2 (Bra)</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-inera-attention-50"></span>51 - 67.9 (Godkänd)</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-inera-error-50"></span>&lt; 51 (Underkänd)</div>
    </div>
  </div>
);

const ForcePasswordChangeModal = ({ 
  user, 
  onPasswordChanged 
}: { 
  user: User; 
  onPasswordChanged: () => void; 
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
      console.error("Fel vid lösenordsbyte:", e);
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

// --- Main App ---

export default function App() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const publicSurveyId = urlParams.get('sus_survey');
  const publicRespondentId = urlParams.get('respondent') || undefined;

  if (publicSurveyId) {
    return <PublicSurveyView surveyId={publicSurveyId} respondentId={publicRespondentId} />;
  }

  const [user, setUser] = useState<User | null>(null);
  const [currentUserDoc, setCurrentUserDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'admin' | 'api' | 'rawdata' | 'sus_admin'>('dashboard');
  const [adminSubTab, setAdminSubTab] = useState<'users' | 'upload' | 'api' | 'rawdata' | 'catalog' | 'grundstruktur'>('users');
  const [authError, setAuthError] = useState<string>('');
  const [view, setView] = useState<'company' | 'product'>('company');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [responses, setResponses] = useState<ResponseData[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<string>('Alla');
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [latestMeasurements, setLatestMeasurements] = useState<Measurement[]>([]);
  const [allMeasurements, setAllMeasurements] = useState<Measurement[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string>('all');
  const [uploadProductId, setUploadProductId] = useState<string>('');
  const [uploadMethod, setUploadMethod] = useState<'csv' | 'manual'>('csv');
  const [manualSusScore, setManualSusScore] = useState<string>('');
  const [manualResponseCount, setManualResponseCount] = useState<string>('');
  const [manualDate, setManualDate] = useState<string>('');
  const [isSavingManual, setIsSavingManual] = useState<boolean>(false);
  
  // Real-time collections & product mappings
  const [surveysList, setSurveysList] = useState<any[]>([]);
  const [susResponsesList, setSusResponsesList] = useState<any[]>([]);
  const [allRawResponsesList, setAllRawResponsesList] = useState<any[]>([]);
  const [productMappings, setProductMappings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      loadProductMappings().then(setProductMappings);

      const unsubUserDoc = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists()) {
          setCurrentUserDoc(snap.data());
        }
      });

      const qSurveys = query(collection(db, 'susSurveys'));
      const unsubSurveys = onSnapshot(qSurveys, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSurveysList(docs);
      });

      const qSus = query(collection(db, 'susResponses'));
      const unsubSus = onSnapshot(qSus, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSusResponsesList(docs);
      });

      const qResp = query(collection(db, 'responses'));
      const unsubResp = onSnapshot(qResp, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllRawResponsesList(docs);
      });

      return () => {
        unsubUserDoc();
        unsubSurveys();
        unsubSus();
        unsubResp();
      };
    } else {
      setCurrentUserDoc(null);
    }
  }, [user]);

  const normalizeStr = (str: string) => {
    return (str || '')
      .toLowerCase()
      .replace(/å/g, 'a')
      .replace(/ä/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/é/g, 'e')
      .replace(/motetjanst/g, 'motestjanst')
      .replace(/^prod[-_]/i, '')
      .replace(/^product[-_]/i, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const isNameMatch = (a: string, b: string) => {
    if (!a || !b) return false;
    const rawA = a.trim().toLowerCase();
    const rawB = b.trim().toLowerCase();
    if (rawA === rawB) return true;

    const normA = normalizeStr(a);
    const normB = normalizeStr(b);
    if (!normA || !normB) return false;
    if (normA === normB) return true;
    if (normA.replace(/\s+/g, '') === normB.replace(/\s+/g, '')) return true;

    if (normA.length >= 3 && normB.length >= 3) {
      if (normA.includes(normB) || normB.includes(normA)) return true;
    }

    const stopWords = ['och', 'med', 'for', 'ett', 'ska', 'som', 'tjanst', 'tjansterna', 'tjansten'];
    const tokensA = normA.split(' ').filter(t => t.length >= 3 && !stopWords.includes(t));
    const tokensB = normB.split(' ').filter(t => t.length >= 3 && !stopWords.includes(t));

    if (tokensA.length > 0 && tokensB.length > 0) {
      const common = tokensA.filter(t => tokensB.some(tb => {
        if (tb.includes(t) || t.includes(tb)) return true;
        if (t.length >= 5 && tb.length >= 5 && (t.slice(0, 5) === tb.slice(0, 5) || t.startsWith(tb.slice(0, 5)))) return true;
        return false;
      }));
      const minTokens = Math.min(tokensA.length, tokensB.length);
      if (common.length >= minTokens) return true;
    }

    return false;
  };

  // Advanced Filters
  const [selectedTrainFilter, setSelectedTrainFilter] = useState<string>('Alla');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('Alla');
  const [susRange, setSusRange] = useState<{ min: number; max: number }>({ min: 0, max: 100 });
  const [categoryFilter, setCategoryFilter] = useState<string>('Alla');

  // Helper to match a raw response item to a product ID
  const getMatchedProductId = (
    item: any,
    productsList: Product[],
    surveys: any[],
    mappings: Record<string, string>
  ): string | null => {
    const pIdSet = new Set(productsList.map(p => p.id));

    if (item.surveyId) {
      const survey = surveys.find(s => s.id === item.surveyId);
      if (survey) {
        const foundP = productsList.find(p => 
          p.id === survey.productId || 
          isNameMatch(survey.productId, p.id) || 
          isNameMatch(survey.productId, p.name) || 
          isNameMatch(survey.name, p.name)
        );
        if (foundP) return foundP.id;
      }
    }

    const rawProdId = (item.productId || '').trim();
    if (rawProdId && pIdSet.has(rawProdId)) {
      return rawProdId;
    }

    const rawVariant = (item.variantName || '').trim();
    const mappedVariant = mappings[rawVariant] || mappings[rawProdId];

    const foundP = productsList.find(p => 
      (rawProdId && (p.id === rawProdId || isNameMatch(rawProdId, p.id) || isNameMatch(rawProdId, p.name))) ||
      (rawVariant && (isNameMatch(rawVariant, p.name) || (mappedVariant && isNameMatch(mappedVariant, p.name))))
    );

    if (foundP) return foundP.id;
    if (rawProdId) return rawProdId;
    return null;
  };

  // Combine ALL raw responses across all sources
  const allCombinedResponses = useMemo(() => {
    const list: ResponseData[] = [];
    const seenIds = new Set<string>();

    allRawResponsesList.forEach(item => {
      if (item.id && seenIds.has(item.id)) return;
      if (item.id) seenIds.add(item.id);

      const score = Number(item.susScore);
      if (isNaN(score) || score < 0 || score > 100) return;

      let submitDate = item.submitDate || item.submittedAt || item.createdAt;
      if (submitDate?.toDate) submitDate = submitDate.toDate();
      else if (typeof submitDate === 'string' || typeof submitDate === 'number') submitDate = new Date(submitDate);
      if (!submitDate || isNaN(new Date(submitDate).getTime())) submitDate = new Date();
      else submitDate = new Date(submitDate);

      let startDate = item.startDate;
      if (startDate?.toDate) startDate = startDate.toDate();
      else if (typeof startDate === 'string' || typeof startDate === 'number') startDate = new Date(startDate);
      if (!startDate || isNaN(new Date(startDate).getTime())) startDate = submitDate;
      else startDate = new Date(startDate);

      const matchedPId = getMatchedProductId(item, products, surveysList, productMappings);

      list.push({
        id: item.id || `raw-${list.length}`,
        measurementId: item.measurementId || 'csv-upload',
        productId: matchedPId || item.productId || 'unmapped',
        variantName: item.variantName || 'Generell',
        susScore: score,
        answers: item.answers || [],
        comment: item.comment || '',
        submitDate,
        startDate,
        otherText: item.otherText || ''
      });
    });

    susResponsesList.forEach(item => {
      if (item.id && seenIds.has(item.id)) return;
      if (item.id) seenIds.add(item.id);

      const score = Number(item.susScore);
      if (isNaN(score) || score < 0 || score > 100) return;

      let submitDate = item.createdAt || item.completedAt || item.submittedAt;
      if (submitDate?.toDate) submitDate = submitDate.toDate();
      else if (typeof submitDate === 'string' || typeof submitDate === 'number') submitDate = new Date(submitDate);
      if (!submitDate || isNaN(new Date(submitDate).getTime())) submitDate = new Date();
      else submitDate = new Date(submitDate);

      const matchedPId = getMatchedProductId(item, products, surveysList, productMappings);
      const matchedP = products.find(p => p.id === matchedPId);

      list.push({
        id: item.id || `sus-${list.length}`,
        measurementId: item.surveyId || 'sus-survey',
        productId: matchedPId || item.productId || 'unmapped',
        variantName: item.variantName || (matchedP ? matchedP.name : item.productId || 'Generell'),
        susScore: score,
        answers: item.answers || [],
        comment: item.comment || '',
        submitDate,
        startDate: submitDate,
        otherText: ''
      });
    });

    const existingMeasurementIds = new Set(list.map(r => r.measurementId).filter(Boolean));

    allMeasurements.forEach(m => {
      if (existingMeasurementIds.has(m.id)) return;

      const score = Number(m.averageScore);
      if (isNaN(score) || score < 0 || score > 100) return;

      const matchedPId = getMatchedProductId({ productId: m.productId, variantName: m.fileName }, products, surveysList, productMappings);
      const pId = matchedPId || m.productId || 'unmapped';

      let mDate = m.date ? new Date(m.date) : new Date();
      if (isNaN(mDate.getTime())) mDate = new Date();

      const mDateMonth = format(mDate, 'yyyy-MM');
      const hasRawForProduct = list.some(r => 
        (r.productId === pId || isNameMatch(r.productId, pId)) && 
        format(r.submitDate, 'yyyy-MM') === mDateMonth
      );
      if (hasRawForProduct) return;

      const count = m.responseCount && m.responseCount > 0 ? m.responseCount : 1;

      for (let i = 0; i < count; i++) {
        list.push({
          id: `virtual-${m.id}-${i}`,
          measurementId: m.id,
          productId: pId,
          variantName: m.fileName || 'Inera-mätning',
          susScore: score,
          answers: [],
          comment: i === 0 ? (m.fileName || 'Systemmätning') : '',
          submitDate: mDate,
          startDate: mDate,
          otherText: ''
        });
      }
    });

    return list;
  }, [allRawResponsesList, susResponsesList, allMeasurements, products, surveysList, productMappings]);

  // Compute active filtered responses based on all user UI filters
  const activeResponses = useMemo(() => {
    let list = allCombinedResponses;

    if (selectedProductId && selectedProductId !== 'Alla') {
      const targetProd = products.find(p => p.id === selectedProductId);
      const targetName = targetProd ? targetProd.name : selectedProductId;

      list = list.filter(r => {
        if (r.productId === selectedProductId) return true;
        if (targetProd && (isNameMatch(r.productId, targetProd.id) || isNameMatch(r.productId, targetProd.name))) return true;
        if (targetName && (isNameMatch(r.productId, targetName) || isNameMatch(r.variantName, targetName))) return true;
        return false;
      });
    }

    if (selectedTrainFilter !== 'Alla') {
      list = list.filter(r => {
        const p = products.find(prod => prod.id === r.productId || isNameMatch(prod.name, r.productId));
        return (p?.trainName || 'Ej mappade') === selectedTrainFilter;
      });
    }

    if (selectedTeamFilter !== 'Alla') {
      list = list.filter(r => {
        const p = products.find(prod => prod.id === r.productId || isNameMatch(prod.name, r.productId));
        return (p?.teamName || 'Ej mappade') === selectedTeamFilter;
      });
    }

    if (selectedMeasurementId && selectedMeasurementId !== 'all') {
      if (selectedMeasurementId === '30d') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        list = list.filter(r => r.submitDate >= cutoff);
      } else if (selectedMeasurementId === '90d') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        list = list.filter(r => r.submitDate >= cutoff);
      } else if (selectedMeasurementId === '1y') {
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        list = list.filter(r => r.submitDate >= cutoff);
      } else if (selectedMeasurementId === 'latest') {
        if (list.length > 0) {
          const maxTime = Math.max(...list.map(r => r.submitDate.getTime()));
          const latestDateStr = format(new Date(maxTime), 'yyyy-MM-dd');
          list = list.filter(r => format(r.submitDate, 'yyyy-MM-dd') === latestDateStr);
        }
      } else if (selectedMeasurementId.startsWith('date-')) {
        const targetDate = selectedMeasurementId.replace('date-', '');
        list = list.filter(r => format(r.submitDate, 'yyyy-MM-dd') === targetDate);
      } else {
        list = list.filter(r => r.measurementId === selectedMeasurementId || r.productId === selectedMeasurementId);
      }
    }

    if (selectedVariant !== 'Alla') {
      list = list.filter(r => {
        const mapped = (r.variantName === 'Generell' || r.variantName === 'Other' || r.variantName === 'Övriga') ? 'Other' : r.variantName;
        return mapped === selectedVariant;
      });
    }

    list = list.filter(r => r.susScore >= susRange.min && r.susScore <= susRange.max);

    return list;
  }, [allCombinedResponses, selectedProductId, selectedTrainFilter, selectedTeamFilter, selectedMeasurementId, selectedVariant, susRange, products]);

  const liveMetricsByProductId = useMemo(() => {
    const map: Record<string, { 
      scores: number[]; 
      latestDate?: Date; 
      isActive?: boolean;
      activeSurveyRound?: any;
    }> = {};

    products.forEach(p => {
      map[p.id] = { scores: [], isActive: false };
    });

    allCombinedResponses.forEach(r => {
      const pId = r.productId || 'unmapped-responses';
      if (!map[pId]) {
        map[pId] = { scores: [], isActive: false };
      }
      map[pId].scores.push(r.susScore);
      if (r.submitDate) {
        if (!map[pId].latestDate || r.submitDate > map[pId].latestDate!) {
          map[pId].latestDate = r.submitDate;
        }
      }
    });

    surveysList.forEach(survey => {
      const matchedP = products.find(p => 
        p.id === survey.productId || 
        isNameMatch(survey.productId, p.id) || 
        isNameMatch(survey.productId, p.name) || 
        isNameMatch(survey.name, p.name)
      );

      if (matchedP) {
        if (!map[matchedP.id]) {
          map[matchedP.id] = { scores: [], isActive: false };
        }
        if (survey.status === 'active') {
          map[matchedP.id].isActive = true;
          map[matchedP.id].activeSurveyRound = survey;
        }
      }
    });

    return map;
  }, [allCombinedResponses, products, surveysList]);

  const allMappedProducts = useMemo(() => {
    const realProductsOnly = products;
    const allProductIds = new Set([
      ...realProductsOnly.map(p => p.id),
      ...Object.keys(liveMetricsByProductId)
    ]);
    
    return Array.from(allProductIds).map(id => {
      const p = realProductsOnly.find(prod => prod.id === id) || {
        id,
        name: id === 'unmapped-responses' ? 'Ej mappade svar' : id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: 'product',
        trainName: 'Ej mappade',
        teamName: 'Ej mappade'
      } as Product;
      
      const scopedResponses = (selectedMeasurementId && selectedMeasurementId !== 'all')
        ? activeResponses.filter(r => r.productId === p.id || isNameMatch(r.productId, p.id) || isNameMatch(r.productId, p.name))
        : allCombinedResponses.filter(r => r.productId === p.id || isNameMatch(r.productId, p.id) || isNameMatch(r.productId, p.name));

      if (scopedResponses.length > 0) {
        const scores = scopedResponses.map(r => r.susScore);
        const total = scores.length;
        const sum = scores.reduce((a, b) => a + b, 0);
        const avg = Math.round((sum / total) * 10) / 10;
        const med = calculateMedian(scores);
        const latestDt = new Date(Math.max(...scopedResponses.map(r => r.submitDate.getTime())));
        return {
          ...p,
          latest: {
            averageScore: avg,
            medianScore: med,
            responseCount: total,
            date: latestDt,
            isActive: liveMetricsByProductId[p.id]?.isActive || false
          }
        };
      }

      if (p.susScore !== undefined && p.susScore > 0 && selectedMeasurementId === 'all') {
        return {
          ...p,
          latest: {
            averageScore: p.susScore,
            medianScore: p.susScore,
            responseCount: 0,
            date: new Date(),
            isActive: false
          }
        };
      }

      return {
        ...p,
        latest: undefined
      };
    });
  }, [products, liveMetricsByProductId, activeResponses, allCombinedResponses, selectedMeasurementId]);

  const availableTrains = useMemo(() => {
    const set = new Set<string>();
    allMappedProducts.forEach(p => {
      if (p.trainName) set.add(p.trainName);
    });
    return ['Alla', ...Array.from(set).sort()];
  }, [allMappedProducts]);

  const availableTeams = useMemo(() => {
    const set = new Set<string>();
    allMappedProducts.forEach(p => {
      if (selectedTrainFilter !== 'Alla' && p.trainName !== selectedTrainFilter) return;
      if (p.teamName) set.add(p.teamName);
    });
    return ['Alla', ...Array.from(set).sort()];
  }, [allMappedProducts, selectedTrainFilter]);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'score'; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [variantSort, setVariantSort] = useState<{ key: 'name' | 'score'; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [distributionView, setDistributionView] = useState<'bar' | 'box'>('bar');
  const [commentCategoryFilter, setCommentCategoryFilter] = useState<'all' | 'excellent' | 'good' | 'pass' | 'fail'>('all');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [measurementToDelete, setMeasurementToDelete] = useState<Measurement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdminExpanded, setIsAdminExpanded] = useState(false);

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    setSyncNotice(null);
    try {
      const ok = await triggerSusMetricsSync();
      if (ok) {
        setSyncNotice("Data synkad med Inera UX Dashboard");
        setTimeout(() => setSyncNotice(null), 5000);
      } else {
        console.error("Fel vid manuell synkning till Inera UX Dashboard");
      }
    } catch (err) {
      console.error("Fel vid synk:", err);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const overallLatestDate = useMemo(() => {
    if (products.length === 0) return undefined;
    const dates = products
      .map(p => p.latest?.date)
      .filter(Boolean) as Date[];
    if (dates.length === 0) return undefined;
    return format(new Date(Math.max(...dates.map(d => d.getTime()))), 'yyyy-MM-dd');
  }, [products]);

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        let shouldBlock = false;
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (userData.isBlocked && user.email?.toLowerCase() !== 'andreas.melin@inera.se') {
            shouldBlock = true;
          }
        }
        
        if (shouldBlock) {
          await auth.signOut();
          setUser(null);
          setAuthError('Ditt konto har blivit blockerat. Kontakta administratör.');
        } else {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email?.split('@')[0] || 'User',
            role: userSnap.exists() ? userSnap.data().role : 'user',
            lastLoggedIn: serverTimestamp(),
            isBlocked: false
          }, { merge: true });
          
          setUser(user);
          setAuthError('');
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Initial Data
  useEffect(() => {
    if (user) {
      const unsubProducts = ProductService.getAllProducts(setProducts);
      const unsubMeasurements = MeasurementService.getAllMeasurements(setAllMeasurements);
      return () => {
        unsubProducts();
        unsubMeasurements();
      };
    }
  }, [user]);

  // Measurements for selected product
  useEffect(() => {
    if (selectedProductId) {
      const unsub = MeasurementService.getMeasurements(selectedProductId, setMeasurements);
      ProductService.getVariants(selectedProductId).then(vars => {
        // Map common fallbacks to "Other"
        const mapped = vars.map(v => ({
          ...v,
          name: v.name === 'Generell' || v.name === 'Other' || v.name === 'Övriga' ? 'Other' : v.name
        }));
        const unique = Array.from(new Map(mapped.map(v => [v.name, v])).values());
        setVariants(unique);
      });
      return unsub;
    }
  }, [selectedProductId]);

  // Responses for selected measurement
  useEffect(() => {
    if (selectedMeasurementId === 'all' && selectedProductId) {
      const unsub = MeasurementService.getResponsesByProduct(selectedProductId, setResponses);
      return unsub;
    }

    let mId = '';
    if (selectedMeasurementId !== 'latest' && selectedMeasurementId !== 'all') {
      mId = selectedMeasurementId;
    } else if (measurements.length > 0) {
      mId = measurements[0].id;
    }

    if (mId) {
      const unsub = MeasurementService.getResponses(mId, setResponses);
      return unsub;
    } else {
      setResponses([]);
    }
  }, [measurements, selectedMeasurementId, selectedProductId]);

  // Company Stats
  useEffect(() => {
    if (user && view === 'company') {
      if (selectedMeasurementId === 'latest') {
        MeasurementService.getLatestMeasurementsForAllProducts().then(setLatestMeasurements);
      } else if (selectedMeasurementId === 'all') {
        setLatestMeasurements(allMeasurements);
      } else {
        const m = allMeasurements.find(m => m.id === selectedMeasurementId);
        if (m) {
          setLatestMeasurements([m]);
        }
      }
    }
  }, [user, view, products, selectedMeasurementId, allMeasurements]);

  const boxStats = useMemo(() => {
    if (responses.length === 0) return null;
    
    const calculateStats = (data: ResponseData[]) => {
      const scores = data.map(r => r.susScore).sort((a, b) => a - b);
      const n = scores.length;
      const median = n % 2 !== 0 ? scores[Math.floor(n / 2)] : (scores[n / 2 - 1] + scores[n / 2]) / 2;
      const q1 = scores[Math.floor(n / 4)];
      const q3 = scores[Math.floor(3 * n / 4)];
      return {
        name: selectedVariant === 'Alla' ? 'Hela produkten' : selectedVariant,
        min: scores[0],
        max: scores[n - 1],
        median,
        q1,
        q3,
        q1_diff: q1 - scores[0],
        median_diff: median - q1,
        q3_diff: q3 - median,
        max_diff: scores[n - 1] - q3
      };
    };

    if (selectedVariant === 'Alla') {
      return calculateStats(responses);
    } else {
      const variantResponses = responses.filter(r => r.variantName === selectedVariant);
      if (variantResponses.length === 0) return null;
      return calculateStats(variantResponses);
    }
  }, [responses, selectedVariant]);
  const handleLogout = () => auth.signOut();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    const pId = uploadProductId || '1177';

    setIsUploading(true);
    setUploadStatus(null);
    setSyncNotice(null);
    try {
      const finalPId = await ProductService.ensureProduct(pId);
      await MeasurementService.uploadCsv(file, finalPId, user.uid);
      setUploadStatus({ type: 'success', msg: 'Mätningen har laddats upp!' });
      
      const synced = await triggerSusMetricsSync();
      if (synced) {
        setSyncNotice("Data synkad med Inera UX Dashboard");
        setTimeout(() => setSyncNotice(null), 5000);
      }
    } catch (err: any) {
      setUploadStatus({ type: 'error', msg: err.message || 'Ett fel uppstod vid uppladdning.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadProductId || !user) {
      setUploadStatus({ type: 'error', msg: 'Du måste välja eller skriva en tjänst först.' });
      return;
    }
    
    const scoreNum = parseFloat(manualSusScore);
    const countNum = parseInt(manualResponseCount, 10);
    
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      setUploadStatus({ type: 'error', msg: 'SUS-poäng måste vara mellan 0 och 100.' });
      return;
    }
    
    if (isNaN(countNum) || countNum <= 0) {
      setUploadStatus({ type: 'error', msg: 'Antal svar måste vara ett positivt heltal.' });
      return;
    }

    setIsSavingManual(true);
    setUploadStatus(null);
    setSyncNotice(null);

    try {
      const finalPId = await ProductService.ensureProduct(uploadProductId);
      const chosenDate = manualDate ? new Date(manualDate) : new Date();
      
      await MeasurementService.addManualMeasurement(finalPId, user.uid, scoreNum, countNum, chosenDate);
      
      setUploadStatus({ type: 'success', msg: 'Mätningen har registrerats manuellt!' });
      setManualSusScore('');
      setManualResponseCount('');
      setManualDate('');
      
      const synced = await triggerSusMetricsSync();
      if (synced) {
        setSyncNotice("Data synkad med Inera UX Dashboard");
        setTimeout(() => setSyncNotice(null), 5000);
      }
    } catch (err: any) {
      setUploadStatus({ type: 'error', msg: err.message || 'Ett fel uppstod vid registrering.' });
    } finally {
      setIsSavingManual(false);
    }
  };

  // Compute available measurement rounds/periods for the time period filter
  const availableMeasurementRounds = useMemo(() => {
    const baseResponses = selectedProductId 
      ? allCombinedResponses.filter(r => {
          const targetProd = products.find(p => p.id === selectedProductId);
          const targetName = targetProd ? targetProd.name : selectedProductId;
          return r.productId === selectedProductId || (targetProd && isNameMatch(r.productId, targetProd.id)) || (targetName && isNameMatch(r.productId, targetName));
        })
      : allCombinedResponses;

    const roundsMap = new Map<string, { id: string; label: string; count: number; date: Date }>();

    surveysList.forEach(s => {
      if (selectedProductId) {
        const targetProd = products.find(p => p.id === selectedProductId);
        const isMatch = s.productId === selectedProductId || (targetProd && (isNameMatch(s.productId, targetProd.id) || isNameMatch(s.productId, targetProd.name)));
        if (!isMatch) return;
      }
      const count = baseResponses.filter(r => r.measurementId === s.id).length;
      roundsMap.set(s.id, {
        id: s.id,
        label: s.title || s.name || `Enkätomgång (${s.status === 'active' ? 'Pågående' : 'Avslutad'})`,
        count,
        date: s.startDate ? new Date(s.startDate) : new Date()
      });
    });

    allMeasurements.forEach(m => {
      if (selectedProductId && m.productId !== selectedProductId) return;
      if (!roundsMap.has(m.id)) {
        const count = m.responseCount || baseResponses.filter(r => r.measurementId === m.id).length;
        roundsMap.set(m.id, {
          id: m.id,
          label: `${m.fileName || 'Mätning'} (${format(new Date(m.date), 'yyyy-MM-dd')})`,
          count,
          date: new Date(m.date)
        });
      }
    });

    const groupedByDate: Record<string, number> = {};
    baseResponses.forEach(r => {
      const dtKey = format(r.submitDate, 'yyyy-MM-dd');
      groupedByDate[dtKey] = (groupedByDate[dtKey] || 0) + 1;
    });

    Object.entries(groupedByDate).forEach(([dtStr, count]) => {
      const id = `date-${dtStr}`;
      if (!roundsMap.has(id)) {
        roundsMap.set(id, {
          id,
          label: `Mätning ${dtStr}`,
          count,
          date: new Date(dtStr)
        });
      }
    });

    return Array.from(roundsMap.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [allCombinedResponses, selectedProductId, products, surveysList, allMeasurements]);

  const filteredResponses = activeResponses;

  const averageSus = useMemo(() => {
    if (filteredResponses.length === 0) return 0;
    return filteredResponses.reduce((acc, r) => acc + r.susScore, 0) / filteredResponses.length;
  }, [filteredResponses]);

  const trendData = useMemo(() => {
    if (filteredResponses.length === 0) return [];
    
    const grouped: Record<string, { total: number; count: number; date: Date }> = {};
    
    filteredResponses.forEach(r => {
      let date = r.startDate || r.submitDate;
      if (!date || isNaN(date.getTime())) return;
      
      const dateKey = format(date, 'yyyy-MM-dd');
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = { total: 0, count: 0, date };
      }
      grouped[dateKey].total += r.susScore;
      grouped[dateKey].count++;
    });
    
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => ({
        date: format(data.date, 'yyyy-MM-dd'),
        fullDate: format(data.date, 'PPP', { locale: sv }),
        score: Math.round((data.total / data.count) * 10) / 10,
        count: data.count
      }));
  }, [filteredResponses]);

  const distributionData = useMemo(() => {
    const bins = [
      { name: '< 51 (F)', count: 0, color: '#ef4444' },
      { name: '51-67 (C)', count: 0, color: '#eab308' },
      { name: '68-80 (B)', count: 0, color: '#3b82f6' },
      { name: '≥ 81 (A)', count: 0, color: '#10b981' },
    ];
    filteredResponses.forEach(r => {
      if (r.susScore < 51) bins[0].count++;
      else if (r.susScore < 68) bins[1].count++;
      else if (r.susScore < 80.3) bins[2].count++;
      else bins[3].count++;
    });
    return bins;
  }, [filteredResponses]);

  const filteredProducts = useMemo(() => {
    let result = [...allMappedProducts];

    // Filter out products with 0 responses when a specific measurement round is selected
    if (selectedMeasurementId && selectedMeasurementId !== 'all') {
      result = result.filter(p => p.latest && p.latest.responseCount > 0);
    }

    // Train filter
    if (selectedTrainFilter !== 'Alla') {
      result = result.filter(p => (p.trainName || 'Ej mappade') === selectedTrainFilter);
    }

    // Team filter
    if (selectedTeamFilter !== 'Alla') {
      result = result.filter(p => (p.teamName || 'Ej mappade') === selectedTeamFilter);
    }

    // Search term
    if (searchTerm) {
      result = result.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    // Category filter (simple implementation: name contains category)
    if (categoryFilter !== 'Alla') {
      result = result.filter(p => p.name.includes(categoryFilter));
    }

    // SUS Range filter
    result = result.filter(p => {
      const score = p.latest?.averageScore ?? -1;
      if (score === -1) return susRange.min === 0; // Show products without data only if min is 0
      return score >= susRange.min && score <= susRange.max;
    });

    // Date Range filter
    if (dateRange.start || dateRange.end) {
      result = result.filter(p => {
        if (!p.latest) return false;
        const mDate = p.latest.date.toISOString().split('T')[0];
        if (dateRange.start && mDate < dateRange.start) return false;
        if (dateRange.end && mDate > dateRange.end) return false;
        return true;
      });
    }

    // Sorting
    result.sort((a, b) => {
      if (sortConfig.key === 'name') {
        return sortConfig.direction === 'asc' 
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      } else {
        const scoreA = a.latest?.averageScore ?? 0;
        const scoreB = b.latest?.averageScore ?? 0;
        return sortConfig.direction === 'asc' ? scoreA - scoreB : scoreB - scoreA;
      }
    });

    return result;
  }, [products, searchTerm, latestMeasurements, susRange, categoryFilter, dateRange, sortConfig, selectedTrainFilter, selectedTeamFilter]);

  const groupedHierarchy = useMemo(() => {
    const trainMap: Record<string, {
      trainName: string;
      totalScoreSum: number;
      responseCount: number;
      productCount: number;
      teams: Record<string, {
        teamName: string;
        totalScoreSum: number;
        responseCount: number;
        productCount: number;
        products: typeof filteredProducts;
      }>;
    }> = {};

    filteredProducts.forEach(p => {
      const train = p.trainName || 'Omappade tåg';
      const team = p.teamName || 'Omappat team';

      if (!trainMap[train]) {
        trainMap[train] = {
          trainName: train,
          totalScoreSum: 0,
          responseCount: 0,
          productCount: 0,
          teams: {}
        };
      }

      if (!trainMap[train].teams[team]) {
        trainMap[train].teams[team] = {
          teamName: team,
          totalScoreSum: 0,
          responseCount: 0,
          productCount: 0,
          products: []
        };
      }

      const score = p.latest?.averageScore || 0;
      const responses = p.latest?.responseCount || 0;

      trainMap[train].productCount++;
      trainMap[train].responseCount += responses;
      trainMap[train].totalScoreSum += (score * (responses || 1));

      trainMap[train].teams[team].productCount++;
      trainMap[train].teams[team].responseCount += responses;
      trainMap[train].teams[team].totalScoreSum += (score * (responses || 1));
      trainMap[train].teams[team].products.push(p);
    });

    return Object.values(trainMap).map(tr => ({
      ...tr,
      avgScore: tr.responseCount > 0 ? Math.round((tr.totalScoreSum / tr.responseCount) * 10) / 10 : 0,
      teams: Object.values(tr.teams).map(tm => ({
        ...tm,
        avgScore: tm.responseCount > 0 ? Math.round((tm.totalScoreSum / tm.responseCount) * 10) / 10 : 0
      }))
    }));
  }, [filteredProducts]);

  const companyStats = useMemo(() => {
    const prods = filteredProducts;
    if (prods.length === 0) return { avg: 0, totalResponses: 0, totalProducts: 0 };

    let totalScoreSum = 0;
    let totalResponses = 0;

    prods.forEach(p => {
      if (p.latest && p.latest.responseCount > 0) {
        totalScoreSum += p.latest.averageScore * p.latest.responseCount;
        totalResponses += p.latest.responseCount;
      }
    });

    const avg = totalResponses > 0 ? Math.round((totalScoreSum / totalResponses) * 10) / 10 : 0;
    return {
      avg,
      totalResponses,
      totalProducts: prods.length
    };
  }, [filteredProducts]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      const parts = p.name.split(' ');
      if (parts[0]) cats.add(parts[0]);
    });
    return ['Alla', ...Array.from(cats)];
  }, [products]);

  const userNames = useMemo(() => {
    if (!user) return { firstName: 'Användare', lastName: '' };
    const nameToUse = currentUserDoc?.displayName || user.displayName;
    if (nameToUse) {
      const parts = nameToUse.trim().split(' ');
      return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' ')
      };
    }
    if (user.email) {
      const prefix = user.email.split('@')[0];
      const parts = prefix.split('.');
      const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
      return {
        firstName: capitalize(parts[0]),
        lastName: capitalize(parts[1] || '')
      };
    }
    return { firstName: 'Användare', lastName: '' };
  }, [user, currentUserDoc]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-inera-secondary-95">
        <Loader2 className="animate-spin text-inera-primary-40" size={48} />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen initialError={authError} />;
  }

  return (
    <div className="min-h-screen bg-white pb-12">
      {currentUserDoc?.mustChangePassword && (
        <ForcePasswordChangeModal 
          user={user} 
          onPasswordChanged={() => setCurrentUserDoc((prev: any) => prev ? { ...prev, mustChangePassword: false } : null)} 
        />
      )}
      {/* Header */}
      <header className="bg-white border-b border-inera-secondary-90 px-4 sm:px-6 sticky top-0 z-40 shadow-2xs">
        <div className="max-w-[80rem] mx-auto flex items-center justify-between gap-4 py-2.5">
          {/* Brand & Nav */}
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
            <div className="flex items-center gap-3 shrink-0">
              <img src={ineraLogo} alt="Inera Logo" className="h-8 w-auto" />
              <div className="h-7 w-px bg-inera-secondary-90" />
              <div className="flex flex-col text-inera-primary-40 font-semibold text-sm leading-tight font-display">
                <span>SUS Mätmotor</span>
                <span className="text-[10px] text-inera-primary-40/80 font-normal">Inera UX</span>
              </div>
            </div>

            <div className="h-7 w-px bg-inera-secondary-90 hidden md:block shrink-0" />

            {/* Horizontal Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 sm:gap-2">
              <HeaderNavItem 
                icon={LayoutDashboard} 
                label="Dashboard" 
                active={activeTab === 'dashboard'} 
                onClick={() => { setActiveTab('dashboard'); setView('company'); }} 
              />
              <HeaderNavItem 
                icon={MessageSquare} 
                label="SUS-omgångar" 
                active={activeTab === 'sus_admin'} 
                onClick={() => setActiveTab('sus_admin')} 
              />
              {user.email && ADMIN_EMAILS.includes(user.email) && (
                <HeaderNavItem 
                  icon={Settings} 
                  label="Administration" 
                  active={activeTab === 'admin'} 
                  onClick={() => setActiveTab('admin')} 
                />
              )}
            </nav>
          </div>

          {/* User Badge & Logout & Mobile Menu Button */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 bg-[#fbf9f7] border border-inera-secondary-90 rounded-lg shadow-2xs">
              <div className="w-6 h-6 rounded-full bg-white border border-inera-secondary-90 flex items-center justify-center text-inera-accent-40">
                <LucideUser size={14} className="text-inera-accent-40" />
              </div>
              <div className="text-left text-xs font-bold text-inera-neutral-20 leading-tight">
                <div>{userNames.firstName} {userNames.lastName}</div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="hidden sm:flex items-center gap-1.5 text-inera-primary-40 hover:text-inera-primary-30 transition-colors py-1.5 px-2.5 rounded hover:bg-inera-primary-95 text-xs font-bold"
              title="Logga ut"
            >
              <LogOut size={16} />
              <span>Logga ut</span>
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 text-inera-neutral-20 hover:text-inera-primary-40 rounded-xl hover:bg-inera-secondary-95 transition-colors"
              aria-label="Öppna navigeringsmeny"
            >
              <Menu size={24} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-xs md:hidden">
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="w-full bg-white flex flex-col max-h-[92vh] rounded-b-2xl shadow-2xl overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-4 border-b border-inera-secondary-90 bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <img src={ineraLogo} alt="Inera Logo" className="h-7 w-auto" />
                  <div className="h-7 w-px bg-inera-secondary-90" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[#a63363] font-bold text-base font-display">Navigeringsmeny</span>
                    <span className="text-xs text-inera-neutral-40 font-normal">Inera UX-Mognad & Mätningar</span>
                  </div>
                </div>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-xl text-neutral-600 transition-colors"
                  aria-label="Stäng meny"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Drawer Navigation List */}
              <div className="p-4 overflow-y-auto space-y-4 flex-1">
                <div className="text-[11px] font-bold text-neutral-900 uppercase tracking-wider px-1">
                  HUVUDVYER
                </div>

                <div className="space-y-1">
                  {/* Översikt */}
                  <button
                    onClick={() => {
                      setActiveTab('dashboard');
                      setView('company');
                      setSelectedProductId(null);
                      setSelectedTrainFilter('Alla');
                      setSelectedTeamFilter('Alla');
                      setIsMobileMenuOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all",
                      activeTab === 'dashboard' && view === 'company' && selectedTrainFilter === 'Alla'
                        ? "bg-[#a63363] text-white shadow-sm"
                        : "text-neutral-800 hover:bg-neutral-100"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <LayoutGrid size={18} className={activeTab === 'dashboard' && view === 'company' && selectedTrainFilter === 'Alla' ? "text-white" : "text-neutral-700"} />
                      <span>Översikt</span>
                    </div>
                    {activeTab === 'dashboard' && view === 'company' && selectedTrainFilter === 'Alla' && (
                      <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                        Aktiv
                      </span>
                    )}
                  </button>

                  {/* Tågöversikt */}
                  <button
                    onClick={() => {
                      setActiveTab('dashboard');
                      setView('company');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm text-neutral-800 hover:bg-neutral-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <GitFork size={18} className="text-neutral-700" />
                      <span>Tågöversikt</span>
                    </div>
                  </button>

                  {/* Organisation */}
                  <button
                    onClick={() => {
                      setActiveTab('dashboard');
                      setView('company');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm text-neutral-800 hover:bg-neutral-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <Building2 size={18} className="text-neutral-700" />
                      <span>Organisation</span>
                    </div>
                  </button>

                  {/* Usability (SUS) */}
                  <button
                    onClick={() => {
                      setActiveTab('sus_admin');
                      setIsMobileMenuOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all",
                      activeTab === 'sus_admin'
                        ? "bg-[#a63363] text-white shadow-sm"
                        : "text-neutral-800 hover:bg-neutral-100"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Activity size={18} className={activeTab === 'sus_admin' ? "text-white" : "text-neutral-700"} />
                      <span>Usability (SUS)</span>
                    </div>
                    {activeTab === 'sus_admin' && (
                      <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                        Aktiv
                      </span>
                    )}
                  </button>

                  {/* UX-Mognad */}
                  <button
                    onClick={() => {
                      setActiveTab('dashboard');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm text-neutral-800 hover:bg-neutral-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <Award size={18} className="text-neutral-700" />
                      <span>UX-Mognad</span>
                    </div>
                  </button>

                  {/* Kompetens */}
                  <button
                    onClick={() => {
                      setActiveTab('dashboard');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm text-neutral-800 hover:bg-neutral-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <GraduationCap size={18} className="text-neutral-700" />
                      <span>Kompetens</span>
                    </div>
                  </button>

                  {/* Designsystem (IDS) */}
                  <button
                    onClick={() => {
                      setActiveTab('dashboard');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm text-neutral-800 hover:bg-neutral-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <Layers size={18} className="text-neutral-700" />
                      <span>Designsystem (IDS)</span>
                    </div>
                  </button>

                  {/* Åtgärder */}
                  <button
                    onClick={() => {
                      setActiveTab('dashboard');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm text-neutral-800 hover:bg-neutral-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <CheckSquare size={18} className="text-neutral-700" />
                      <span>Åtgärder</span>
                    </div>
                  </button>

                  {/* Administration */}
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        if (activeTab !== 'admin') {
                          setActiveTab('admin');
                        }
                        setIsAdminExpanded(!isAdminExpanded);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all",
                        activeTab === 'admin'
                          ? "bg-[#a63363] text-white shadow-sm"
                          : "text-neutral-800 hover:bg-neutral-100"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Settings size={18} className={activeTab === 'admin' ? "text-white" : "text-neutral-700"} />
                        <span>Administration</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeTab === 'admin' && (
                          <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                            Aktiv
                          </span>
                        )}
                        <ChevronDown size={18} className={cn("transition-transform", isAdminExpanded && "rotate-180")} />
                      </div>
                    </button>

                    {isAdminExpanded && (
                      <div className="pl-9 pr-2 space-y-1 py-1">
                        <button 
                          onClick={() => { setActiveTab('admin'); setAdminSubTab('users'); setIsMobileMenuOpen(false); }}
                          className={cn("w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-colors", activeTab === 'admin' && adminSubTab === 'users' ? "text-[#a63363] bg-pink-50" : "text-neutral-700 hover:text-[#a63363] hover:bg-pink-50")}
                        >
                          Användare
                        </button>
                        <button 
                          onClick={() => { setActiveTab('admin'); setAdminSubTab('upload'); setIsMobileMenuOpen(false); }}
                          className={cn("w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-colors", activeTab === 'admin' && adminSubTab === 'upload' ? "text-[#a63363] bg-pink-50" : "text-neutral-700 hover:text-[#a63363] hover:bg-pink-50")}
                        >
                          Ladda upp data
                        </button>
                        <button 
                          onClick={() => { setActiveTab('admin'); setAdminSubTab('api'); setIsMobileMenuOpen(false); }}
                          className={cn("w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-colors", activeTab === 'admin' && adminSubTab === 'api' ? "text-[#a63363] bg-pink-50" : "text-neutral-700 hover:text-[#a63363] hover:bg-pink-50")}
                        >
                          API-inställningar
                        </button>
                        <button 
                          onClick={() => { setActiveTab('admin'); setAdminSubTab('rawdata'); setIsMobileMenuOpen(false); }}
                          className={cn("w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-colors", activeTab === 'admin' && adminSubTab === 'rawdata' ? "text-[#a63363] bg-pink-50" : "text-neutral-700 hover:text-[#a63363] hover:bg-pink-50")}
                        >
                          Rådata Export
                        </button>
                        <button 
                          onClick={() => { setActiveTab('admin'); setAdminSubTab('catalog'); setIsMobileMenuOpen(false); }}
                          className={cn("w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-colors", activeTab === 'admin' && adminSubTab === 'catalog' ? "text-[#a63363] bg-pink-50" : "text-neutral-700 hover:text-[#a63363] hover:bg-pink-50")}
                        >
                          Produktkatalog & Mappning
                        </button>
                        <button 
                          onClick={() => { setActiveTab('admin'); setAdminSubTab('grundstruktur'); setIsMobileMenuOpen(false); }}
                          className={cn("w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-colors", activeTab === 'admin' && adminSubTab === 'grundstruktur' ? "text-[#a63363] bg-pink-50" : "text-neutral-700 hover:text-[#a63363] hover:bg-pink-50")}
                        >
                          Inläsning Inera Grundstruktur
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-700 truncate">
                  <LucideUser size={16} className="text-[#a63363] shrink-0" />
                  <span className="truncate">{userNames.firstName} {userNames.lastName}</span>
                </div>
                <button
                  onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#a63363]/30 bg-[#fdf2f6] text-[#a63363] font-bold text-xs hover:bg-[#fce4ee] transition-colors"
                >
                  <LogOut size={14} />
                  <span>Logga ut</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sync Confirmation Banner */}
      {syncNotice && (
        <div className="max-w-[80rem] mx-auto mt-4 px-6">
          <div className="bg-inera-success-95 text-inera-success-40 border border-inera-success-40 p-3 rounded-lg text-sm font-semibold flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} />
              <span>{syncNotice}</span>
            </div>
            <button onClick={() => setSyncNotice(null)} className="text-xs hover:underline">Stäng</button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-[80rem] mx-auto mt-6 px-6">
        {activeTab === 'sus_admin' && <SusAdminView />}
          {activeTab === 'dashboard' && (
            <div className="bg-inera-secondary-95 border border-inera-secondary-90 rounded-2xl p-4 mb-8 shadow-sm">
              <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl shadow-sm border border-inera-secondary-90 w-full justify-between lg:justify-start">
                <div className="flex flex-col gap-1 px-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-inera-neutral-40">Filter: Tåg</label>
                  <select 
                    value={selectedTrainFilter}
                    onChange={(e) => {
                      setSelectedTrainFilter(e.target.value);
                      setSelectedTeamFilter('Alla');
                      setView('company');
                      setSelectedProductId(null);
                      setSelectedVariant('Alla');
                    }}
                    className="bg-transparent border-none text-sm font-bold text-inera-neutral-10 outline-none pr-8 cursor-pointer hover:text-inera-primary-40 transition-colors"
                  >
                    {availableTrains.map(t => (
                      <option key={t} value={t}>{t === 'Alla' ? 'Alla tåg' : t}</option>
                    ))}
                  </select>
                </div>

                <div className="hidden sm:block w-px h-10 bg-inera-secondary-90" />

                <div className="flex flex-col gap-1 px-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-inera-neutral-40">Filter: Team</label>
                  <select 
                    value={selectedTeamFilter}
                    onChange={(e) => {
                      setSelectedTeamFilter(e.target.value);
                      setView('company');
                      setSelectedProductId(null);
                      setSelectedVariant('Alla');
                    }}
                    className="bg-transparent border-none text-sm font-bold text-inera-neutral-10 outline-none pr-8 cursor-pointer hover:text-inera-primary-40 transition-colors"
                  >
                    {availableTeams.map(tm => (
                      <option key={tm} value={tm}>{tm === 'Alla' ? 'Alla team' : tm}</option>
                    ))}
                  </select>
                </div>

                <div className="hidden sm:block w-px h-10 bg-inera-secondary-90" />

                <div className="flex flex-col gap-1 px-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-inera-neutral-40">Analysera Produkt</label>
                  <select 
                    value={view === 'company' ? 'Alla' : selectedProductId || 'Alla'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'Alla') {
                        setView('company');
                        setSelectedProductId(null);
                        setSelectedVariant('Alla');
                      } else {
                        setView('product');
                        setSelectedProductId(val);
                        setSelectedVariant('Alla');
                      }
                    }}
                    className="bg-transparent border-none text-sm font-bold text-inera-neutral-10 outline-none pr-8 cursor-pointer hover:text-inera-primary-40 transition-colors"
                  >
                    <option value="Alla">Alla produkter avg.</option>
                    {filteredProducts.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="hidden sm:block w-px h-10 bg-inera-secondary-90" />

                <div className="flex flex-col gap-1 px-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-inera-neutral-40">Tidsperiod / Mätning</label>
                  <select 
                    value={selectedMeasurementId}
                    onChange={(e) => setSelectedMeasurementId(e.target.value)}
                    className="bg-transparent border-none text-sm font-bold text-inera-neutral-10 outline-none pr-8 cursor-pointer hover:text-inera-primary-40 transition-colors"
                  >
                    <optgroup label="Tidsperioder">
                      <option value="all">Alla datum (Aggregerat)</option>
                      <option value="30d">Senaste 30 dagarna</option>
                      <option value="90d">Senaste 90 dagarna</option>
                      <option value="1y">Senaste året</option>
                      <option value="latest">Senaste mätningen</option>
                    </optgroup>
                    {availableMeasurementRounds.length > 0 && (
                      <optgroup label="Mätomgångar & Enkäter">
                        {availableMeasurementRounds.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.label} ({r.count} svar)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="min-w-0 w-full overflow-x-hidden">
            <AnimatePresence mode="wait">
            {activeTab === 'dashboard' ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="space-y-8"
              >
              {view === 'company' ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatCard 
                      icon={Database} 
                      label="Produkter" 
                      value={companyStats.totalProducts || 0} 
                      subValue={selectedTrainFilter === 'Alla' ? 'Alla Tåg (INERA)' : selectedTeamFilter === 'Alla' ? `Tåg: ${selectedTrainFilter}` : `Team: ${selectedTeamFilter}`}
                      color="bg-inera-primary-40" 
                    />
                    <StatCard 
                      icon={TrendingUp} 
                      label="Inera Snitt (SUS)" 
                      value={companyStats.avg || '-'} 
                      subValue={companyStats.avg ? getSusGrade(companyStats.avg).label : 'Ingen data'}
                      color="bg-inera-accent-40" 
                    />
                    <StatCard 
                      icon={Users} 
                      label="Totala svar" 
                      value={companyStats.totalResponses || '-'} 
                      subValue="Samtliga mätningar"
                      color="bg-inera-success-40" 
                    />
                  </div>

                  <SusLegend />

                  <div className="card p-0 shadow-sm overflow-hidden border-inera-secondary-90">
                    <div className="p-6 border-b border-inera-secondary-90 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-inera-neutral-10">Produktkatalog (Tåg / Team / Produkt)</h3>
                        <p className="text-xs text-inera-neutral-40">Hierarkisk sammanställning baserat på Inera Grundstruktur</p>
                      </div>
                      <div className="text-xs text-inera-neutral-40 font-medium uppercase tracking-wider">
                        Visar {filteredProducts.length} av {products.length} produkter
                      </div>
                    </div>
                    <div className="p-6 space-y-8">
                      {groupedHierarchy.length === 0 ? (
                        <div className="text-center py-8 text-inera-neutral-40">Inga produkter matchade valda filter.</div>
                      ) : (
                        groupedHierarchy.map(tr => (
                          <div key={tr.trainName} className="space-y-4 border border-inera-secondary-90 rounded-xl p-5 bg-inera-secondary-95/30">
                            {/* Train Header */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-inera-secondary-90">
                              <div className="flex items-center gap-2">
                                <span className="bg-inera-primary-40 text-white text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">TÅG</span>
                                <h4 className="text-base font-bold text-inera-neutral-10 font-display">{tr.trainName}</h4>
                                <span className="text-xs text-inera-neutral-40 font-medium">({tr.productCount} produkter, {tr.responseCount} svar)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-inera-neutral-40 font-bold uppercase">Aggregerat SUS:</span>
                                <span className={cn("text-sm font-extrabold px-3 py-1 rounded-full text-white shadow-xs", getSusGrade(tr.avgScore).bgClass)}>
                                  {tr.avgScore > 0 ? `${tr.avgScore} SUS` : 'Ingen data'}
                                </span>
                              </div>
                            </div>

                            {/* Teams list */}
                            <div className="space-y-6 pt-2">
                              {tr.teams.map(tm => (
                                <div key={tm.teamName} className="space-y-3 pl-2 sm:pl-4 border-l-2 border-inera-primary-40/30">
                                  {/* Team Header */}
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="bg-inera-accent-40 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">TEAM</span>
                                      <h5 className="text-sm font-bold text-inera-neutral-20">{tm.teamName}</h5>
                                    </div>
                                    <span className="text-xs font-bold text-inera-neutral-30">
                                      Team SUS: <span className="font-extrabold text-inera-neutral-10">{tm.avgScore > 0 ? `${tm.avgScore}` : '-'}</span>
                                    </span>
                                  </div>

                                  {/* Products inside Team */}
                                  <div className="space-y-3 pt-1">
                                    {tm.products.map(p => (
                                      <div 
                                        key={p.id}
                                        className="space-y-2 bg-white p-3.5 rounded-lg border border-inera-secondary-90 hover:border-inera-primary-40/50 transition-colors"
                                      >
                                        <div 
                                          className="flex items-center gap-4 cursor-pointer group"
                                          onClick={() => { setSelectedProductId(p.id); setView('product'); }}
                                        >
                                            <div className="flex-shrink-0 w-48 text-sm font-bold text-inera-neutral-10 group-hover:text-inera-primary-40 transition-colors leading-tight whitespace-normal">
                                              {p.name}
                                              {p.latest?.isActive && (
                                                <div className="mt-1">
                                                  <span className="inline-flex items-center bg-inera-success-95 text-inera-success-40 text-[9px] px-1.5 py-0.5 rounded border border-inera-success-40 uppercase tracking-wider font-extrabold animate-pulse">
                                                    PÅGÅENDE
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          <div className="flex-1 h-7 bg-inera-secondary-90 rounded-full overflow-hidden relative">
                                            {p.latest && p.latest.responseCount > 0 ? (
                                              <>
                                                <div 
                                                  className={cn("h-full transition-all duration-500", getSusGrade(p.latest.averageScore).bgClass)} 
                                                  style={{ width: `${Math.max(p.latest.averageScore, 5)}%` }} 
                                                />
                                                {p.latest.medianScore !== undefined && (
                                                  <div 
                                                    className="absolute top-0 bottom-0 w-1.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.3)] z-10 rounded-full h-4 my-auto"
                                                    style={{ left: `${p.latest.medianScore}%`, transform: 'translateX(-50%)' }}
                                                    title={`Median: ${Math.round(p.latest.medianScore)}${getMedianExplanation(p.latest.averageScore, p.latest.medianScore) ? '\n\n' + getMedianExplanation(p.latest.averageScore, p.latest.medianScore) : ''}`}
                                                  />
                                                )}
                                                <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
                                                  <span className="text-[11px] font-bold text-white drop-shadow-md">
                                                    {Math.round(p.latest.averageScore)} SUS (Medel)
                                                  </span>
                                                  {p.latest.medianScore !== undefined && (
                                                    <span 
                                                      className="text-[11px] font-bold text-white drop-shadow-md opacity-90 pointer-events-auto cursor-help"
                                                      title={getMedianExplanation(p.latest.averageScore, p.latest.medianScore)}
                                                    >
                                                      {Math.round(p.latest.medianScore)} (Median)
                                                    </span>
                                                  )}
                                                </div>
                                              </>
                                            ) : p.latest?.isActive ? (
                                              <div className="absolute inset-0 flex items-center px-3">
                                                <span className="text-[11px] font-bold text-inera-success-40 italic">Mätning pågår (0 svar)</span>
                                              </div>
                                            ) : (
                                              <div className="absolute inset-0 flex items-center px-3">
                                                <span className="text-[11px] font-bold text-inera-neutral-40 italic">Ingen mätning</span>
                                              </div>
                                            )}
                                          </div>
                                          <div className="w-16 text-right text-xs text-inera-neutral-40 font-bold">
                                            {p.latest ? `${p.latest.responseCount} svar` : '-'}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Product View Content (existing) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard 
                      icon={TrendingUp} 
                      label="Snitt SUS" 
                      value={Math.round(averageSus * 10) / 10} 
                      subValue={`${getSusGrade(averageSus).label} • Median: ${Math.round(calculateMedian(filteredResponses.map(r => r.susScore)))}`}
                      color="bg-inera-primary-40" 
                      trend={measurements.length > 1 ? Math.round((measurements[0].averageScore - measurements[1].averageScore) * 10) / 10 : null}
                    />
                    <StatCard 
                      icon={Users} 
                      label="Antal svar" 
                      value={filteredResponses.length} 
                      subValue="Senaste mätningen"
                      color="bg-inera-accent-40" 
                    />
                    <StatCard 
                      icon={Filter} 
                      label="Produkt" 
                      value={selectedVariant} 
                      subValue={`${variants.length} tillgängliga`}
                      color="bg-inera-success-40" 
                    />
                    <StatCard 
                      icon={FileSpreadsheet} 
                      label="Mätningar" 
                      value={measurements.length} 
                      subValue="Totalt i historiken"
                      color="bg-inera-info-40" 
                    />
                  </div>

                  <SusLegend />
                  {measurements[0]?.variantScores && Object.keys(measurements[0].variantScores).length > 0 && selectedVariant === 'Alla' && (
                    <div className="card p-6 shadow-sm border-inera-secondary-90">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-inera-neutral-10 flex items-center gap-2">
                          <Filter size={20} className="text-inera-success-40" />
                          SUS per Produkt (Senaste mätningen)
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-inera-neutral-40 uppercase">Sortera:</span>
                          <select 
                            value={`${variantSort.key}-${variantSort.direction}`}
                            onChange={(e) => {
                              const [key, direction] = e.target.value.split('-') as [any, any];
                              setVariantSort({ key, direction });
                            }}
                            className="bg-inera-secondary-95 border border-inera-secondary-90 rounded-lg px-2 py-1 text-xs font-bold outline-none"
                          >
                            <option value="name-asc">Namn A-Ö</option>
                            <option value="name-desc">Namn Ö-A</option>
                            <option value="score-desc">Högst poäng</option>
                            <option value="score-asc">Lägst poäng</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {Object.entries(
                          Object.entries(measurements[0].variantScores).reduce((acc, [vName, vData]: [string, any]) => {
                            const mappedName = vName === 'Generell' || vName === 'Other' ? 'Övriga' : vName;
                            if (!acc[mappedName]) {
                              acc[mappedName] = { ...vData };
                            } else {
                              const totalCount = acc[mappedName].count + vData.count;
                              acc[mappedName].score = (acc[mappedName].score * acc[mappedName].count + vData.score * vData.count) / totalCount;
                              acc[mappedName].count = totalCount;
                            }
                            return acc;
                          }, {} as Record<string, any>)
                        )
                          .sort(([aName, aData], [bName, bData]) => {
                            const a = aData as { score: number };
                            const b = bData as { score: number };
                            if (variantSort.key === 'name') {
                              return variantSort.direction === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
                            } else {
                              return variantSort.direction === 'asc' ? a.score - b.score : b.score - a.score;
                            }
                          })
                          .map(([vName, vData]: [string, any]) => {
                            const grade = getSusGrade(vData.score);
                            return (
                              <div key={vName} className={cn("p-4 rounded-xl border relative overflow-hidden group", grade.color)}>
                                <div className="relative z-10">
                                  <p className="text-xs font-bold uppercase tracking-wider mb-1 truncate" title={vName}>{vName}</p>
                                  <div className="flex items-baseline justify-between mb-1">
                                    <span className="text-2xl font-black">{Math.round(vData.score)}</span>
                                    <span className="text-[10px] font-bold opacity-75">{vData.count} svar</span>
                                  </div>
                                  {vData.median !== undefined && (
                                    <div 
                                      className="text-[10px] font-bold opacity-90 flex items-center gap-1 cursor-help"
                                      title={getMedianExplanation(vData.score, vData.median)}
                                    >
                                      <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                      Median: {Math.round(vData.median)}
                                    </div>
                                  )}
                                </div>
                                {/* Visual score indicator background */}
                                <div 
                                  className="absolute bottom-0 left-0 h-3 bg-current opacity-60 transition-all duration-500" 
                                  style={{ width: `${vData.score}%` }} 
                                />
                                {vData.median !== undefined && (
                                  <div 
                                    className="absolute bottom-0 h-4 w-2.5 bg-white border-2 border-current shadow-[0_0_6px_rgba(0,0,0,0.4)] z-20 rounded-t-full" 
                                    style={{ left: `${vData.median}%`, transform: 'translateX(-50%)' }} 
                                    title={`Median: ${Math.round(vData.median)}${getMedianExplanation(vData.score, vData.median) ? '\n\n' + getMedianExplanation(vData.score, vData.median) : ''}`}
                                  />
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Charts Row 1 */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="card p-6 shadow-sm border-inera-secondary-90">
                      <h3 className="text-lg font-bold text-inera-neutral-10 mb-6 flex items-center gap-2">
                        <TrendingUp size={20} className="text-inera-primary-40" />
                        SUS Utveckling över tid
                      </h3>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f6f1e9" />
                            <XAxis 
                              dataKey="date" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{fill: '#8e9299', fontSize: 10}} 
                            />
                            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#8e9299', fontSize: 12}} />
                            <Tooltip 
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const d = payload[0].payload;
                                  return (
                                    <div className="bg-white p-3 rounded-xl shadow-xl border border-inera-secondary-90 text-xs">
                                      <p className="font-bold mb-1 text-inera-neutral-10">{d.fullDate}</p>
                                      <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-inera-primary-40" />
                                        <span>SUS: <span className="font-bold">{d.score}</span></span>
                                      </div>
                                      <p className="text-inera-neutral-40 mt-1">Baserat på {d.count} svar</p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="score" 
                              stroke="#A33662" 
                              strokeWidth={3} 
                              dot={{ r: 4, fill: '#A33662', strokeWidth: 2, stroke: '#fff' }}
                              activeDot={{ r: 6 }}
                              animationDuration={1000}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="card p-6 shadow-sm border-inera-secondary-90">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-inera-neutral-10 flex items-center gap-2">
                          <Users size={20} className="text-inera-accent-40" />
                          SUS Fördelning
                        </h3>
                        <div className="flex bg-inera-secondary-95 p-1 rounded-lg">
                          <button 
                            onClick={() => setDistributionView('bar')}
                            className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all", distributionView === 'bar' ? "bg-white shadow-sm text-inera-primary-40" : "text-inera-neutral-40 hover:text-inera-neutral-20")}
                          >
                            Stapel
                          </button>
                          <button 
                            onClick={() => setDistributionView('box')}
                            className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all", distributionView === 'box' ? "bg-white shadow-sm text-inera-primary-40" : "text-inera-neutral-40 hover:text-inera-neutral-20")}
                          >
                            Box-plot
                          </button>
                        </div>
                      </div>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          {distributionView === 'bar' ? (
                            <BarChart data={distributionData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f6f1e9" />
                              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#8e9299', fontSize: 12}} />
                              <YAxis axisLine={false} tickLine={false} tick={{fill: '#8e9299', fontSize: 12}} />
                              <Tooltip 
                                cursor={{fill: '#f9f6f1'}}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                              />
                              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                {distributionData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Bar>
                            </BarChart>
                          ) : (
                            <BarChart 
                              data={boxStats ? [boxStats] : []}
                              layout="vertical"
                            >
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f6f1e9" />
                              <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#8e9299', fontSize: 12}} />
                              <YAxis type="category" dataKey="name" hide />
                              <Tooltip 
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                      <div className="card p-4 shadow-xl border-inera-secondary-90 text-xs">
                                        <p className="font-bold mb-2 text-inera-neutral-10">{data.name}</p>
                                        <div className="space-y-1">
                                          <div className="flex justify-between gap-4"><span>Max:</span><span className="font-bold">{Math.round(data.max)}</span></div>
                                          <div className="flex justify-between gap-4"><span>Q3:</span><span className="font-bold">{Math.round(data.q3)}</span></div>
                                          <div className="flex justify-between gap-4 text-inera-primary-40"><span>Median:</span><span className="font-bold">{Math.round(data.median)}</span></div>
                                          {getMedianExplanation(averageSus, data.median) && (
                                            <p className="mt-2 text-[10px] text-inera-primary-40 leading-relaxed italic bg-inera-primary-70/10 p-2 rounded">
                                              {getMedianExplanation(averageSus, data.median)}
                                            </p>
                                          )}
                                          <div className="flex justify-between gap-4 pt-1 border-t border-inera-secondary-90 mt-1"><span>Q1:</span><span className="font-bold">{Math.round(data.q1)}</span></div>
                                          <div className="flex justify-between gap-4"><span>Min:</span><span className="font-bold">{Math.round(data.min)}</span></div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              {/* Box Plot visualization using stacked bars */}
                              <Bar dataKey="min" stackId="a" fill="transparent" />
                              <Bar dataKey="q1_diff" stackId="a" fill="#e5e7eb" />
                              <Bar dataKey="median_diff" stackId="a" fill="#A33662" />
                              <Bar dataKey="q3_diff" stackId="a" fill="#A33662" opacity={0.8} />
                              <Bar dataKey="max_diff" stackId="a" fill="#e5e7eb" />
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Comments Section */}
                  <div className="card p-0 shadow-sm overflow-hidden border-inera-secondary-90">
                    <div className="p-6 border-b border-inera-secondary-90 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-inera-neutral-10 flex items-center gap-2">
                          <MessageSquare size={20} className="text-inera-primary-40" />
                          Användarkommentarer
                        </h3>
                        <p className="text-xs text-inera-neutral-40">Kopplade till SUS Betygsskala</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {(() => {
                          const comments = filteredResponses.filter(r => r.comment);
                          const excellent = comments.filter(r => r.susScore >= 80.3).length;
                          const good = comments.filter(r => r.susScore >= 68 && r.susScore < 80.3).length;
                          const pass = comments.filter(r => r.susScore >= 51 && r.susScore < 68).length;
                          const fail = comments.filter(r => r.susScore < 51).length;

                          return (
                            <>
                              {excellent > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setCommentCategoryFilter(prev => prev === 'excellent' ? 'all' : 'excellent')}
                                  className={cn(
                                    "px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5",
                                    commentCategoryFilter === 'excellent'
                                      ? "bg-emerald-700 text-white border-emerald-800 shadow-sm ring-2 ring-emerald-600/40"
                                      : "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                                  )}
                                >
                                  <span>{excellent} Utmärkt</span>
                                </button>
                              )}
                              {good > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setCommentCategoryFilter(prev => prev === 'good' ? 'all' : 'good')}
                                  className={cn(
                                    "px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5",
                                    commentCategoryFilter === 'good'
                                      ? "bg-blue-700 text-white border-blue-800 shadow-sm ring-2 ring-blue-600/40"
                                      : "bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100"
                                  )}
                                >
                                  <span>{good} Bra</span>
                                </button>
                              )}
                              {pass > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setCommentCategoryFilter(prev => prev === 'pass' ? 'all' : 'pass')}
                                  className={cn(
                                    "px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5",
                                    commentCategoryFilter === 'pass'
                                      ? "bg-amber-700 text-white border-amber-800 shadow-sm ring-2 ring-amber-600/40"
                                      : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                                  )}
                                >
                                  <span>{pass} Godkänd</span>
                                </button>
                              )}
                              {fail > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setCommentCategoryFilter(prev => prev === 'fail' ? 'all' : 'fail')}
                                  className={cn(
                                    "px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5",
                                    commentCategoryFilter === 'fail'
                                      ? "bg-red-700 text-white border-red-800 shadow-sm ring-2 ring-red-600/40"
                                      : "bg-red-50 text-red-800 border-red-300 hover:bg-red-100"
                                  )}
                                >
                                  <span>{fail} Underkänd</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setCommentCategoryFilter('all')}
                                className={cn(
                                  "px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5",
                                  commentCategoryFilter === 'all'
                                    ? "bg-inera-primary-40 text-white border-inera-primary-40 shadow-sm ring-2 ring-inera-primary-40/40"
                                    : "bg-inera-secondary-90 text-inera-neutral-20 border-inera-secondary-80 hover:bg-inera-secondary-80"
                                )}
                              >
                                <span>{comments.length} totalt</span>
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="max-h-[600px] overflow-y-auto p-6 space-y-8">
                      {(() => {
                        let commentsWithText = filteredResponses.filter(r => r.comment);
                        if (commentCategoryFilter === 'excellent') {
                          commentsWithText = commentsWithText.filter(r => r.susScore >= 80.3);
                        } else if (commentCategoryFilter === 'good') {
                          commentsWithText = commentsWithText.filter(r => r.susScore >= 68 && r.susScore < 80.3);
                        } else if (commentCategoryFilter === 'pass') {
                          commentsWithText = commentsWithText.filter(r => r.susScore >= 51 && r.susScore < 68);
                        } else if (commentCategoryFilter === 'fail') {
                          commentsWithText = commentsWithText.filter(r => r.susScore < 51);
                        }

                        if (commentsWithText.length === 0) {
                          return (
                            <div className="text-center text-inera-neutral-40 py-12">
                              Inga kommentarer för detta urval.
                            </div>
                          );
                        }

                        // Group by variant
                        const byVariant: Record<string, ResponseData[]> = {};
                        commentsWithText.forEach(r => {
                          const vKey = r.variantName || 'Generell';
                          if (!byVariant[vKey]) byVariant[vKey] = [];
                          byVariant[vKey].push(r);
                        });

                        const getBadgeProps = (score: number) => {
                          if (score >= 80.3) {
                            return { label: 'Utmärkt', bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-300' };
                          } else if (score >= 68) {
                            return { label: 'Bra', bgClass: 'bg-blue-50 text-blue-800 border-blue-300' };
                          } else if (score >= 51) {
                            return { label: 'Godkänd', bgClass: 'bg-amber-50 text-amber-800 border-amber-300' };
                          } else {
                            return { label: 'Underkänd', bgClass: 'bg-red-50 text-red-800 border-red-300' };
                          }
                        };

                        return Object.entries(byVariant).map(([vName, responses]) => {
                          return (
                            <div key={vName} className="space-y-4">
                              <div className="flex items-center justify-between border-b border-inera-secondary-90 pb-2">
                                <h4 className="font-bold text-inera-primary-40 uppercase tracking-wider text-sm">{vName}</h4>
                                <span className="text-xs text-inera-neutral-40 font-bold">{responses.length} kommentarer</span>
                              </div>
                              <div className="space-y-3">
                                <AnimatePresence mode="popLayout">
                                {responses.map(r => {
                                  const badge = getBadgeProps(r.susScore);
                                  const prodObj = products.find(p => p.id === r.productId);
                                  const prodName = prodObj ? prodObj.name : r.productId;

                                  return (
                                    <motion.div 
                                      key={r.id} 
                                      layout
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95 }}
                                      transition={{ duration: 0.2 }}
                                      className="bg-inera-secondary-95 p-4 rounded-xl border border-inera-secondary-90"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className={cn("px-2.5 py-0.5 rounded text-[11px] font-extrabold border shadow-2xs flex items-center gap-1.5", badge.bgClass)}>
                                            <span>{badge.label}</span>
                                            <span className="opacity-50">•</span>
                                            <span>SUS {Math.round(r.susScore * 10) / 10}</span>
                                          </div>
                                          {prodName && (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-inera-secondary-90 text-inera-neutral-30 border border-inera-secondary-80">
                                              {prodName}
                                            </span>
                                          )}
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-inera-secondary-90 text-inera-neutral-30 border border-inera-secondary-80">
                                            {r.variantName === 'Other' && r.otherText ? `Other: ${r.otherText}` : r.variantName}
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-inera-neutral-40 font-bold">{format(r.submitDate, 'yyyy-MM-dd HH:mm')}</span>
                                      </div>
                                      <p className="text-inera-neutral-20 leading-relaxed italic text-sm mt-1">"{r.comment}"</p>
                                    </motion.div>
                                  );
                                })}
                                </AnimatePresence>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              )}
              </motion.div>
            ) : activeTab === 'admin' && user?.email && ADMIN_EMAILS.includes(user.email) ? (
              <motion.div
                key="admin"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <div className="flex flex-wrap items-center justify-between border-b border-inera-secondary-90 gap-4 pb-2 mb-6 hidden md:flex">
                  <div className="flex gap-6 overflow-x-auto">
                    <button 
                      type="button"
                      className={cn("text-sm font-bold pb-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer", adminSubTab === 'users' ? "border-[#a63363] text-[#a63363]" : "border-transparent text-inera-neutral-40 hover:text-inera-neutral-20")}
                      onClick={() => setAdminSubTab('users')}
                    >
                      Användare
                    </button>
                    <button 
                      type="button"
                      className={cn("text-sm font-bold pb-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer", adminSubTab === 'upload' ? "border-[#a63363] text-[#a63363]" : "border-transparent text-inera-neutral-40 hover:text-inera-neutral-20")}
                      onClick={() => setAdminSubTab('upload')}
                    >
                      Ladda upp data
                    </button>
                    <button 
                      type="button"
                      className={cn("text-sm font-bold pb-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer", adminSubTab === 'api' ? "border-[#a63363] text-[#a63363]" : "border-transparent text-inera-neutral-40 hover:text-inera-neutral-20")}
                      onClick={() => setAdminSubTab('api')}
                    >
                      API-inställningar
                    </button>
                    <button 
                      type="button"
                      className={cn("text-sm font-bold pb-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer", adminSubTab === 'rawdata' ? "border-[#a63363] text-[#a63363]" : "border-transparent text-inera-neutral-40 hover:text-inera-neutral-20")}
                      onClick={() => setAdminSubTab('rawdata')}
                    >
                      Rådata Export
                    </button>
                    <button 
                      type="button"
                      className={cn("text-sm font-bold pb-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer", adminSubTab === 'catalog' ? "border-[#a63363] text-[#a63363]" : "border-transparent text-inera-neutral-40 hover:text-inera-neutral-20")}
                      onClick={() => setAdminSubTab('catalog')}
                    >
                      Produktkatalog & Mappning
                    </button>
                    <button 
                      type="button"
                      className={cn("text-sm font-bold pb-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer", adminSubTab === 'grundstruktur' ? "border-[#a63363] text-[#a63363]" : "border-transparent text-inera-neutral-40 hover:text-inera-neutral-20")}
                      onClick={() => setAdminSubTab('grundstruktur')}
                    >
                      Inläsning Inera Grundstruktur
                    </button>
                  </div>
                  {user?.email === 'andreas.l.melin@gmail.com' && (
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(true)}
                      className="btn btn--xs btn--destructive shrink-0 flex items-center gap-1.5"
                    >
                      <Trash2 size={14} />
                      Nollställ Katalog
                    </button>
                  )}
                </div>
                <AdminView 
                  activeAdminTab={adminSubTab}
                  onResetCatalog={user?.email === 'andreas.l.melin@gmail.com' ? () => setShowResetConfirm(true) : undefined} 
                  uploadNode={(
                    <div className="card p-8 shadow-sm border-inera-secondary-90 bg-white">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="bg-inera-secondary-95 p-3 rounded-xl">
                          <Upload className="text-inera-primary-40" size={24} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-inera-neutral-10">Ladda upp mätning</h3>
                          <p className="text-sm text-inera-neutral-40">Välj tjänst och ladda upp CSV-fil eller ange manuella mätvärden.</p>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="label">Välj tjänst</label>
                          <div className="flex gap-2">
                            <select 
                              value={uploadProductId}
                              onChange={(e) => setUploadProductId(e.target.value)}
                              className="select flex-1"
                            >
                              <option value="">-- Välj befintlig tjänst --</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                            <div className="flex items-center px-3 text-inera-neutral-60 font-bold">ELLER</div>
                            <input 
                              type="text" 
                              placeholder="Ny tjänst..." 
                              value={uploadProductId}
                              onChange={(e) => setUploadProductId(e.target.value)}
                              className="input flex-1"
                            />
                          </div>
                          <p className="text-[10px] text-inera-neutral-60 italic">Tips: Skriv namnet om tjänsten inte finns i listan.</p>
                        </div>

                        <div className="flex gap-2 border-b border-inera-secondary-90 pb-4">
                          <button
                            type="button"
                            onClick={() => { setUploadMethod('csv'); setUploadStatus(null); }}
                            className={cn("text-xs font-bold pb-2 border-b-2 px-4 transition-colors", uploadMethod === 'csv' ? "border-inera-primary-40 text-inera-primary-40" : "border-transparent text-inera-neutral-40 hover:text-inera-neutral-25")}
                          >
                            CSV-fil
                          </button>
                          <button
                            type="button"
                            onClick={() => { setUploadMethod('manual'); setUploadStatus(null); }}
                            className={cn("text-xs font-bold pb-2 border-b-2 px-4 transition-colors", uploadMethod === 'manual' ? "border-inera-primary-40 text-inera-primary-40" : "border-transparent text-inera-neutral-40 hover:text-inera-neutral-25")}
                          >
                            Registrera manuellt betyg
                          </button>
                        </div>

                        {uploadMethod === 'manual' ? (
                          <form onSubmit={handleManualSubmit} className="space-y-4 p-5 bg-inera-secondary-95/50 border border-inera-secondary-90 rounded-xl">
                            <h4 className="text-sm font-bold text-inera-neutral-20">Ange mätvärden för tjänsten</h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-xs font-bold text-inera-neutral-30">Genomsnittlig SUS-poäng (0–100) *</label>
                                <input 
                                  type="number" 
                                  min="0"
                                  max="100"
                                  step="0.1"
                                  required
                                  placeholder="t.ex. 81.5"
                                  value={manualSusScore}
                                  onChange={(e) => setManualSusScore(e.target.value)}
                                  className="input w-full text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-bold text-inera-neutral-30">Antal svar (Evaluations Count) *</label>
                                <input 
                                  type="number" 
                                  min="1"
                                  required
                                  placeholder="t.ex. 112"
                                  value={manualResponseCount}
                                  onChange={(e) => setManualResponseCount(e.target.value)}
                                  className="input w-full text-xs"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-bold text-inera-neutral-30">Mätningsdatum (Frivilligt, annars idag)</label>
                              <input 
                                type="date" 
                                value={manualDate}
                                onChange={(e) => setManualDate(e.target.value)}
                                className="input w-full text-xs"
                              />
                            </div>

                            <div className="pt-2 flex justify-end">
                              <button
                                type="submit"
                                disabled={isSavingManual || !uploadProductId}
                                className="btn btn--m btn--primary disabled:opacity-50"
                              >
                                {isSavingManual ? (
                                  <>
                                    <Loader2 className="animate-spin mr-2" size={16} />
                                    Sparar...
                                  </>
                                ) : 'Spara mätvärde'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="p-6 border-2 border-dashed border-inera-secondary-90 rounded-xl hover:border-inera-primary-60 transition-colors group relative">
                            <input 
                              type="file" 
                              accept=".csv" 
                              onChange={handleFileUpload}
                              disabled={isUploading || !uploadProductId}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <div className="text-center">
                              {isUploading ? (
                                <div className="flex flex-col items-center gap-3">
                                  <Loader2 className="animate-spin text-inera-primary-40" size={32} />
                                  <p className="text-sm font-medium text-inera-neutral-40">Bearbetar fil...</p>
                                </div>
                              ) : (
                                <>
                                  <FileSpreadsheet className={cn("mx-auto mb-4 transition-colors", !uploadProductId ? "text-inera-neutral-90" : "text-inera-neutral-60 group-hover:text-inera-primary-40")} size={40} />
                                  <p className={cn("text-sm font-bold", !uploadProductId ? "text-inera-neutral-60" : "text-inera-neutral-10")}>
                                    {!uploadProductId ? 'Välj tjänst först' : 'Klicka eller dra hit CSV-fil'}
                                  </p>
                                  <p className="text-xs text-inera-neutral-40 mt-1">Stöd för Ineras standardexport</p>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {uploadStatus && (
                          <div className={cn(
                            "alert mt-4",
                            uploadStatus.type === 'success' ? "alert--success" : "alert--error"
                          )} role="status">
                            {uploadStatus.type === 'success' ? <CheckCircle2 className="alert-icon" size={20} /> : <AlertCircle className="alert-icon" size={20} />}
                            <div className="alert-body">
                              <div className="alert-title">{uploadStatus.type === 'success' ? 'Klart!' : 'Fel'}</div>
                              <p>{uploadStatus.msg}</p>
                            </div>
                          </div>
                        )}

                        <div className="alert alert--info" role="status">
                          <AlertCircle className="alert-icon" size={20} />
                          <div className="alert-body">
                            <div className="alert-title">Instruktioner för filformat</div>
                            <ul className="text-xs space-y-1 list-disc pl-4 mt-2">
                              <li>Ladda upp rader direkt från exportfilen.</li>
                              <li>Automatiskt filter: Rader med värdet 0 på frågan om användaren kommer ihåg tjänsten hoppas över.</li>
                              <li>Automatiskt gruppering: Svar i "Other"-kolumnen slås ihop under produkten "Other".</li>
                              <li>Statistik baseras på kolumnerna för SUS-frågor och kommentarer.</li>
                              <li>Trenden visas baserat på "Start Date (UTC)".</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* History */}
                      {user?.email === 'andreas.l.melin@gmail.com' && (
                        <div className="mt-8">
                          <h3 className="text-lg font-bold text-inera-neutral-10 mb-4">Senaste uppladdningar</h3>
                          <div className="space-y-3">
                            {measurements.slice(0, 10).map(m => (
                              <div key={m.id} className="card flex items-center justify-between group py-3">
                                <div className="flex items-center gap-3">
                                  <div className="bg-inera-secondary-95 p-2 rounded-lg">
                                    <FileSpreadsheet size={18} className="text-inera-neutral-40" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-inera-neutral-10">{m.fileName}</p>
                                    <p className="text-xs text-inera-neutral-60">{format(m.date, 'yyyy-MM-dd HH:mm')}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-6">
                                  <div className="text-right">
                                    <p className="text-sm font-bold text-inera-primary-40">{Math.round(m.averageScore * 10) / 10} SUS</p>
                                    <p className="text-xs text-inera-neutral-40">{m.responseCount} svar</p>
                                  </div>
                                  <button 
                                    onClick={() => setMeasurementToDelete(m)}
                                    className="p-2 text-inera-neutral-80 hover:text-inera-error-40 hover:bg-inera-error-95 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    title="Ta bort mätning"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )} 
                />
              </motion.div>
            ) : null}
            </AnimatePresence>
          </div>
        </main>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-0 shadow-xl max-w-md w-full overflow-hidden border-inera-secondary-90">
            <div className="p-6 border-b border-inera-secondary-90 flex items-center gap-3 bg-inera-error-95">
              <div className="bg-inera-error-40 p-2 rounded-lg text-white">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-bold text-inera-error-20">Nollställ Katalog</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-inera-neutral-20 font-medium">
                Är du säker på att du vill nollställa hela katalogen?
              </p>
              <p className="text-sm text-inera-neutral-40">
                Detta kommer att permanent radera alla produkter, varianter, mätningar och svar från databasen. Denna åtgärd går inte att ångra.
              </p>
              {resetError && (
                <div className="p-3 bg-inera-error-95 text-inera-error-40 text-sm font-bold rounded-lg border border-inera-error-90">
                  {resetError}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-inera-secondary-90 bg-inera-secondary-95 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowResetConfirm(false);
                  setResetError(null);
                }}
                disabled={isResetting}
                className="btn btn--m btn--tertiary border border-transparent disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                onClick={async () => {
                  setIsResetting(true);
                  setResetError(null);
                  try {
                    await MeasurementService.resetCatalog();
                    // Reset local view states
                    setView('company');
                    setSelectedProductId(null);
                    setSelectedVariant('Alla');
                    setSelectedMeasurementId('all');
                    setShowResetConfirm(false);
                    setIsResetting(false);
                  } catch (e: any) {
                    console.error(e);
                    setResetError(e.message || 'Ett fel uppstod vid nollställning.');
                    setIsResetting(false);
                  }
                }}
                disabled={isResetting}
                className="btn btn--m btn--destructive disabled:opacity-50"
              >
                {isResetting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                Ja, nollställ allt
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Measurement Confirmation Modal */}
      {measurementToDelete && (
        <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-0 shadow-xl max-w-md w-full overflow-hidden border-inera-secondary-90">
            <div className="p-6 border-b border-inera-secondary-90 flex items-center gap-3 bg-inera-error-95">
              <div className="bg-inera-error-40 p-2 rounded-lg text-white">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-inera-error-20">Ta bort mätning</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-inera-neutral-20 font-medium">
                Är du säker på att du vill ta bort mätningen för <span className="text-inera-primary-40 font-bold">{products.find(p => p.id === measurementToDelete.productId)?.name || measurementToDelete.productId}</span>?
              </p>
              <div className="bg-inera-secondary-95 p-3 rounded-lg border border-inera-secondary-90">
                <p className="text-xs text-inera-neutral-40 uppercase font-bold tracking-wider mb-1">Mätning</p>
                <p className="text-sm font-bold text-inera-neutral-10">{measurementToDelete.fileName}</p>
                <p className="text-xs text-inera-neutral-60">{format(measurementToDelete.date, 'yyyy-MM-dd HH:mm')}</p>
              </div>
              <p className="text-sm text-inera-neutral-40">
                Detta kommer att permanent radera mätningen och alla tillhörande svar. Denna åtgärd går inte att ångra.
              </p>
            </div>
            <div className="p-6 border-t border-inera-secondary-90 bg-inera-secondary-95 flex items-center justify-end gap-3">
              <button
                onClick={() => setMeasurementToDelete(null)}
                disabled={isDeleting}
                className="btn btn--m btn--tertiary border border-transparent disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await MeasurementService.deleteMeasurement(measurementToDelete.id);
                    setMeasurementToDelete(null);
                  } catch (e) {
                    console.error('Delete failed', e);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={isDeleting}
                className="btn btn--m btn--destructive shadow-sm disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Tar bort...
                  </>
                ) : (
                  <>
                    <Trash2 size={18} />
                    Ta bort permanent
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-16 bg-[#f6f1e9] border-t border-inera-secondary-90 py-8 px-6 text-[#383d42]">
        <div className="max-w-[80rem] mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
          <div className="flex items-center gap-3">
            <img src={ineraLogo} alt="Inera Logo" className="h-6 w-auto" />
            <span className="text-inera-neutral-40 text-xs">|</span>
            <span className="text-xs text-inera-neutral-40 font-medium">© {new Date().getFullYear()} Inera AB. Alla rättigheter förbehållna.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
