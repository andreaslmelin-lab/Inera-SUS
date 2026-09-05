export const ADMIN_EMAILS = [
  'andreas.melin@inera.se',
  'andreas.melin@inera',
  'andreas.l.melin@gmail.com'
];

export const isSystemAdmin = (email?: string | null): boolean => {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  return ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase().trim() === lower);
};
