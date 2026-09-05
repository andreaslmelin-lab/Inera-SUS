import React, { useState, useEffect } from 'react';
import { 
  collection, doc, getDocs, updateDoc, deleteDoc, addDoc, query, where, serverTimestamp 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertCircle, CheckCircle2, Loader2, Users, ExternalLink, Check, 
  Trash2, Edit3, Key, User as LucideUser, Lock, UserPlus, Copy, RefreshCw, X, UserCog,
  Upload, Send, FileSpreadsheet, Database, Layers
} from 'lucide-react';
import { format } from 'date-fns';
import { auth, db, sendPasswordResetEmail } from '../firebase';
import { cn } from '../lib/utils';
import { UserRole, Invitation } from '../types';
import { ADMIN_EMAILS } from '../constants';
import ApiView from './ApiView';
import RawDataView from './RawDataView';
import CatalogMappingView from './CatalogMappingView';
import GrundstrukturView from './GrundstrukturView';

const AdminView = ({ 
  activeAdminTab = 'users',
  onTabChange,
  uploadNode,
  onResetCatalog
}: { 
  activeAdminTab?: 'users' | 'upload' | 'api' | 'rawdata' | 'catalog' | 'grundstruktur';
  onTabChange?: (tab: 'users' | 'upload' | 'api' | 'rawdata' | 'catalog' | 'grundstruktur') => void;
  uploadNode?: React.ReactNode;
  onResetCatalog?: () => void;
}) => {
  const [currentTab, setCurrentTab] = useState(activeAdminTab);

  useEffect(() => {
    setCurrentTab(activeAdminTab);
  }, [activeAdminTab]);

  const handleTabSelect = (tab: 'users' | 'upload' | 'api' | 'rawdata' | 'catalog' | 'grundstruktur') => {
    setCurrentTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  const adminTabs = [
    { id: 'users', label: 'Användare & Roller', icon: Users, desc: 'Roller & inbjudningar' },
    { id: 'upload', label: 'Ladda upp mätdata', icon: Upload, desc: 'CSV & manuella värden' },
    { id: 'api', label: 'API & POST-synk', icon: Send, desc: 'REST POST endpoint & synk' },
    { id: 'rawdata', label: 'Rådata Export', icon: FileSpreadsheet, desc: 'Export & inspektion' },
    { id: 'catalog', label: 'Produktkatalog & Merge', icon: Database, desc: 'Grundkatalog & mappning' },
    { id: 'grundstruktur', label: 'Inera Grundstruktur', icon: Layers, desc: 'Tåg, team & produkter' },
  ];

  const [usersSubView, setUsersSubView] = useState<'users' | 'invitations'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals state
  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  const [userToEditName, setUserToEditName] = useState<any | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  const [userToEditRole, setUserToEditRole] = useState<any | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<UserRole>('viewer');
  const [isSavingRole, setIsSavingRole] = useState(false);

  const [userToChangePassword, setUserToChangePassword] = useState<any | null>(null);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [forceChangeOnLogin, setForceChangeOnLogin] = useState(true);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  // Invitation creation modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('viewer');
  const [inviteCode, setInviteCode] = useState('');
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let rand = '';
    for (let i = 0; i < 5; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `INERA-UX-${rand}`;
  };

  const openNewInviteModal = () => {
    setInviteName('');
    setInviteEmail('');
    setInviteRole('viewer');
    setInviteCode(generateRandomCode());
    setIsInviteModalOpen(true);
  };

  const fetchUsersAndInvitations = async () => {
    setLoading(true);
    try {
      const qUsers = collection(db, 'users');
      const snapUsers = await getDocs(qUsers);
      const userList = snapUsers.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(userList);

      const qInv = collection(db, 'invitations');
      const snapInv = await getDocs(qInv);
      const invList = snapInv.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
      // Sort newest first
      invList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setInvitations(invList);
    } catch(err: any) {
      setError(err.message || 'Kunde inte hämta användardata');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsersAndInvitations();
  }, []);

  const isProtectedAdmin = (email?: string) => {
    if (!email) return false;
    const lower = email.toLowerCase();
    return lower === 'andreas.l.melin@gmail.com' || lower === 'andreas.melin@inera.se';
  };

  const toggleBlock = async (userId: string, currentStatus: boolean, userEmail?: string) => {
    if (isProtectedAdmin(userEmail)) {
      setError('Huvudadministratören kan inte blockeras.');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', userId), {
        isBlocked: !currentStatus
      });
      fetchUsersAndInvitations();
    } catch(err: any) {
      setError(err.message || 'Kunde inte blockera/avblockera användare');
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    if (isProtectedAdmin(userToDelete.email)) {
      setError('Huvudadministratören kan inte raderas.');
      setUserToDelete(null);
      return;
    }
    setIsDeletingUser(true);
    try {
      await deleteDoc(doc(db, 'users', userToDelete.id));
      setUserToDelete(null);
      await fetchUsersAndInvitations();
      setSuccessMsg('Användaren raderades permanent.');
      setTimeout(() => setSuccessMsg(''), 4000);
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
      await fetchUsersAndInvitations();
    } catch (err: any) {
      setError(err.message || 'Kunde inte uppdatera namnet');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSaveRole = async () => {
    if (!userToEditRole) return;
    if (isProtectedAdmin(userToEditRole.email) && selectedNewRole !== 'admin') {
      setError('Huvudadministratören måste alltid ha rollen Administratör.');
      setUserToEditRole(null);
      return;
    }
    setIsSavingRole(true);
    setError('');
    try {
      await updateDoc(doc(db, 'users', userToEditRole.id), {
        role: selectedNewRole
      });
      setSuccessMsg(`Rollen ändrades till ${selectedNewRole === 'admin' ? 'Administratör' : selectedNewRole === 'editor' ? 'Redaktör' : 'Läsbehörig'} för ${userToEditRole.displayName || userToEditRole.email}`);
      setTimeout(() => setSuccessMsg(''), 4000);
      setUserToEditRole(null);
      await fetchUsersAndInvitations();
    } catch (err: any) {
      setError(err.message || 'Kunde inte ändra roll');
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setError('Inbjudningskod krävs.');
      return;
    }
    setIsCreatingInvite(true);
    setError('');
    try {
      const cleanCode = inviteCode.trim();
      // Check if code already exists in invitations
      const q = query(collection(db, 'invitations'), where('code', '==', cleanCode));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setError('En inbjudan med denna kod finns redan. Välj en annan kod.');
        setIsCreatingInvite(false);
        return;
      }

      await addDoc(collection(db, 'invitations'), {
        code: cleanCode,
        name: inviteName.trim() || undefined,
        email: inviteEmail.trim().toLowerCase() || undefined,
        role: inviteRole,
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.email || 'admin'
      });

      setSuccessMsg(`Inbjudan skapad med koden ${cleanCode}!`);
      setTimeout(() => setSuccessMsg(''), 5000);
      setIsInviteModalOpen(false);
      await fetchUsersAndInvitations();
    } catch (err: any) {
      setError(err.message || 'Kunde inte skapa inbjudan');
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleDeleteInvitation = async (invId: string) => {
    if (!confirm('Är du säker på att du vill återkalla/radera denna inbjudan?')) return;
    try {
      await deleteDoc(doc(db, 'invitations', invId));
      setSuccessMsg('Inbjudan har tagits bort.');
      setTimeout(() => setSuccessMsg(''), 4000);
      await fetchUsersAndInvitations();
    } catch (err: any) {
      setError(err.message || 'Kunde inte radera inbjudan');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2500);
  };

  const handleSavePasswordChange = async () => {
    if (!userToChangePassword) return;
    setIsSavingPassword(true);
    setPwdError('');
    setPwdSuccess('');
    try {
      if (adminNewPassword) {
        if (adminNewPassword.length < 6) {
          setPwdError('Lösenordet måste vara minst 6 tecken.');
          setIsSavingPassword(false);
          return;
        }

        const token = await auth.currentUser?.getIdToken();
        let response;
        try {
          response = await fetch('/api/admin/change-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              uid: userToChangePassword.id,
              newPassword: adminNewPassword,
              forceChangeOnLogin: forceChangeOnLogin
            })
          });
        } catch (fetchErr: any) {
          throw new Error('Kunde inte nå backend-servern. Använd istället "Skicka länk för lösenordsåterställning".');
        }

        let resData: any = {};
        if (response) {
          const responseText = await response.text();
          try {
            resData = JSON.parse(responseText);
          } catch (jsonErr) {
            throw new Error('Kunde inte läsa svar från servern. Använd istället "Skicka länk för lösenordsåterställning".');
          }

          if (!response.ok) {
            throw new Error(resData.error || 'Misslyckades att ändra lösenordet via backend.');
          }
        } else {
          throw new Error('Inget svar från servern.');
        }
      } else {
        await updateDoc(doc(db, 'users', userToChangePassword.id), {
          mustChangePassword: forceChangeOnLogin,
          passwordChangedByAdminAt: serverTimestamp()
        });
      }

      setPwdSuccess(`Lösenordsinställningarna har sparats för ${userToChangePassword.displayName || userToChangePassword.email}!`);
      setAdminNewPassword('');
      await fetchUsersAndInvitations();
    } catch (err: any) {
      setPwdError(err.message || 'Kunde inte uppdatera lösenordet');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSendResetEmail = async (targetEmail: string) => {
    setPwdError('');
    setPwdSuccess('');
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      setPwdSuccess(`En länk för lösenordsåterställning har skickats till ${targetEmail}!`);
    } catch (err: any) {
      setPwdError(err.message || 'Kunde inte skicka återställningslänk');
    }
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin text-inera-primary-40 mx-auto" size={32} /></div>;

  return (
    <div className="space-y-6">
      {/* Admin Sub-navigation Tab Bar */}
      <div className="bg-white border border-inera-secondary-90 rounded-2xl p-2 shadow-xs mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {adminTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabSelect(tab.id as any)}
                className={cn(
                  "flex flex-col items-center text-center p-3 rounded-xl transition-all border",
                  isActive
                    ? "bg-inera-primary-40 text-white border-inera-primary-40 shadow-sm"
                    : "bg-inera-secondary-95/40 text-inera-neutral-20 border-inera-secondary-90/60 hover:bg-inera-secondary-95 hover:border-inera-secondary-90"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={18} className={isActive ? "text-white" : "text-inera-primary-40"} />
                  <span className="text-xs font-bold whitespace-nowrap">{tab.label}</span>
                </div>
                <span className={cn(
                  "text-[10px] hidden sm:block",
                  isActive ? "text-white/80" : "text-inera-neutral-40"
                )}>
                  {tab.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {currentTab === 'users' && (
          <motion.div
            key="users"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="card p-6 shadow-md border-inera-secondary-90 bg-white"
          >
            {/* Header & Sub navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-inera-secondary-90">
              <div>
                <h2 className="text-xl font-bold font-display text-inera-neutral-10">Användar- & Behörighetshantering</h2>
                <p className="text-xs text-inera-neutral-40">Hantera roller (Admin, Editor, Viewer), redigera visningsnamn och bjud in nya medarbetare.</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={openNewInviteModal}
                  className="btn btn--s btn--primary flex items-center gap-2 shrink-0"
                >
                  <UserPlus size={16} />
                  <span>Bjud in användare</span>
                </button>
              </div>
            </div>

            {/* Sub-view toggle tabs */}
            <div className="flex items-center gap-2 mb-6 border-b border-inera-secondary-90 pb-2">
              <button
                type="button"
                onClick={() => setUsersSubView('users')}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2",
                  usersSubView === 'users' 
                    ? "bg-inera-primary-40 text-white shadow-xs" 
                    : "text-inera-neutral-30 hover:bg-inera-secondary-95"
                )}
              >
                <Users size={14} />
                <span>Användare ({users.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setUsersSubView('invitations')}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2",
                  usersSubView === 'invitations' 
                    ? "bg-inera-primary-40 text-white shadow-xs" 
                    : "text-inera-neutral-30 hover:bg-inera-secondary-95"
                )}
              >
                <Key size={14} />
                <span>Inbjudningskoder ({invitations.length})</span>
              </button>
            </div>

            {error && <div className="text-inera-error-40 mb-4 bg-inera-error-95 border-inera-error-40 border p-4 rounded-lg text-sm">{error}</div>}
            {successMsg && <div className="text-inera-success-40 mb-4 bg-inera-success-95 border-inera-success-40 border p-4 rounded-lg flex items-center gap-2 text-sm"><CheckCircle2 size={18} /><span>{successMsg}</span></div>}
            
            {usersSubView === 'users' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[760px]">
                  <thead>
                    <tr className="border-b border-inera-secondary-90 text-xs font-bold text-inera-neutral-40 uppercase tracking-wider">
                      <th className="pb-3 px-2">Visningsnamn</th>
                      <th className="pb-3 px-2">E-postadress</th>
                      <th className="pb-3 px-2">Roll & Behörighet</th>
                      <th className="pb-3 px-2">Senast inloggad</th>
                      <th className="pb-3 px-2">Status</th>
                      <th className="pb-3 px-2 text-right">Åtgärder</th>
                    </tr>
                  </thead>
                  <motion.tbody layout>
                    <AnimatePresence mode="popLayout">
                    {users.map((u) => {
                      const isMainAdmin = isProtectedAdmin(u.email);
                      const currentRole: UserRole = isMainAdmin ? 'admin' : (u.role || 'viewer');

                      return (
                        <motion.tr 
                          key={u.id} 
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-b border-inera-secondary-95 last:border-0 hover:bg-inera-secondary-95/50 text-sm"
                        >
                          <td className="py-3 px-2 font-medium text-inera-neutral-10">
                            <div className="flex items-center gap-2">
                              <span>{u.displayName || 'Ej angivet'}</span>
                              <button
                                onClick={() => {
                                  setUserToEditName(u);
                                  setEditDisplayName(u.displayName || '');
                                }}
                                className="text-inera-neutral-40 hover:text-inera-primary-40 p-1 rounded hover:bg-inera-secondary-90 transition-colors"
                                title="Redigera visningsnamn"
                              >
                                <Edit3 size={14} />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-inera-neutral-20">
                            <div className="flex items-center gap-1.5">
                              <span>{u.email}</span>
                              {isMainAdmin && (
                                <span className="text-[10px] bg-inera-primary-40/10 text-inera-primary-40 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider" title="Huvudadministratör - Kan inte tas bort">
                                  Huvudadministratör
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "px-2.5 py-0.5 rounded-full text-xs font-bold border",
                                currentRole === 'admin' 
                                  ? "bg-inera-primary-40/10 text-inera-primary-40 border-inera-primary-40/30"
                                  : currentRole === 'editor'
                                  ? "bg-inera-accent-40/10 text-inera-accent-40 border-inera-accent-40/30"
                                  : "bg-inera-secondary-90 text-inera-neutral-30 border-inera-secondary-90"
                              )}>
                                {currentRole === 'admin' ? 'Administratör' : currentRole === 'editor' ? 'Redaktör' : 'Läsbehörig'}
                              </span>

                              {!isMainAdmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUserToEditRole(u);
                                    setSelectedNewRole(currentRole);
                                  }}
                                  className="text-inera-neutral-40 hover:text-inera-primary-40 p-1 rounded hover:bg-inera-secondary-90 transition-colors"
                                  title="Ändra roll och behörighet"
                                >
                                  <UserCog size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-xs text-inera-neutral-40">
                            {u.lastLoggedIn ? format(u.lastLoggedIn.toDate ? u.lastLoggedIn.toDate() : new Date(u.lastLoggedIn.seconds * 1000), 'yyyy-MM-dd HH:mm') : 'Aldrig'}
                          </td>
                          <td className="py-3 px-2">
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
                          <td className="py-3 px-2 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
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
                                Lösenord
                              </button>
                              
                              {!isMainAdmin && (
                                <>
                                  <button 
                                    onClick={() => toggleBlock(u.id, !!u.isBlocked, u.email)}
                                    className={cn("btn btn--xs", u.isBlocked ? "btn--secondary" : "btn--tertiary")}
                                    title={u.isBlocked ? "Avblockera konto" : "Blockera konto"}
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
                                </>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                    </AnimatePresence>
                  </motion.tbody>
                </table>
              </div>
            ) : (
              /* Invitations Table */
              <div className="overflow-x-auto">
                {invitations.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-inera-secondary-90 rounded-xl">
                    <Key size={32} className="mx-auto text-inera-neutral-40 mb-3" />
                    <p className="text-inera-neutral-30 font-medium mb-1">Inga skapade inbjudningar</p>
                    <p className="text-xs text-inera-neutral-40 mb-4">Skapa en inbjudningskod för att bjuda in nya användare med specifik behörighet.</p>
                    <button type="button" onClick={openNewInviteModal} className="btn btn--s btn--primary">
                      Bjud in användare
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[760px]">
                    <thead>
                      <tr className="border-b border-inera-secondary-90 text-xs font-bold text-inera-neutral-40 uppercase tracking-wider">
                        <th className="pb-3 px-2">Inbjudningskod</th>
                        <th className="pb-3 px-2">Mottagare & E-post</th>
                        <th className="pb-3 px-2">Tilldelad Roll</th>
                        <th className="pb-3 px-2">Skapad datum</th>
                        <th className="pb-3 px-2">Status</th>
                        <th className="pb-3 px-2 text-right">Åtgärder</th>
                      </tr>
                    </thead>
                    <motion.tbody layout>
                      <AnimatePresence mode="popLayout">
                      {invitations.map((inv) => {
                        const regLink = typeof window !== 'undefined' ? `${window.location.origin}?invite=${encodeURIComponent(inv.code)}` : `?invite=${inv.code}`;
                        return (
                          <motion.tr 
                            key={inv.id} 
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-b border-inera-secondary-95 last:border-0 hover:bg-inera-secondary-95/50 text-sm"
                          >
                            <td className="py-3 px-2 font-mono font-bold text-inera-primary-40">
                              <div className="flex items-center gap-2">
                                <span className="bg-inera-secondary-95 px-2 py-0.5 rounded border border-inera-secondary-90">{inv.code}</span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(inv.code, `code-${inv.id}`)}
                                  className="text-inera-neutral-40 hover:text-inera-primary-40 p-1 rounded hover:bg-inera-secondary-90 transition-colors"
                                  title="Kopiera inbjudningskod"
                                >
                                  {copiedCodeId === `code-${inv.id}` ? <Check size={14} className="text-inera-success-40" /> : <Copy size={14} />}
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-inera-neutral-20">
                              <div className="leading-tight">
                                <div className="font-medium text-inera-neutral-10">{inv.name || 'Öppen för alla'}</div>
                                {inv.email && <div className="text-xs text-inera-neutral-40">{inv.email}</div>}
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <span className={cn(
                                "px-2.5 py-0.5 rounded-full text-xs font-bold border",
                                inv.role === 'admin' 
                                  ? "bg-inera-primary-40/10 text-inera-primary-40 border-inera-primary-40/30"
                                  : inv.role === 'editor'
                                  ? "bg-inera-accent-40/10 text-inera-accent-40 border-inera-accent-40/30"
                                  : "bg-inera-secondary-90 text-inera-neutral-30 border-inera-secondary-90"
                              )}>
                                {inv.role === 'admin' ? 'Administratör' : inv.role === 'editor' ? 'Redaktör' : 'Läsbehörig'}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-xs text-inera-neutral-40">
                              {inv.createdAt ? format(new Date(inv.createdAt), 'yyyy-MM-dd HH:mm') : '-'}
                            </td>
                            <td className="py-3 px-2">
                              {inv.status === 'used' ? (
                                <span className="bg-inera-secondary-90 text-inera-neutral-40 px-2 py-0.5 rounded text-xs font-bold uppercase border border-inera-secondary-90">Använd</span>
                              ) : (
                                <span className="bg-inera-success-95 text-inera-success-50 px-2 py-0.5 rounded text-xs font-bold uppercase border border-inera-success-40">Aktiv</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(regLink, `link-${inv.id}`)}
                                  className="btn btn--xs btn--secondary flex items-center gap-1"
                                  title="Kopiera direktlänk för registrering"
                                >
                                  {copiedCodeId === `link-${inv.id}` ? <Check size={12} className="text-inera-success-40" /> : <ExternalLink size={12} />}
                                  {copiedCodeId === `link-${inv.id}` ? 'Kopierad länk' : 'Kopiera länk'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteInvitation(inv.id)}
                                  className="btn btn--xs btn--destructive flex items-center gap-1"
                                  title="Ta bort inbjudan"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                      </AnimatePresence>
                    </motion.tbody>
                  </table>
                )}
              </div>
            )}

            {/* Invite User Modal */}
            {isInviteModalOpen && (
              <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="card p-6 shadow-xl max-w-md w-full border-inera-secondary-90 bg-white space-y-4"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-inera-secondary-90">
                    <div className="flex items-center gap-3 text-inera-primary-40">
                      <UserPlus size={22} />
                      <h3 className="text-lg font-bold font-display text-inera-neutral-10">Bjud in användare</h3>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setIsInviteModalOpen(false)}
                      className="text-inera-neutral-40 hover:text-inera-neutral-10 p-1.5 rounded-lg hover:bg-inera-secondary-95"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <p className="text-xs text-inera-neutral-40">
                    Ange uppgifter för den nya användaren. När användaren registrerar sig med inbjudningskoden väljer hen sitt eget lösenord och får vald behörighet.
                  </p>

                  <form onSubmit={handleCreateInvitation} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-inera-neutral-30">Namn (valfritt)</label>
                      <input
                        type="text"
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        placeholder="t.ex. Karin Lindberg"
                        className="input w-full text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-inera-neutral-30">E-postadress (valfritt för att låsa till specifik adress)</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="karin.lindberg@inera.se"
                        className="input w-full text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-inera-neutral-30">Roll & Behörighet</label>
                      <div className="space-y-2">
                        <label className={cn(
                          "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                          inviteRole === 'viewer' ? "border-inera-primary-40 bg-inera-primary-40/5" : "border-inera-secondary-90 hover:bg-inera-secondary-95"
                        )}>
                          <input 
                            type="radio" 
                            name="inviteRole" 
                            value="viewer"
                            checked={inviteRole === 'viewer'}
                            onChange={() => setInviteRole('viewer')}
                            className="mt-0.5 text-inera-primary-40 focus:ring-inera-primary-40"
                          />
                          <div className="text-xs">
                            <div className="font-bold text-inera-neutral-10">Läsbehörig (Viewer)</div>
                            <div className="text-inera-neutral-40 text-[11px] mt-0.5">Kan granska resultat, SUS-poäng, trender, grafer, svar och kommentarer.</div>
                          </div>
                        </label>

                        <label className={cn(
                          "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                          inviteRole === 'editor' ? "border-inera-accent-40 bg-inera-accent-40/5" : "border-inera-secondary-90 hover:bg-inera-secondary-95"
                        )}>
                          <input 
                            type="radio" 
                            name="inviteRole" 
                            value="editor"
                            checked={inviteRole === 'editor'}
                            onChange={() => setInviteRole('editor')}
                            className="mt-0.5 text-inera-accent-40 focus:ring-inera-accent-40"
                          />
                          <div className="text-xs">
                            <div className="font-bold text-inera-neutral-10">Redaktör (Editor)</div>
                            <div className="text-inera-neutral-40 text-[11px] mt-0.5">Kan skapa och administrera nya SUS-omgångar, ladda upp mätdata och analysera resultat.</div>
                          </div>
                        </label>

                        <label className={cn(
                          "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                          inviteRole === 'admin' ? "border-inera-primary-40 bg-inera-primary-40/5" : "border-inera-secondary-90 hover:bg-inera-secondary-95"
                        )}>
                          <input 
                            type="radio" 
                            name="inviteRole" 
                            value="admin"
                            checked={inviteRole === 'admin'}
                            onChange={() => setInviteRole('admin')}
                            className="mt-0.5 text-inera-primary-40 focus:ring-inera-primary-40"
                          />
                          <div className="text-xs">
                            <div className="font-bold text-inera-neutral-10">Administratör (Admin)</div>
                            <div className="text-inera-neutral-40 text-[11px] mt-0.5">Fullständig tillgång. Kan administrera roller, bjuda in användare, ändra grundstruktur och kataloger.</div>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-inera-neutral-30">Inbjudningskod <span className="text-inera-error-40">*</span></label>
                        <button
                          type="button"
                          onClick={() => setInviteCode(generateRandomCode())}
                          className="text-[11px] font-bold text-inera-primary-40 hover:underline flex items-center gap-1"
                        >
                          <RefreshCw size={11} /> Slumpa ny kod
                        </button>
                      </div>
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        placeholder="INERA-UX-XXXX"
                        className="input w-full font-mono text-sm uppercase"
                        required
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-3 border-t border-inera-secondary-90">
                      <button 
                        type="button" 
                        onClick={() => setIsInviteModalOpen(false)}
                        disabled={isCreatingInvite}
                        className="btn btn--m btn--secondary"
                      >
                        Avbryt
                      </button>
                      <button 
                        type="submit" 
                        disabled={isCreatingInvite || !inviteCode.trim()}
                        className="btn btn--m btn--primary flex items-center gap-2"
                      >
                        {isCreatingInvite ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        Skapa inbjudan
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}

            {/* Edit Role Modal */}
            {userToEditRole && (
              <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="card p-6 shadow-xl max-w-md w-full border-inera-secondary-90 bg-white space-y-4"
                >
                  <div className="flex items-center gap-3 text-inera-primary-40">
                    <UserCog size={22} />
                    <h3 className="text-lg font-bold font-display text-inera-neutral-10">Ändra användarroll</h3>
                  </div>
                  <p className="text-xs text-inera-neutral-40">
                    Välj behörighetsnivå för <strong>{userToEditRole.displayName || userToEditRole.email}</strong> ({userToEditRole.email}).
                  </p>

                  <div className="space-y-2 pt-2">
                    <label className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                      selectedNewRole === 'viewer' ? "border-inera-primary-40 bg-inera-primary-40/5" : "border-inera-secondary-90 hover:bg-inera-secondary-95"
                    )}>
                      <input 
                        type="radio" 
                        name="editRole" 
                        value="viewer"
                        checked={selectedNewRole === 'viewer'}
                        onChange={() => setSelectedNewRole('viewer')}
                        className="mt-0.5 text-inera-primary-40 focus:ring-inera-primary-40"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-inera-neutral-10">Läsbehörig (Viewer)</div>
                        <div className="text-inera-neutral-40 text-[11px] mt-0.5">Kan se resultat, SUS-poäng, grafer, svar och kommentarer.</div>
                      </div>
                    </label>

                    <label className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                      selectedNewRole === 'editor' ? "border-inera-accent-40 bg-inera-accent-40/5" : "border-inera-secondary-90 hover:bg-inera-secondary-95"
                    )}>
                      <input 
                        type="radio" 
                        name="editRole" 
                        value="editor"
                        checked={selectedNewRole === 'editor'}
                        onChange={() => setSelectedNewRole('editor')}
                        className="mt-0.5 text-inera-accent-40 focus:ring-inera-accent-40"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-inera-neutral-10">Redaktör (Editor)</div>
                        <div className="text-inera-neutral-40 text-[11px] mt-0.5">Kan skapa och redigera SUS-omgångar, ladda upp mätningar och analysera alla resultat.</div>
                      </div>
                    </label>

                    <label className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                      selectedNewRole === 'admin' ? "border-inera-primary-40 bg-inera-primary-40/5" : "border-inera-secondary-90 hover:bg-inera-secondary-95"
                    )}>
                      <input 
                        type="radio" 
                        name="editRole" 
                        value="admin"
                        checked={selectedNewRole === 'admin'}
                        onChange={() => setSelectedNewRole('admin')}
                        className="mt-0.5 text-inera-primary-40 focus:ring-inera-primary-40"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-inera-neutral-10">Administratör (Admin)</div>
                        <div className="text-inera-neutral-40 text-[11px] mt-0.5">Fullständig tillgång. Kan administrera roller, bjuda in användare och ändra systeminställningar.</div>
                      </div>
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t border-inera-secondary-90">
                    <button 
                      type="button" 
                      onClick={() => setUserToEditRole(null)}
                      disabled={isSavingRole}
                      className="btn btn--m btn--secondary"
                    >
                      Avbryt
                    </button>
                    <button 
                      type="button" 
                      onClick={handleSaveRole}
                      disabled={isSavingRole}
                      className="btn btn--m btn--primary flex items-center gap-2"
                    >
                      {isSavingRole ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Spara roll
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Edit Name Modal */}
            {userToEditName && (
              <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="card p-6 shadow-xl max-w-md w-full border-inera-secondary-90 bg-white space-y-4"
                >
                  <div className="flex items-center gap-3 text-inera-primary-40">
                    <Edit3 size={22} />
                    <h3 className="text-lg font-bold font-display text-inera-neutral-10">Redigera visningsnamn</h3>
                  </div>
                  <p className="text-xs text-inera-neutral-40">Uppdatera det namn som visas i menyer och rapporter för användaren ({userToEditName.email}).</p>
                  
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
                </motion.div>
              </div>
            )}

            {/* Admin Change Password Modal */}
            {userToChangePassword && (
              <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="card p-6 shadow-xl max-w-md w-full border-inera-secondary-90 bg-white space-y-4"
                >
                  <div className="flex items-center gap-3 text-inera-primary-40">
                    <Key size={22} />
                    <h3 className="text-lg font-bold font-display text-inera-neutral-10">Byt lösenord / Återställning</h3>
                  </div>
                  <p className="text-xs text-inera-neutral-40">
                    Sätt nytt lösenord eller skicka återställningslänk för <strong>{userToChangePassword.displayName || userToChangePassword.email}</strong>.
                  </p>

                  {pwdError && (
                    <div className="text-inera-error-40 text-xs bg-inera-error-95 border border-inera-error-40/30 p-3 rounded-lg font-medium leading-relaxed">
                      {pwdError}
                    </div>
                  )}

                  {pwdSuccess && (
                    <div className="text-inera-success-40 text-xs bg-inera-success-95 border border-inera-success-40/30 p-3 rounded-lg font-medium flex items-start gap-2">
                      <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-inera-success-40" />
                      <div className="space-y-1">
                        <p>{pwdSuccess}</p>
                        <p className="text-[10px] text-inera-success-40/80">Denna ruta kan nu stängas.</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-inera-neutral-30">Nytt lösenord (valfritt / tillfälligt)</label>
                      <input
                        type="password"
                        value={adminNewPassword}
                        onChange={(e) => setAdminNewPassword(e.target.value)}
                        placeholder="Ange ett nytt lösenord..."
                        className="input w-full text-sm"
                        disabled={!!pwdSuccess}
                      />
                    </div>

                    <label className="flex items-center gap-2 text-xs font-bold text-inera-neutral-20 cursor-pointer pt-1">
                      <input 
                        type="checkbox" 
                        checked={forceChangeOnLogin}
                        onChange={(e) => setForceChangeOnLogin(e.target.checked)}
                        className="rounded border-neutral-300 text-inera-primary-40 focus:ring-inera-primary-40"
                        disabled={!!pwdSuccess}
                      />
                      <span>Tvinga användaren att byta lösenord vid nästa inloggning</span>
                    </label>

                    <div className="pt-2 border-t border-inera-secondary-90">
                      <button
                        type="button"
                        onClick={() => handleSendResetEmail(userToChangePassword.email)}
                        className="text-xs font-bold text-inera-primary-40 hover:underline flex items-center gap-1 disabled:opacity-50"
                        disabled={!!pwdSuccess}
                      >
                        <RefreshCw size={12} />
                        Skicka länk för lösenordsåterställning per e-post
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t border-inera-secondary-90">
                    {pwdSuccess ? (
                      <button 
                        onClick={() => {
                          setUserToChangePassword(null);
                          setPwdSuccess('');
                          setPwdError('');
                        }}
                        className="btn btn--m btn--primary w-full sm:w-auto"
                      >
                        Stäng
                      </button>
                    ) : (
                      <>
                        <button 
                          onClick={() => {
                            setUserToChangePassword(null);
                            setPwdSuccess('');
                            setPwdError('');
                          }}
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
                          {isSavingPassword ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              Sparar...
                            </>
                          ) : (
                            <>
                              <Lock size={16} />
                              Spara inställningar
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              </div>
            )}

            {/* Delete User Warning Modal */}
            {userToDelete && (
              <div className="fixed inset-0 bg-inera-neutral-10/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="card p-6 shadow-xl max-w-md w-full border-inera-secondary-90 bg-white space-y-4"
                >
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
                </motion.div>
              </div>
            )}
          </motion.div>
        )}
        
        {currentTab === 'upload' && (
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

        {currentTab === 'api' && (
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
        
        {currentTab === 'rawdata' && (
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

        {currentTab === 'catalog' && (
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

        {currentTab === 'grundstruktur' && (
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

export default AdminView;
