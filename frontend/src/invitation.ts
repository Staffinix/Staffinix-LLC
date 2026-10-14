export const pendingInvitationKey = "invite_token";

export function invitationTokenFromHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, "")).get("token");
}

export function captureInvitationToken(hash: string, storage: Storage): string | null {
  const token = invitationTokenFromHash(hash);
  if (token) storage.setItem(pendingInvitationKey, token);
  return token || storage.getItem(pendingInvitationKey);
}

export function getPendingInvitationToken(storage: Storage): string | null {
  return storage.getItem(pendingInvitationKey);
}

export function clearPendingInvitationToken(storage: Storage): void {
  storage.removeItem(pendingInvitationKey);
}
