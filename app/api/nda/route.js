import { NextResponse } from 'next/server';
import { db, ensureSchema } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_PNG = 400_000; // ~400KB data-URL cap for the drawn signature

/** POST /api/nda — record a signed NDA. Called by the gate on the pitch page. */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const fullName = String(body.fullName || '').trim();
  const email = String(body.email || '').trim();
  const company = String(body.company || '').trim();
  const title = String(body.title || '').trim();
  const typedSignature = String(body.typedSignature || fullName).trim();
  let signaturePng = String(body.signaturePng || '');

  if (!fullName || !email || !company || !title) {
    return NextResponse.json({ ok: false, error: 'All fields are required.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'Invalid email address.' }, { status: 400 });
  }
  if (!signaturePng.startsWith('data:image/png;base64,') || signaturePng.length > MAX_PNG) {
    return NextResponse.json({ ok: false, error: 'A drawn signature is required.' }, { status: 400 });
  }

  const ip =
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '';
  const userAgent = req.headers.get('user-agent') || '';

  try {
    await ensureSchema();
    const res = await db().execute({
      sql: `INSERT INTO signatures
              (full_name, email, company, title, typed_signature, signature_png, doc_version, ip, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [fullName, email, company, title, typedSignature, signaturePng, String(body.docVersion || 'JSP-NDA-1.0'), ip, userAgent],
    });
    return NextResponse.json({ ok: true, id: Number(res.lastInsertRowid) });
  } catch (e) {
    console.error('NDA insert failed:', e);
    return NextResponse.json({ ok: false, error: 'Could not record signature. Try again.' }, { status: 500 });
  }
}

/** GET /api/nda?key=NDA_ADMIN_KEY — list captured signatures (founder only). */
export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key') || req.headers.get('x-admin-key');
  if (!process.env.NDA_ADMIN_KEY || key !== process.env.NDA_ADMIN_KEY) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    await ensureSchema();
    const rs = await db().execute(
      'SELECT id, full_name, email, company, title, typed_signature, signature_png, doc_version, ip, user_agent, signed_at FROM signatures ORDER BY id DESC'
    );
    return NextResponse.json({ ok: true, count: rs.rows.length, signatures: rs.rows });
  } catch (e) {
    console.error('NDA list failed:', e);
    return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
  }
}
