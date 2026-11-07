// apps/control-api/src/auth.ts
import type { Context, Next } from 'hono';
import { timingSafeEqualString } from '@zalo-baas/crypto';
import type { Env, AuthUser, HonoVariables } from './types.js';

// --- 1. Password Hashing with PBKDF2 ---
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, expectedHashHex] = stored.split(':');
  if (!saltHex || !expectedHashHex) return false;

  const salt = new Uint8Array(
    saltHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  );

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const actualHashHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqualString(actualHashHex, expectedHashHex);
}

// --- 2. JWT Sign & Verify with Web Crypto (HMAC-SHA256) ---
function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

export async function signJwt(
  user: AuthUser,
  secret: string,
  expiresInSeconds: number = 86400 * 7 // 7 days
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ...user,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${headerEncoded}.${payloadEncoded}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));
  const signatureBytes = new Uint8Array(signature);
  let binarySig = '';
  for (let i = 0; i < signatureBytes.length; i++) {
    binarySig += String.fromCharCode(signatureBytes[i]);
  }
  const signatureEncoded = base64UrlEncode(binarySig);

  return `${dataToSign}.${signatureEncoded}`;
}

export async function verifyJwt(token: string, secret: string): Promise<AuthUser | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
  const dataToVerify = `${headerEncoded}.${payloadEncoded}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // Decode signature
  const binarySig = base64UrlDecode(signatureEncoded);
  const signatureBytes = new Uint8Array(binarySig.length);
  for (let i = 0; i < binarySig.length; i++) {
    signatureBytes[i] = binarySig.charCodeAt(i);
  }

  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    enc.encode(dataToVerify)
  );

  if (!isValid) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadEncoded)) as AuthUser & {
      exp?: number;
    };
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }
    return {
      id: payload.id,
      tenant_id: payload.tenant_id,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

// --- 3. Hono Middleware ---
export async function authMiddleware(
  c: Context<{ Bindings: Env; Variables: HonoVariables }>,
  next: Next
) {
  const authHeader = c.req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: Missing or invalid token' }, 401);
  }

  const token = authHeader.slice(7).trim();
  const user = await verifyJwt(token, c.env.JWT_SECRET);
  if (!user) {
    return c.json({ error: 'Unauthorized: Token expired or invalid' }, 401);
  }

  c.set('user', user);
  await next();
}

export function requireRole(allowedRoles: Array<'platform_owner' | 'tenant_admin' | 'tenant_agent'>) {
  return async (
    c: Context<{ Bindings: Env; Variables: HonoVariables }>,
    next: Next
  ) => {
    const user = c.get('user');
    if (!user || !allowedRoles.includes(user.role)) {
      return c.json({ error: 'Forbidden: Insufficient permissions' }, 403);
    }
    await next();
  };
}

