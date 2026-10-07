const TOKEN_PREFIX = "v1";

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decode(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function isEmailTokenEncryptionConfigured(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  const configured = environment.EMAIL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!configured) return false;
  try {
    return decode(configured).byteLength === 32;
  } catch {
    return false;
  }
}

function getRawKey(): Uint8Array {
  const configured = process.env.EMAIL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!configured) throw new Error("Email token encryption is not configured");
  const bytes = decode(configured);
  if (bytes.byteLength !== 32)
    throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY must be a base64url-encoded 32-byte key");
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  const raw = getRawKey();
  const keyBytes = new Uint8Array(raw.byteLength);
  keyBytes.set(raw);
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptEmailToken(plaintext: string): Promise<string> {
  if (!plaintext) throw new Error("Cannot encrypt an empty email credential");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await getKey(),
    new TextEncoder().encode(plaintext),
  );
  return `${TOKEN_PREFIX}.${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}

export async function decryptEmailToken(envelope: string): Promise<string> {
  const [version, encodedIv, encodedCiphertext, extra] = envelope.split(".");
  if (version !== TOKEN_PREFIX || !encodedIv || !encodedCiphertext || extra)
    throw new Error("Invalid encrypted email credential");
  const decodedIv = decode(encodedIv);
  const iv = new Uint8Array(decodedIv.byteLength);
  iv.set(decodedIv);
  const ciphertext = decode(encodedCiphertext);
  const ciphertextBytes = new Uint8Array(ciphertext.byteLength);
  ciphertextBytes.set(ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    await getKey(),
    ciphertextBytes,
  );
  return new TextDecoder().decode(decrypted);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return encode(new Uint8Array(digest));
}

export function createSecureRandomValue(bytes = 32): string {
  return encode(crypto.getRandomValues(new Uint8Array(bytes)));
}
