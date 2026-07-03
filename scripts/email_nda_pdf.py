#!/usr/bin/env python3
"""Generate a signed-NDA PDF and email it to the founder.

Pulls an NDA signature record captured by the storydoc (POST /api/nda),
renders it as a one-page acknowledgment form — signer details plus the
drawn signature image — and emails the PDF as an attachment.

Data sources (pick one):
  * Local SQLite file written in dev:      data/signatures.sqlite   (default)
  * The deployed API (Vercel + Turso):     --api-url https://<app>.vercel.app
                                           plus NDA_ADMIN_KEY (env or --admin-key)

Examples:
  # Latest signature from the local dev database → PDF only (no email)
  python scripts/email_nda_pdf.py --no-email

  # Signature id 3 from the deployed app, emailed to the default recipient
  NDA_ADMIN_KEY=... SMTP_HOST=smtp.gmail.com SMTP_USER=me@example.com SMTP_PASS=... \
      python scripts/email_nda_pdf.py --api-url https://jetsetterpro.vercel.app --id 3

SMTP configuration comes from the environment:
  SMTP_HOST (required to send), SMTP_PORT (default 587),
  SMTP_USER / SMTP_PASS (optional — omit for an open relay),
  SMTP_FROM (default: SMTP_USER), SMTP_SSL=1 to use implicit TLS instead
  of STARTTLS.

Dependencies: reportlab (pip install -r scripts/requirements.txt).
"""

import argparse
import base64
import io
import json
import os
import smtplib
import sqlite3
import sys
import urllib.request
from email.message import EmailMessage
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

DEFAULT_RECIPIENT = "jamil@trainovations.com"
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = REPO_ROOT / "data" / "signatures.sqlite"

FIELDS = (
    "id", "full_name", "email", "company", "title", "typed_signature",
    "signature_png", "doc_version", "ip", "user_agent", "signed_at",
)


# --------------------------------------------------------------------------
# Data access
# --------------------------------------------------------------------------

def fetch_from_sqlite(db_path, sig_id=None):
    if not Path(db_path).exists():
        sys.exit(f"error: database not found at {db_path} — sign the NDA locally first, "
                 "or use --api-url to pull from the deployed app.")
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        where, args = ("WHERE id = ?", (sig_id,)) if sig_id else ("", ())
        row = con.execute(
            f"SELECT {', '.join(FIELDS)} FROM signatures {where} ORDER BY id DESC LIMIT 1",
            args,
        ).fetchone()
    finally:
        con.close()
    if not row:
        sys.exit("error: no matching signature found in the local database.")
    return dict(row)


def fetch_from_api(api_url, admin_key, sig_id=None):
    if not admin_key:
        sys.exit("error: --api-url requires an admin key (NDA_ADMIN_KEY env var or --admin-key).")
    url = api_url.rstrip("/") + "/api/nda"
    req = urllib.request.Request(url, headers={"x-admin-key": admin_key})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit(f"error: API request failed ({e.code}) — check the URL and admin key.")
    except urllib.error.URLError as e:
        sys.exit(f"error: could not reach {url}: {e.reason}")
    signatures = payload.get("signatures") or []
    if sig_id is not None:
        signatures = [s for s in signatures if s.get("id") == sig_id]
    if not signatures:
        sys.exit("error: no matching signature returned by the API.")
    return signatures[0]  # API returns newest first


# --------------------------------------------------------------------------
# PDF generation
# --------------------------------------------------------------------------

def build_pdf(sig, out_path):
    page_w, page_h = LETTER
    margin = 0.9 * inch
    c = canvas.Canvas(str(out_path), pagesize=LETTER)
    c.setTitle(f"JetsetterPro NDA — {sig.get('full_name', '')}")

    # Header band
    c.setFillColor(colors.HexColor("#0B0E17"))
    c.rect(0, page_h - 1.5 * inch, page_w, 1.5 * inch, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(margin, page_h - 0.85 * inch, "Mutual Non-Disclosure Acknowledgment")
    c.setFont("Helvetica", 11)
    c.setFillColor(colors.HexColor("#8B92A8"))
    c.drawString(margin, page_h - 1.15 * inch,
                 f"JetsetterPro Storydoc · {sig.get('doc_version') or 'JSP-NDA-1.0'}")

    y = page_h - 2.1 * inch

    c.setFillColor(colors.black)
    c.setFont("Helvetica", 10.5)
    intro = (
        "The undersigned acknowledges electronically signing the JetsetterPro",
        "confidentiality agreement presented in the investor storydoc, and agrees to",
        "hold in confidence all non-public material disclosed beyond the NDA gate.",
    )
    for line in intro:
        c.drawString(margin, y, line)
        y -= 15
    y -= 14

    # Signer details table
    rows = (
        ("Full name", sig.get("full_name")),
        ("Email", sig.get("email")),
        ("Company", sig.get("company")),
        ("Title", sig.get("title")),
        ("Typed signature", sig.get("typed_signature")),
        ("Document version", sig.get("doc_version")),
        ("Signed at (UTC)", sig.get("signed_at")),
        ("IP address", sig.get("ip")),
        ("Record ID", sig.get("id")),
    )
    label_w = 1.7 * inch
    row_h = 22
    c.setFont("Helvetica", 10)
    for label, value in rows:
        c.setFillColor(colors.HexColor("#F4F5F9"))
        c.rect(margin, y - 6, page_w - 2 * margin, row_h - 4, stroke=0, fill=1)
        c.setFillColor(colors.HexColor("#5A6072"))
        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin + 8, y, label.upper())
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 10)
        c.drawString(margin + label_w, y, str(value if value not in (None, "") else "—"))
        y -= row_h

    # Drawn signature
    y -= 18
    c.setFillColor(colors.HexColor("#5A6072"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(margin, y, "DRAWN SIGNATURE")
    y -= 8
    box_w, box_h = 3.4 * inch, 1.3 * inch
    png_data_url = sig.get("signature_png") or ""
    prefix = "data:image/png;base64,"
    c.setStrokeColor(colors.HexColor("#C9CDD8"))
    c.rect(margin, y - box_h, box_w, box_h, stroke=1, fill=0)
    if png_data_url.startswith(prefix):
        png_bytes = base64.b64decode(png_data_url[len(prefix):])
        img = ImageReader(io.BytesIO(png_bytes))
        iw, ih = img.getSize()
        scale = min((box_w - 12) / iw, (box_h - 12) / ih)
        w, h = iw * scale, ih * scale
        c.drawImage(img, margin + (box_w - w) / 2, y - box_h + (box_h - h) / 2,
                    width=w, height=h, mask="auto")
    else:
        c.setFillColor(colors.HexColor("#8B92A8"))
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(margin + 10, y - box_h / 2, "(no drawn signature on record)")

    # Footer
    c.setFillColor(colors.HexColor("#8B92A8"))
    c.setFont("Helvetica", 8)
    c.drawString(margin, 0.6 * inch,
                 "© 2026 Trainovate Technologies LLC — Confidential. Generated from the "
                 "storydoc signature database.")
    c.showPage()
    c.save()


# --------------------------------------------------------------------------
# Email
# --------------------------------------------------------------------------

def send_email(pdf_path, sig, recipient):
    host = os.environ.get("SMTP_HOST")
    if not host:
        sys.exit("error: SMTP_HOST is not set — set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS, "
                 "or rerun with --no-email to just generate the PDF.")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    sender = os.environ.get("SMTP_FROM", user or f"nda-bot@{host}")

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = recipient
    msg["Subject"] = (f"Signed NDA — {sig.get('full_name', 'Unknown signer')} "
                      f"({sig.get('company') or 'no company'})")
    msg.set_content(
        f"Attached is the signed JetsetterPro NDA acknowledgment.\n\n"
        f"Signer:  {sig.get('full_name')} <{sig.get('email')}>\n"
        f"Company: {sig.get('company') or '—'} — {sig.get('title') or '—'}\n"
        f"Signed:  {sig.get('signed_at')} (UTC) · {sig.get('doc_version')}\n"
        f"Record:  #{sig.get('id')}\n"
    )
    msg.add_attachment(Path(pdf_path).read_bytes(), maintype="application",
                       subtype="pdf", filename=Path(pdf_path).name)

    if os.environ.get("SMTP_SSL") == "1":
        smtp = smtplib.SMTP_SSL(host, port, timeout=30)
    else:
        smtp = smtplib.SMTP(host, port, timeout=30)
    with smtp:
        if os.environ.get("SMTP_SSL") != "1":
            smtp.ehlo()
            if smtp.has_extn("starttls"):
                smtp.starttls()
                smtp.ehlo()
        if user:
            smtp.login(user, password)
        smtp.send_message(msg)


# --------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(description="Generate a signed-NDA PDF and email it.")
    p.add_argument("--id", type=int, help="signature record id (default: most recent)")
    p.add_argument("--db", default=str(DEFAULT_DB), help="path to local signatures.sqlite")
    p.add_argument("--api-url", help="deployed app base URL (pull via GET /api/nda instead of the local DB)")
    p.add_argument("--admin-key", default=os.environ.get("NDA_ADMIN_KEY"),
                   help="admin key for --api-url (default: NDA_ADMIN_KEY env var)")
    p.add_argument("--to", default=DEFAULT_RECIPIENT, help=f"recipient (default: {DEFAULT_RECIPIENT})")
    p.add_argument("--out", help="output PDF path (default: nda_<id>_<name>.pdf next to this script)")
    p.add_argument("--no-email", action="store_true", help="generate the PDF only, skip sending")
    args = p.parse_args()

    if args.api_url:
        sig = fetch_from_api(args.api_url, args.admin_key, args.id)
    else:
        sig = fetch_from_sqlite(args.db, args.id)

    safe_name = "".join(ch if ch.isalnum() else "_" for ch in (sig.get("full_name") or "signer")).strip("_")
    out_path = Path(args.out) if args.out else Path(__file__).parent / f"nda_{sig.get('id')}_{safe_name}.pdf"
    build_pdf(sig, out_path)
    print(f"PDF written: {out_path}")

    if args.no_email:
        print("--no-email set — skipping send.")
        return
    send_email(out_path, sig, args.to)
    print(f"Emailed to {args.to}.")


if __name__ == "__main__":
    main()
