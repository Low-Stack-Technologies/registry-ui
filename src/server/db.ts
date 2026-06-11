import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";

const dataDir = process.env.DATA_DIR ?? "/data";
const dbPath = process.env.DATABASE_PATH ?? join(dataDir, "registry-ui.sqlite");
const keyPath = process.env.APP_KEY_PATH ?? join(dataDir, "app.key");

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'viewer')),
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target TEXT,
  result TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

export type Role = "admin" | "viewer";

export type User = {
  id: number;
  username: string;
  role: Role;
  disabled: 0 | 1;
  created_at: string;
  updated_at: string;
};

type UserRow = User & { password_hash: string };

function getKey() {
  const envSecret = process.env.APP_SECRET;
  if (envSecret) return createHash("sha256").update(envSecret).digest();
  mkdirSync(dirname(keyPath), { recursive: true });
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32).toString("base64"), { mode: 0o600 });
  return Buffer.from(readFileSync(keyPath, "utf8"), "base64");
}

const appKey = getKey();

export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", appKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(value: string) {
  const bytes = Buffer.from(value, "base64");
  const iv = bytes.subarray(0, 12);
  const tag = bytes.subarray(12, 28);
  const encrypted = bytes.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", appKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function getSetting(key: string) {
  const row = db.query("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | null;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.query("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function isSetupComplete() {
  return getSetting("setup.complete") === "true";
}

export function publicUser(user: UserRow): User {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    disabled: user.disabled,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

export function findUserByUsername(username: string) {
  return db.query("SELECT * FROM users WHERE username = ?").get(username) as UserRow | null;
}

export function findUserById(id: number) {
  return db.query("SELECT * FROM users WHERE id = ?").get(id) as UserRow | null;
}

export function listUsers() {
  return (db.query("SELECT * FROM users ORDER BY username").all() as UserRow[]).map(publicUser);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  db.query("INSERT INTO sessions(user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(userId, hashToken(token), expires);
  return { token, expires };
}

export function getSessionUser(token: string | null) {
  if (!token) return null;
  const row = db
    .query(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP AND users.disabled = 0`
    )
    .get(hashToken(token)) as UserRow | null;
  return row ? publicUser(row) : null;
}

export function deleteSession(token: string | null) {
  if (token) db.query("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function audit(userId: number | null, action: string, target: string | null, result: "success" | "failure", message?: string) {
  db.query("INSERT INTO audit_log(user_id, action, target, result, message) VALUES (?, ?, ?, ?, ?)").run(userId, action, target, result, message ?? null);
}

export function auditRows(limit = 100) {
  return db
    .query(
      `SELECT audit_log.*, users.username
       FROM audit_log LEFT JOIN users ON users.id = audit_log.user_id
       ORDER BY audit_log.id DESC LIMIT ?`
    )
    .all(limit);
}

export function registrySettings() {
  const url = getSetting("registry.url");
  const username = getSetting("registry.username");
  const password = getSetting("registry.password");
  const allowHttp = getSetting("registry.allowHttp") === "true";
  if (!url || !username || !password) return null;
  return {
    url,
    username: decrypt(username),
    password: decrypt(password),
    allowHttp
  };
}
