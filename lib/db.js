import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

let client = null;
let schemaReady = false;

/**
 * Returns a libSQL client.
 * - If TURSO_DATABASE_URL is set (Vercel / production), connects to Turso —
 *   a hosted SQLite database that persists across serverless invocations.
 * - Otherwise falls back to a real SQLite file at data/signatures.sqlite
 *   (local dev, or any host with a persistent disk).
 */
export function db() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  } else {
    // On Vercel (no Turso configured) the project dir is read-only — fall back to /tmp.
    // NOTE: /tmp is per-instance and ephemeral: fine for a demo, but configure Turso
    // (see .env.example) before sharing the link with real investors.
    const dir = process.env.VERCEL ? '/tmp/jsp-data' : path.join(process.cwd(), 'data');
    fs.mkdirSync(dir, { recursive: true });
    client = createClient({ url: 'file:' + path.join(dir, 'signatures.sqlite') });
  }
  return client;
}

export function isFileBacked() {
  return !process.env.TURSO_DATABASE_URL;
}

export function sqliteFilePath() {
  return process.env.VERCEL ? '/tmp/jsp-data/signatures.sqlite' : path.join(process.cwd(), 'data', 'signatures.sqlite');
}

export async function ensureSchema() {
  if (schemaReady) return;
  await db().execute(`
    CREATE TABLE IF NOT EXISTS signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT,
      title TEXT,
      typed_signature TEXT,
      signature_png TEXT,
      doc_version TEXT,
      ip TEXT,
      user_agent TEXT,
      signed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);
  schemaReady = true;
}
