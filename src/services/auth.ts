import crypto from 'crypto';

export function hashPassword(password: string): string {
  const salt = 'car_maintenance_salt_local';
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
