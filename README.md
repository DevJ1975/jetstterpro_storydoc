# JetSetter Pro — Investor Storydoc

A storydoc-style, scroll-animated investor pitch for **JetSetter Pro** (Trainovate Technologies LLC), with a built-in **NDA gate**: visitors see the teaser (hero + problem), then sign — typed name, drawn signature, company, title — to unlock the full pitch. Every signature is captured **server-side into SQLite**.

Built with **Next.js 14 (App Router) + React 18**. No CSS framework — hand-rolled design system in `app/globals.css`.

## Quick start

```bash
npm install
npm run dev
# → http://localhost:3000
```

Signatures are written to a real SQLite file at **`data/signatures.sqlite`** (created on first signature).

## Push to GitHub

From this folder:

```bash
git init
git add -A
git commit -m "JetSetter Pro storydoc pitch — NDA gate + SQLite capture"
git branch -M main
git remote add origin https://github.com/DevJ1975/jetstterpro_storydoc.git
git push -u origin main
```

> If the repo already has commits (e.g. a README created on GitHub), use `git pull origin main --allow-unrelated-histories` before pushing, or `git push -u origin main --force` to overwrite.

## Retrieving captured signatures

Set `NDA_ADMIN_KEY` in `.env` (copy `.env.example` → `.env`). Then:

- **The SQLite file itself** — grab `data/signatures.sqlite` off the server, or download it:
  `GET /api/nda/export?key=YOUR_ADMIN_KEY`
- **JSON list** (includes the drawn signature as a PNG data-URL):
  `GET /api/nda?key=YOUR_ADMIN_KEY`

Each row: `full_name, email, company, title, typed_signature, signature_png, doc_version, ip, user_agent, signed_at`.

The SQLite file is **gitignored** (it contains PII) — it lives on the server only.

## Deploying

- **Any host with a persistent disk** (Railway, Render, Fly.io, a VPS): works as-is — the SQLite file persists in `data/`.
- **Vercel**: the filesystem is ephemeral, so point the same code at [Turso](https://turso.tech) (hosted SQLite, free tier):
  ```bash
  turso db create jetsetterpro-nda
  turso db show jetsetterpro-nda --url      # → TURSO_DATABASE_URL
  turso db tokens create jetsetterpro-nda   # → TURSO_AUTH_TOKEN
  ```
  Set both env vars (plus `NDA_ADMIN_KEY`) in Vercel → Settings → Environment Variables. `/api/nda/export` then returns a JSON dump; use `turso db shell` for raw SQLite.

## Filling in the video intro

The hero has a **founder-video placeholder**: viewers with the link never see it empty — you (the founder) can paste a YouTube / Loom / Vimeo URL (persists in that browser via localStorage) or upload a local clip (session-only preview). For production, replace the placeholder block in `app/Storydoc.jsx` with a hosted `<video>` / embed once the 90-second intro is shot.

## Structure

```
app/
  layout.js          # metadata (noindex — this is a confidential doc)
  globals.css        # design tokens, reveal/parallax/keyframe styles
  page.js            # renders the storydoc
  Storydoc.jsx       # the entire pitch page (client component)
  api/nda/route.js   # POST: record signature · GET: list (admin key)
  api/nda/export/route.js  # download signatures.sqlite (admin key)
lib/db.js            # libSQL client — file-backed SQLite locally, Turso in prod
data/                # signatures.sqlite lands here (gitignored)
public/screens/      # product screenshots
```

## The ask (baked into the page)

**$500,000 for 10%** — $5M implied valuation. Market stats sourced: GBTA BTI 2025 ($1.57T), AirHelp 2025 US Disruption Report (248M disrupted passengers), EC 261/2004 (€250–600/passenger). Modeled figures are marked `[Est.]` / `[Target]` / `[Modeled]` in-page.

---

© 2026 Trainovate Technologies LLC — Confidential.
