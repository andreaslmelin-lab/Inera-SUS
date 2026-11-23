import { auth, sendPasswordResetEmail } from '../firebase';
import { UserRole } from '../types';

export async function requestPasswordResetViaApp(
  email: string
): Promise<{ method: 'smtp' | 'firebase' }> {
  const cleanEmail = email.trim();

  try {
    const res = await fetch('/api/auth/password-reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: cleanEmail }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.error || 'Kunde inte begära lösenordsåterställning.');
    }

    if (data?.handledBy === 'smtp' && data?.success) {
      return { method: 'smtp' };
    }
  } catch (err: any) {
    // If rate-limited or explicit validation error, propagate it
    if (err?.message && (err.message.includes('För många') || err.message.includes('giltig e-postadress'))) {
      throw err;
    }
    // Otherwise fall back safely to Firebase Auth client SDK
  }

  await sendPasswordResetEmail(auth, cleanEmail);
  return { method: 'firebase' };
}

export async function sendInvitationEmailViaSmtp(params: {
  to: string;
  recipientName?: string;
  inviteCode: string;
  role: UserRole;
  registrationUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    return { success: false, error: 'Du måste vara inloggad som administratör.' };
  }

  const res = await fetch('/api/admin/email/send-invitation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    return {
      success: false,
      error: data?.error || 'Kunde inte skicka inbjudningsmejl via SMTP.',
    };
  }

  return { success: true };
}
