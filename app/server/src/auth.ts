import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { Role, tiersToArray } from "./types";

const DEFAULT_DEV_SECRET = "dev-secret-change-me";
if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_DEV_SECRET)) {
  throw new Error(
    "JWT_SECRET must be set to a strong, unique value in production (refusing to start with the default dev secret)."
  );
}
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_DEV_SECRET;
const TOKEN_TTL = "7d";
const CHALLENGE_TTL = "5m"; // short-lived 2FA challenge token

export interface JwtPayload {
  sub: string; // user id
  role: Role;
  email: string;
}

// Short-lived token issued after password step when 2FA is required. Carries no
// role: it only authorises the /2fa/verify exchange, never a normal request.
export interface ChallengePayload {
  sub: string; // user id
  twofa: true;
}

export interface AuthedRequest extends Request {
  user?: { id: string; role: Role; email: string };
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function signChallenge(userId: string): string {
  return jwt.sign({ sub: userId, twofa: true } as ChallengePayload, JWT_SECRET, {
    expiresIn: CHALLENGE_TTL,
  });
}

export function verifyChallenge(token: string): ChallengePayload {
  const p = jwt.verify(token, JWT_SECRET) as ChallengePayload;
  if (!p || (p as any).twofa !== true) throw new Error("Not a 2FA challenge token");
  return p;
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false; // passwordless accounts (workers) cannot password-login
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

// Shape a User row for API responses (tiers as array, no passwordHash).
export function publicUser(u: any) {
  if (!u) return u;
  const { passwordHash, tiers, ...rest } = u;
  return { ...rest, tiers: tiersToArray(tiers) };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}

// POST /api/auth/login
export async function login(req: Request, res: Response) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = await verifyPassword(String(password), user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  // 2FA gate: issue a short-lived challenge instead of a full token.
  if (user.totpEnabled) {
    return res.json({ requires2fa: true, challenge: signChallenge(user.id) });
  }

  const token = signToken({ sub: user.id, role: user.role as Role, email: user.email });
  return res.json({ token, user: publicUser(user) });
}

// GET /api/auth/me
export async function me(req: AuthedRequest, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ user: publicUser(user) });
}
