import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Dropbox, DropboxAuth } from "dropbox";
import { cookies } from "next/headers";

const REFRESH_COOKIE = "dbx_rt";

export function dropboxEnabled() {
  return Boolean(process.env.DROPBOX_APP_KEY);
}

function cookieKey() {
  const secret = process.env.DROPBOX_COOKIE_SECRET;
  return secret ? createHash("sha256").update(secret).digest() : null;
}

export function encryptCookie(value: string) {
  const key = cookieKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptCookie(value: string) {
  const key = cookieKey();
  if (!key) return null;
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export async function getRefreshToken() {
  if (process.env.DROPBOX_REFRESH_TOKEN) return process.env.DROPBOX_REFRESH_TOKEN;
  if (!cookieKey()) return null;
  try {
    const cookie = (await cookies()).get(REFRESH_COOKIE);
    return cookie ? decryptCookie(cookie.value) : null;
  } catch {
    return null;
  }
}

export function createAuth() {
  const clientId = process.env.DROPBOX_APP_KEY;
  if (!clientId) return null;
  // No clientSecret: the SDK skips code_verifier when one is set, breaking PKCE exchange.
  return new DropboxAuth({ clientId });
}

export async function getDropbox() {
  const refreshToken = await getRefreshToken();
  if (!process.env.DROPBOX_APP_KEY || !process.env.DROPBOX_APP_SECRET || !refreshToken) return null;
  return new Dropbox({
    clientId: process.env.DROPBOX_APP_KEY,
    clientSecret: process.env.DROPBOX_APP_SECRET,
    refreshToken,
  });
}

export function rootPath(path: string) {
  const root = process.env.DROPBOX_ROOT?.replace(/^\/+|\/+$/g, "") ?? "";
  const child = path.replace(/^\/+/, "").replace(/\/+$/g, "");
  return `/${[root, child].filter(Boolean).join("/")}`;
}

function retryStatus(error: unknown) {
  const candidate = error as { status?: number; error?: { status?: number; retry_after?: number } };
  return candidate.status ?? candidate.error?.status;
}

function retryAfter(error: unknown) {
  const candidate = error as { error?: { retry_after?: number } };
  return typeof candidate.error?.retry_after === "number" ? candidate.error.retry_after * 1000 : 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, options: { tries?: number } = {}) {
  const tries = options.tries ?? 4;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const status = retryStatus(error);
      if (attempt >= tries - 1 || !(status === 429 || (status !== undefined && status >= 500))) throw error;
      await sleep(Math.max(retryAfter(error), 100 * 2 ** attempt));
    }
  }
}

export async function getDropboxStatus() {
  const root = rootPath("");
  if (!dropboxEnabled()) return { enabled: false, connected: false, root, lastSync: null } as const;
  const dbx = await getDropbox();
  if (!dbx) return { enabled: true, connected: false, root, lastSync: null } as const;
  try {
    const account = (await withRetry(() => dbx.usersGetCurrentAccount())).result;
    return {
      enabled: true,
      connected: true,
      account: { name: account.name.display_name, email: account.email },
      root,
      lastSync: null,
    };
  } catch (error) {
    return { enabled: true, connected: false, root, lastSync: null, error: (error as Error).message };
  }
}

export { REFRESH_COOKIE };
