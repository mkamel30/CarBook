import crypto from 'crypto';
import { NextRequest } from 'next/server';

export interface AuthSessionUser {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  guest?: boolean;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return 'carbook_jwt_dev_only_secret';
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString();
}

/**
 * Sign session JWT token
 */
export function signSessionToken(user: AuthSessionUser, expiresInDays = 30): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60;
  const payload = { ...user, exp };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedHeader}.${encodedPayload}.${hmac(`${encodedHeader}.${encodedPayload}`)}`;
}

/**
 * Short-lived bearer token for the device app. The WebView cannot rely on the
 * cookie jar, so the phone authenticates with Authorization: Bearer instead.
 */
export function signAccessToken(user: AuthSessionUser, ttlSeconds = 15 * 60): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = { ...user, guest: user.guest === true, exp };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedHeader}.${encodedPayload}.${hmac(`${encodedHeader}.${encodedPayload}`)}`;
}

function hmac(data: string): string {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Verify session JWT token
 */
export function verifySessionToken(token: string): AuthSessionUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    if (signature !== hmac(`${encodedHeader}.${encodedPayload}`)) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      picture: payload.picture || null,
      ...(payload.guest === true ? { guest: true } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Extract authenticated user from a NextRequest.
 * Accepts the browser cookie session and the device bearer token.
 */
export function getAuthenticatedUser(req: NextRequest): AuthSessionUser | null {
  const bearer = req.headers.get('authorization');
  if (bearer?.toLowerCase().startsWith('bearer ')) {
    return verifySessionToken(bearer.slice(7).trim());
  }
  const token = req.cookies.get('carbook_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Get dynamic OAuth Redirect URI based on request host
 */
export function getGoogleRedirectUri(req: NextRequest): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3070';
  const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}/api/auth/callback/google`;
}
