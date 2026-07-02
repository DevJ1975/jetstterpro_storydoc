import { NextResponse } from 'next/server';
import fs from 'node:fs';
import { ensureSchema, db, isFileBacked, sqliteFilePath } from '../../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/nda/export?key=NDA_ADMIN_KEY
 * - Local / disk-backed: downloads the actual SQLite file (data/signatures.sqlite).
 * - Turso-backed (Vercel): falls back to a JSON dump of every row.
 */
export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key') || req.headers.get('x-admin-key');
  if (!process.env.NDA_ADMIN_KEY || key !== process.env.NDA_ADMIN_KEY) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  await ensureSchema();

  if (isFileBacked()) {
    const p = sqliteFilePath();
    if (!fs.existsSync(p)) {
      return NextResponse.json({ ok: false, error: 'No signatures captured yet.' }, { status: 404 });
    }
    const buf = fs.readFileSync(p);
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': 'attachment; filename="jetsetterpro-nda-signatures.sqlite"',
      },
    });
  }

  const rs = await db().execute('SELECT * FROM signatures ORDER BY id DESC');
  return new NextResponse(JSON.stringify({ ok: true, note: 'Turso-backed deployment — JSON dump (use `turso db shell` for raw SQLite).', count: rs.rows.length, signatures: rs.rows }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="jetsetterpro-nda-signatures.json"',
    },
  });
}
