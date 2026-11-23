/**
 * Cryptographic helpers for local database security:
 * - PBKDF2 with SHA-256 password hashing with individual salts.
 * - AES-256-GCM authenticated encryption for protected at-rest storage in IndexedDB.
 */

const ENCRYPTION_SECRET = "BeyondWords_Academy_Secure_Key_v1";

function getSubtle(): SubtleCrypto {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    return window.crypto.subtle;
  }
  throw new Error("WebCrypto Subtle is not available in this environment.");
}

export function getRandomHex(bytesCount = 16): string {
  const arr = new Uint8Array(bytesCount);
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(arr);
  } else if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytesCount; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const passwordKey = await subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 50_000,
      hash: "SHA-256",
    },
    passwordKey,
    256
  );

  const hashBytes = new Uint8Array(derivedBits);
  return Array.from(hashBytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const computed = await hashPassword(password, salt);
  return computed === expectedHash;
}

/**
 * AES-256-GCM encryption for securing database payloads at rest.
 */
async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const rawKey = enc.encode(secret);
  const hash = await subtle.digest("SHA-256", rawKey);
  return subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptData(data: unknown): Promise<string> {
  const subtle = getSubtle();
  const key = await deriveAesKey(ENCRYPTION_SECRET);
  const iv = new Uint8Array(12);
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(iv);
  } else if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(iv);
  }

  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(data));

  const ciphertext = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    plaintext
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Return base64
  let binary = "";
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i] ?? 0);
  }
  return typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
}

export async function decryptData<T = unknown>(encryptedBase64: string): Promise<T> {
  const subtle = getSubtle();
  const key = await deriveAesKey(ENCRYPTION_SECRET);

  const binary = typeof atob !== "undefined" ? atob(encryptedBase64) : Buffer.from(encryptedBase64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);

  const decrypted = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    ciphertext
  );

  const dec = new TextDecoder();
  const jsonStr = dec.decode(decrypted);
  return JSON.parse(jsonStr) as T;
}
