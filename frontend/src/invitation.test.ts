import { describe, expect, it } from "vitest";
import { captureInvitationToken, clearPendingInvitationToken, getPendingInvitationToken, invitationTokenFromHash } from "./invitation";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("pending invitation", () => {
  it("captures a private fragment token and restores it after an auth redirect", () => {
    const storage = new MemoryStorage();
    expect(captureInvitationToken("#token=private-token", storage)).toBe("private-token");
    expect(captureInvitationToken("", storage)).toBe("private-token");
  });

  it("does not confuse a Supabase access token with an invitation token", () => {
    expect(invitationTokenFromHash("#access_token=session-token&type=signup")).toBeNull();
  });

  it("clears the token only when acceptance completes", () => {
    const storage = new MemoryStorage();
    storage.setItem("invite_token", "private-token");
    clearPendingInvitationToken(storage);
    expect(getPendingInvitationToken(storage)).toBeNull();
  });
});
