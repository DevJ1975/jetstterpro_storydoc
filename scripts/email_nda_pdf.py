#!/usr/bin/env python3
"""Generate the signed JetsetterPro NDA as a PDF and email it to the founder.

Reproduces the full Confidentiality & Non-Disclosure Agreement shown in the
storydoc's NDA gate (app/Storydoc.jsx), filled in with a captured signature
record — recipient details, drawn signature image, and an audit trail — so the
founder has a complete executed copy for their records.

Data sources (pick one):
  * Local SQLite file written in dev:      data/signatures.sqlite   (default)
  * The deployed API (Vercel + Turso):     --api-url https://<app>.vercel.app
                                           plus NDA_ADMIN_KEY (env or --admin-key)

Examples:
  # Latest signature from the local dev database → PDF only (no email)
  python scripts/email_nda_pdf.py --no-email

  # Signature id 3 from the deployed app, emailed to the default recipient
  NDA_ADMIN_KEY=... SMTP_HOST=smtp.gmail.com SMTP_USER=me@example.com SMTP_PASS=... \
      python scripts/email_nda_pdf.py --api-url https://jetstterpro-storydoc.vercel.app --id 3

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
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (HRFlowable, Image, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

DEFAULT_RECIPIENT = "jamil@trainovations.com"
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = REPO_ROOT / "data" / "signatures.sqlite"

FIELDS = (
    "id", "full_name", "email", "company", "title", "typed_signature",
    "signature_png", "doc_version", "ip", "user_agent", "signed_at",
)

# ---------------------------------------------------------------------------
# NDA text — mirrors the agreement presented in the storydoc's NDA gate
# (app/Storydoc.jsx). Keep the two in sync if the terms ever change.
# ---------------------------------------------------------------------------

NDA_TITLE = "Confidentiality & Non-Disclosure Agreement"

NDA_PREAMBLE = (
    'This Confidentiality and Non-Disclosure Agreement (the "Agreement") is '
    'entered into as of the date of electronic signature below (the '
    '"Effective Date") by and between <b>Trainovate Technologies LLC</b>, a '
    'Nevada limited liability company ("Discloser"), and the individual or '
    'entity identified below ("Recipient").'
)

NDA_SECTIONS = (
    ("1. Purpose.",
     'Discloser has developed a mobile travel-technology product known as '
     '"JetSetter Pro." Recipient wishes to review Confidential Information '
     'solely to evaluate a potential investment in, or business relationship '
     'with, Discloser (the "Purpose").'),
    ("2. Confidential Information.",
     '"Confidential Information" means all non-public information disclosed '
     'by Discloser in any form, including product designs, source code, '
     'roadmaps, financial models, unit economics, market analyses, supplier '
     'and API relationships, and the contents of this presentation.'),
    ("3. Obligations.",
     "Recipient shall (a) use Confidential Information solely for the "
     "Purpose; (b) not disclose it to any third party without Discloser's "
     "prior written consent; and (c) protect it with at least the degree of "
     "care used for Recipient's own confidential information, and no less "
     "than reasonable care."),
    ("4. Exclusions.",
     "Confidential Information does not include information that (a) is or "
     "becomes publicly available through no fault of Recipient; (b) was "
     "rightfully known to Recipient before disclosure; (c) is independently "
     "developed without use of Confidential Information; or (d) is rightfully "
     "received from a third party without restriction."),
    ("5. Compelled Disclosure.",
     "Recipient may disclose Confidential Information to the extent required "
     "by law, provided Recipient gives Discloser prompt notice (where lawful) "
     "and reasonable cooperation to seek protective treatment."),
    ("6. No License.",
     "No license, ownership or other intellectual-property right is granted "
     "by this Agreement or by any disclosure."),
    ("7. No Obligation.",
     "Nothing in this Agreement obligates either party to proceed with any "
     "investment or transaction."),
    ("8. Term.",
     "Recipient's obligations survive for three (3) years from the Effective "
     "Date; trade secrets remain protected for as long as they remain trade "
     "secrets under applicable law."),
    ("9. Return or Destruction.",
     "Upon Discloser's written request, Recipient shall promptly return or "
     "destroy all Confidential Information and certify destruction on "
     "request."),
    ("10. Remedies.",
     "Unauthorized disclosure may cause irreparable harm for which monetary "
     "damages are inadequate; Discloser is entitled to seek injunctive relief "
     "in addition to all other remedies at law or in equity."),
    ("11. Governing Law; Venue.",
     "This Agreement is governed by the laws of the State of Nevada, without "
     "regard to conflict-of-laws rules. Exclusive venue lies in the state and "
     "federal courts located in Clark County, Nevada."),
    ("12. Electronic Signature.",
     "Recipient consents to transacting electronically. Recipient's typed "
     "name and drawn signature below constitute a valid electronic signature "
     "under the U.S. E-SIGN Act and Nevada UETA (NRS Chapter 719) and bind "
     "Recipient to this Agreement."),
)


# ---------------------------------------------------------------------------
# Data access
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------

INK = colors.HexColor("#14171F")
MUTED = colors.HexColor("#5A6072")
RULE = colors.HexColor("#C9CDD8")

STYLES = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=17,
                            leading=21, textColor=INK, alignment=TA_CENTER),
    "subtitle": ParagraphStyle("subtitle", fontName="Helvetica", fontSize=9.5,
                               leading=13, textColor=MUTED, alignment=TA_CENTER),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.5,
                           leading=14.5, textColor=INK, spaceAfter=7),
    "label": ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=7.5,
                            leading=10, textColor=MUTED),
    "value": ParagraphStyle("value", fontName="Helvetica", fontSize=10,
                            leading=13, textColor=INK),
    "fine": ParagraphStyle("fine", fontName="Helvetica", fontSize=7.5,
                           leading=10.5, textColor=MUTED),
}


def esc(value):
    text = str(value if value not in (None, "") else "—")
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def signature_flowable(sig, max_w=2.9 * inch, max_h=1.0 * inch):
    """Return an Image flowable of the drawn signature, or a placeholder Paragraph."""
    data_url = sig.get("signature_png") or ""
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        return Paragraph("(no drawn signature on record)", STYLES["fine"])
    png = io.BytesIO(base64.b64decode(data_url[len(prefix):]))
    iw, ih = ImageReader(png).getSize()
    png.seek(0)
    scale = min(max_w / iw, max_h / ih, 1.0)
    return Image(png, width=iw * scale, height=ih * scale)


def build_pdf(sig, out_path):
    doc = SimpleDocTemplate(
        str(out_path), pagesize=LETTER,
        leftMargin=0.95 * inch, rightMargin=0.95 * inch,
        topMargin=0.8 * inch, bottomMargin=0.75 * inch,
        title=f"JetsetterPro NDA — {sig.get('full_name', '')}",
    )

    signed_date = (sig.get("signed_at") or "")[:10]
    story = [
        Paragraph("TRAINOVATE TECHNOLOGIES LLC · JETSETTER PRO", STYLES["subtitle"]),
        Spacer(1, 6),
        Paragraph(NDA_TITLE, STYLES["title"]),
        Spacer(1, 4),
        Paragraph(f"Effective date: {esc(signed_date)} · "
                  f"{esc(sig.get('doc_version') or 'JSP-NDA-1.0')} · "
                  f"Executed electronically via the JetsetterPro storydoc",
                  STYLES["subtitle"]),
        Spacer(1, 10),
        HRFlowable(width="100%", thickness=0.8, color=RULE),
        Spacer(1, 12),
        Paragraph(NDA_PREAMBLE, STYLES["body"]),
    ]
    for heading, text in NDA_SECTIONS:
        story.append(Paragraph(f"<b>{heading}</b> {esc(text)}", STYLES["body"]))

    # Signature block
    story += [Spacer(1, 10),
              HRFlowable(width="100%", thickness=0.8, color=RULE),
              Spacer(1, 12),
              Paragraph("<b>AGREED AND ACCEPTED — RECIPIENT</b>", STYLES["label"]),
              Spacer(1, 8)]

    def cell(label, value):
        return [Paragraph(label.upper(), STYLES["label"]),
                Paragraph(esc(value), STYLES["value"])]

    sig_img = signature_flowable(sig)
    table = Table(
        [
            [[Paragraph("DRAWN SIGNATURE", STYLES["label"]), Spacer(1, 4), sig_img],
             cell("Typed signature", sig.get("typed_signature"))],
            [cell("Full legal name", sig.get("full_name")),
             cell("Title / role", sig.get("title"))],
            [cell("Company / firm", sig.get("company")),
             cell("Email", sig.get("email"))],
            [cell("Date signed (UTC)", sig.get("signed_at")),
             cell("Document version", sig.get("doc_version"))],
        ],
        colWidths=[3.35 * inch, 3.25 * inch],
    )
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    story.append(table)

    # Audit trail
    story += [
        Spacer(1, 14),
        Paragraph(
            f"Audit trail — record #{esc(sig.get('id'))} · IP {esc(sig.get('ip'))} · "
            f"user agent: {esc(sig.get('user_agent'))}", STYLES["fine"]),
        Spacer(1, 4),
        Paragraph("© 2026 Trainovate Technologies LLC — Confidential. Generated from the "
                  "storydoc signature database for Discloser's records.", STYLES["fine"]),
    ]
    doc.build(story)


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

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
        f"Attached is the fully executed JetsetterPro NDA for your records.\n\n"
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


# ---------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(description="Generate the signed NDA as a PDF and email it.")
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
