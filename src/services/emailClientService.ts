import { auth, sendPasswordResetEmail } from '../firebase';
import { UserRole } from '../types';

export interface PasswordResetDispatchResult {
  method: 'smtp' | 'firebase';
  fallbackReason?: string;
  missingVars?: string[];
}

export async function requestPasswordResetViaApp(
  email: string
): Promise<PasswordResetDispatchResult> {
  const cleanEmail = email.trim();
  let fallbackReason: string | undefined;
  let missingVars: string[] | undefined;

  try {
    const res = await fetch('/api/auth/password-reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: cleanEmail }),
    });

    const rawText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }

    if (!res.ok) {
      throw new Error(data?.error || 'Kunde inte begära lösenordsåterställning.');
    }

    if (!data) {
      fallbackReason = 'api_unavailable';
    } else if (data.handledBy === 'smtp' && data.success) {
      return { method: 'smtp' };
    } else if (data.reason) {
      fallbackReason = String(data.reason);
      if (Array.isArray(data.missingVars)) {
        missingVars = data.missingVars;
      }
    }
  } catch (err: any) {
    if (
      err?.message &&
      (err.message.includes('För många') ||
        err.message.includes('giltig e-postadress') ||
        err.message.includes('Kunde inte begära'))
    ) {
      throw err;
    }
    fallbackReason = fallbackReason || 'api_unreachable';
  }

  await sendPasswordResetEmail(auth, cleanEmail);
  return { method: 'firebase', fallbackReason, missingVars };
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

  const rawText = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    return {
      success: false,
      error: 'Kunde inte läsa JSON-svar från e-postservern (/api/admin/email/send-invitation). Kontrollera att serverfunktionerna körs.',
    };
  }

  if (!res.ok || !data?.success) {
    return {
      success: false,
      error: data?.error || 'Kunde inte skicka inbjudningsmejl via SMTP.',
    };
  }

  return { success: true };
}
