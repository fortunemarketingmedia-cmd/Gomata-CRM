import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Db } from './db.js';

export type UserRole = 'ADMIN' | 'MANAGER' | 'GRE_EXECUTIVE' | 'SALES_EXECUTIVE';
export type AuthUser = { id: number; name: string; email: string; phone: string; role: UserRole };
declare global { namespace Express { interface Request { user?: AuthUser } } }
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export async function createSession(db: Db, userId: number) {
  const token = crypto.randomBytes(32).toString('base64url');
  const days = Math.max(1, Number(process.env.SESSION_DAYS || 7));
  const expires = new Date(Date.now() + days * 86400000);
  await db.query('DELETE FROM sessions WHERE expires_at<=$1', [new Date()]);
  await db.query('INSERT INTO sessions(user_id,token_hash,expires_at) VALUES ($1,$2,$3)', [userId, sha256(token), expires]);
  return { token, expires };
}

export async function deleteSession(db: Db, token?: string) {
  if (token) await db.query('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]);
}

export function authMiddleware(db: Db) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.gomata_session;
      if (!token) return res.status(401).json({ error: 'Authentication required' });
      const result = await db.query<AuthUser>(`SELECT u.id,u.name,u.email,u.phone,u.role FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.active=TRUE`, [sha256(token), new Date()]);
      if (!result.rows[0]) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
      req.user = result.rows[0]; next();
    } catch (error) { next(error); }
  };
}
