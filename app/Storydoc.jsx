'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* ======================= config ======================= */
const ASK = '$500,000';
const EQUITY = '10%';
const VALUATION = '$5M';
const NDA_VERSION = 'JSP-NDA-1.0';

/* ======================= tiny ui bits ======================= */
const Eyebrow = ({ children }) => (
  <div data-reveal="up" className="eyebrow">{children}</div>
);

const LockIcon = ({ c = '#5B6478' }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="10" width="14" height="10" rx="2.5" stroke={c} strokeWidth="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={c} strokeWidth="2" />
  </svg>
);

const PlaneMark = ({ size = 30, radius = 9 }) => (
  <div style={{ width: size, height: size, borderRadius: radius, background: 'linear-gradient(135deg, #1A72E8, #3A9AF0)', display: 'grid', placeItems: 'center', boxShadow: '0 4px 14px rgba(26,114,232,.45)' }}>
    <svg width={size / 2} height={size / 2} viewBox="0 0 24 24" fill="none">
      <path d="M2.5 12.2 21.5 2.6 15 21.4l-3.6-7.2-8.9-2z" fill="#EAF4FF" />
    </svg>
  </div>
);

/* ======================= page ======================= */
export default function Storydoc() {
  const [booted, setBooted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [vid, setVid] = useState({ kind: '', url: '', embed: '' });

  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const companyRef = useRef(null);
  const titleRef = useRef(null);
  const vidLinkRef = useRef(null);
  const progressRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawnRef = useRef(false);

  /* ---------- boot: local unlock flag + saved video embed ---------- */
  useEffect(() => {
    let signed = false, savedEmbed = '';
    try {
      signed = localStorage.getItem('jsp_nda_signed') === '1';
      savedEmbed = localStorage.getItem('jsp_intro_video') || '';
    } catch {}
    setLocked(!signed);
    if (savedEmbed) setVid({ kind: 'embed', url: '', embed: savedEmbed });
    setBooted(true);
  }, []);

  /* ---------- cinematic fx: reveals, counters, parallax, progress ---------- */
  useEffect(() => {
    if (!booted) return;

    const runCount = (el) => {
      const target = parseFloat(el.getAttribute('data-count') || '0');
      const dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
      const prefix = el.getAttribute('data-prefix') || '';
      const suffix = el.getAttribute('data-suffix') || '';
      const dur = 1500;
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        let v = (target * e).toFixed(dec);
        if (target >= 100 && dec === 0) v = Math.round(target * e).toLocaleString('en-US');
        el.textContent = prefix + v + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target;
          io.unobserve(el);
          const delay = parseInt(el.getAttribute('data-delay') || '0', 10);
          if (el.hasAttribute('data-count')) { runCount(el); return; }
          setTimeout(() => el.classList.add('in'), delay);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );
    document.querySelectorAll('[data-reveal], .fillbar, [data-count]').forEach((el) => io.observe(el));

    const pxEls = Array.from(document.querySelectorAll('[data-parallax]'));
    let raf = 0;
    const paint = () => {
      raf = 0;
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      if (progressRef.current) progressRef.current.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
      const vh = window.innerHeight;
      pxEls.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const sp = parseFloat(el.getAttribute('data-parallax')) || 0.08;
        const off = (r.top + r.height / 2 - vh / 2) * -sp;
        el.style.transform = 'translate3d(0,' + off.toFixed(1) + 'px,0)';
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    paint();

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [booted, locked]);

  /* ---------- nav ---------- */
  const navGo = useCallback((id) => {
    if (id === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    let el = document.getElementById(id);
    if (!el) el = document.getElementById('nda') || document.getElementById('problem');
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 66, behavior: 'smooth' });
  }, []);

  /* ---------- signature canvas ---------- */
  const initCanvas = useCallback((el) => {
    canvasRef.current = el;
    if (!el || el._init) return;
    el._init = 1;
    const d = window.devicePixelRatio || 1;
    const r = el.getBoundingClientRect();
    el.width = Math.max(1, r.width * d);
    el.height = Math.max(1, r.height * d);
    const c = el.getContext('2d');
    c.scale(d, d);
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = '#DCE6F5';
    ctxRef.current = c;
    let drawing = false, lx = 0, ly = 0;
    const pos = (e) => {
      const b = el.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drawing = true;
      try { el.setPointerCapture(e.pointerId); } catch {}
      const p = pos(e); lx = p[0]; ly = p[1];
      c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 0.1, ly + 0.1); c.stroke();
      drawnRef.current = true;
    });
    el.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e);
      c.beginPath(); c.moveTo(lx, ly); c.lineTo(p[0], p[1]); c.stroke();
      lx = p[0]; ly = p[1];
    });
    const stop = () => { drawing = false; };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
  }, []);

  const clearSig = () => {
    const el = canvasRef.current, c = ctxRef.current;
    if (el && c) { c.clearRect(0, 0, el.width, el.height); drawnRef.current = false; }
  };

  /* ---------- sign & unlock (server-side capture) ---------- */
  const sign = async () => {
    if (busy) return;
    const val = (r) => ((r.current && r.current.value) || '').trim();
    const fullName = val(nameRef), email = val(emailRef), company = val(companyRef), title = val(titleRef);
    if (!fullName || !company || !title) { setErr('Please complete every field — name, email, company and title.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr('Please enter a valid email address.'); return; }
    if (!drawnRef.current) { setErr('Please draw your signature in the box.'); return; }
    let signaturePng = '';
    try { signaturePng = canvasRef.current.toDataURL('image/png'); } catch {}

    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/nda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, company, title, typedSignature: fullName, signaturePng, docVersion: NDA_VERSION }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setErr(data.error || 'Could not record your signature — please try again.'); setBusy(false); return; }
    } catch {
      setErr('Network error — please try again.');
      setBusy(false);
      return;
    }
    try { localStorage.setItem('jsp_nda_signed', '1'); } catch {}
    setBusy(false);
    setLocked(false);
    setTimeout(() => {
      const el = document.getElementById('solution');
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 66, behavior: 'smooth' });
    }, 350);
  };

  const relock = () => {
    try { localStorage.removeItem('jsp_nda_signed'); } catch {}
    drawnRef.current = false;
    setLocked(true);
    setErr('');
    setTimeout(() => navGo('nda'), 250);
  };

  /* ---------- video placeholder ---------- */
  const embedFor = (url) => {
    let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1];
    m = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
    if (m) return 'https://www.loom.com/embed/' + m[1];
    m = url.match(/vimeo\.com\/(\d+)/);
    if (m) return 'https://player.vimeo.com/video/' + m[1];
    if (/^https?:\/\//.test(url)) return url;
    return '';
  };
  const setVideoLink = () => {
    const raw = ((vidLinkRef.current && vidLinkRef.current.value) || '').trim();
    const emb = embedFor(raw);
    if (!emb) return;
    try { localStorage.setItem('jsp_intro_video', emb); } catch {}
    setVid({ kind: 'embed', url: '', embed: emb });
  };
  const onVidFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setVid({ kind: 'file', url: URL.createObjectURL(f), embed: '' });
  };
  const removeVideo = () => {
    try { localStorage.removeItem('jsp_intro_video'); } catch {}
    if (vidLinkRef.current) vidLinkRef.current.value = '';
    setVid({ kind: '', url: '', embed: '' });
  };

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const showLocked = booted && locked;
  const showUnlocked = !booted || !locked;

  /* ======================= render ======================= */
  return (
    <div style={{ position: 'relative', overflowX: 'clip', minHeight: '100vh' }}>
      {/* scroll progress */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 90, background: 'rgba(22,25,41,.6)' }}>
        <div ref={progressRef} style={{ height: '100%', width: '0%', background: 'linear-gradient(90deg, #1A72E8, #5BBAFF, #3A9AF0)' }} />
      </div>

      {/* sticky nav */}
      <div style={{ position: 'sticky', top: 0, zIndex: 80, backdropFilter: 'blur(14px)', background: 'rgba(6,7,13,.72)', borderBottom: '1px solid rgba(59,158,240,.14)' }}>
        <div className="wrap" style={{ height: 58, display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navGo('top')}>
            <PlaneMark />
            <div style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: '-0.01em' }}>JetSetter <span style={{ color: '#5BBAFF' }}>Pro</span></div>
          </div>
          <div style={{ flex: 1 }} />
          <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {[['problem', 'Problem'], ['solution', 'Solution'], ['market', 'Market'], ['model', 'Model'], ['ask', 'Ask'], ['team', 'Founder']].map(([id, label]) => (
              <button key={id} className="navlink" onClick={() => navGo(id)}>{label}</button>
            ))}
          </div>
          <div className="chip chip--amber" style={{ padding: '6px 12px' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#E8A020', animation: 'jspPulse 2.2s ease-in-out infinite' }} />
            <div style={{ fontSize: 11.5, letterSpacing: '.14em', fontWeight: 600 }}>CONFIDENTIAL</div>
          </div>
        </div>
      </div>

      {/* ============ HERO ============ */}
      <section id="top" className="section" style={{ padding: '84px 0 40px', overflow: 'clip' }}>
        <div data-parallax="0.14" style={{ position: 'absolute', top: -120, right: -140, width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(26,114,232,.22), transparent 65%)', animation: 'jspOrb 11s ease-in-out infinite', pointerEvents: 'none' }} />
        <div data-parallax="0.08" style={{ position: 'absolute', top: 340, left: -180, width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(91,186,255,.13), transparent 65%)', animation: 'jspOrb 14s ease-in-out infinite reverse', pointerEvents: 'none' }} />

        <div className="wrap" style={{ position: 'relative' }}>
          <div style={{ textAlign: 'center', maxWidth: 860, margin: '0 auto' }}>
            <div data-reveal="up" className="chip" style={{ fontSize: 12, letterSpacing: '.16em', color: '#5BBAFF', fontWeight: 600 }}>
              INVESTOR PITCH · JULY 2026 · TRAINOVATE TECHNOLOGIES LLC
            </div>
            <h1 data-reveal="up" data-delay="90" className="hero-h1" style={{ margin: '26px 0 0', fontSize: 74, lineHeight: 1.04, letterSpacing: '-0.028em', fontWeight: 780 }}>
              Your executive<br />
              <span className="grad-text">travel companion.</span>
            </h1>
            <p data-reveal="up" data-delay="180" style={{ margin: '24px auto 0', maxWidth: 640, fontSize: 19, lineHeight: 1.62, color: '#8B92A8' }}>
              JetSetter Pro is the AI co-pilot for the business traveler. It watches every trip — and when a flight breaks, it has already found your rebooking, re-staged your ride, notified your hotel, and filed the compensation you&rsquo;re owed.
            </p>
            <div data-reveal="up" data-delay="260" style={{ marginTop: 28, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ padding: '10px 18px', borderRadius: 999, background: 'linear-gradient(92deg, #1A72E8, #3A9AF0)', fontWeight: 700, fontSize: 14.5, boxShadow: '0 8px 24px rgba(26,114,232,.4)' }}>The Ask: {ASK} for {EQUITY}</div>
              <div className="chip">Native iOS · TestFlight-ready</div>
              <div className="chip">IRIS — powered by Claude</div>
            </div>
          </div>

          {/* video + phones */}
          <div className="grid-2" style={{ marginTop: 58, display: 'grid', gridTemplateColumns: 'minmax(380px, 1.15fr) minmax(320px, 1fr)', gap: 44, alignItems: 'center' }}>
            <div data-reveal="left" style={{ position: 'relative' }}>
              <div className="card" style={{ padding: 18, boxShadow: '0 30px 80px rgba(0,0,0,.45)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Founder introduction</div>
                  <div style={{ fontSize: 12, color: '#8B92A8', letterSpacing: '.1em' }}>90 SECONDS</div>
                </div>

                {vid.kind !== '' ? (
                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: '16 / 9', background: '#0C0F1A' }}>
                    {vid.kind === 'embed' ? (
                      <iframe src={vid.embed} title="Founder introduction" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
                    ) : (
                      <video src={vid.url} controls style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </div>
                ) : (
                  <div style={{ border: '1.5px dashed rgba(139,146,168,.35)', borderRadius: 12, aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 50% 42%, rgba(26,114,232,.14), transparent 60%)' }}>
                    <div style={{ textAlign: 'center', padding: 20 }}>
                      <div style={{ width: 62, height: 62, margin: '0 auto', borderRadius: '50%', background: 'rgba(59,158,240,.14)', border: '1px solid rgba(59,158,240,.3)', display: 'grid', placeItems: 'center' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M8 5.5v13l11-6.5-11-6.5z" fill="#5BBAFF" /></svg>
                      </div>
                      <div style={{ marginTop: 14, fontWeight: 650, fontSize: 15 }}>Video intro placeholder</div>
                      <div style={{ marginTop: 5, fontSize: 13, color: '#8B92A8' }}>Upload a clip or paste a YouTube / Loom / Vimeo link</div>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, border: '1px solid rgba(59,158,240,.3)', background: 'rgba(59,158,240,.1)', fontSize: 13, fontWeight: 600, color: '#5BBAFF', cursor: 'pointer' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5M4 20h16" stroke="#5BBAFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Upload video
                    <input type="file" accept="video/*" onChange={onVidFile} style={{ display: 'none' }} />
                  </label>
                  <input ref={vidLinkRef} className="input" placeholder="…or paste a YouTube / Loom / Vimeo link" style={{ flex: 1, minWidth: 200, padding: '9px 13px', fontSize: 13, borderRadius: 10 }} />
                  <button className="btn btn--sm" onClick={setVideoLink} style={{ background: '#1A72E8' }}>Embed</button>
                  {vid.kind !== '' && (
                    <button onClick={removeVideo} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(232,64,64,.35)', color: '#E88', fontSize: 13, cursor: 'pointer', background: 'none', fontFamily: 'inherit' }}>Remove</button>
                  )}
                </div>
              </div>
            </div>

            <div className="hide-mobile" style={{ position: 'relative', height: 560 }} data-parallax="0.05">
              <div data-reveal="pop" data-delay="150" style={{ position: 'absolute', left: '2%', top: 30, width: '47%' }}>
                <div style={{ transform: 'rotate(-7deg)' }}>
                  <img src="/screens/01_cover.png" alt="JetSetter Pro brand screen" className="phone" style={{ animation: 'jspFloat 8s ease-in-out infinite' }} />
                </div>
              </div>
              <div data-reveal="pop" data-delay="320" style={{ position: 'absolute', right: '2%', top: 0, width: '51%' }}>
                <div style={{ transform: 'rotate(5deg)' }}>
                  <img src="/screens/02_home.png" alt="JetSetter Pro home screen" className="phone" style={{ animation: 'jspFloat 9.5s ease-in-out infinite 1.2s' }} />
                </div>
              </div>
            </div>
          </div>

          {/* counters */}
          <div data-reveal="up" style={{ margin: '26px auto 0', maxWidth: 980, background: 'rgba(22,25,41,.66)', border: '1px solid rgba(59,158,240,.14)', borderRadius: 18, padding: '26px 30px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44, fontWeight: 780, letterSpacing: '-0.02em', color: '#5BBAFF' }}><span data-count="1.57" data-decimals="2" data-prefix="$" data-suffix="T">$0.00T</span></div>
              <div style={{ marginTop: 5, fontSize: 13, color: '#8B92A8', lineHeight: 1.5 }}>global business-travel spend in 2025 <span style={{ color: '#5B6478' }}>(GBTA)</span></div>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(59,158,240,.12)', borderRight: '1px solid rgba(59,158,240,.12)' }}>
              <div style={{ fontSize: 44, fontWeight: 780, letterSpacing: '-0.02em', color: '#5BBAFF' }}><span data-count="248" data-decimals="0" data-suffix="M">0M</span></div>
              <div style={{ marginTop: 5, fontSize: 13, color: '#8B92A8', lineHeight: 1.5 }}>US travelers hit by delays or cancellations last year <span style={{ color: '#5B6478' }}>(AirHelp)</span></div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44, fontWeight: 780, letterSpacing: '-0.02em', color: '#5BBAFF' }}><span data-count="600" data-decimals="0" data-prefix="up to €">up to €0</span></div>
              <div style={{ marginTop: 5, fontSize: 13, color: '#8B92A8', lineHeight: 1.5 }}>owed per passenger per disrupted EU flight <span style={{ color: '#5B6478' }}>(EC 261/2004)</span></div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 34 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ animation: 'jspBob 2.4s ease-in-out infinite' }}><path d="M6 9l6 6 6-6" stroke="#5BBAFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>
      </section>

      {/* ============ PROBLEM ============ */}
      <section id="problem" className="section">
        <div className="wrap">
          <Eyebrow>THE PROBLEM</Eyebrow>
          <h2 data-reveal="up" data-delay="80" className="h2" style={{ maxWidth: 780 }}>When a flight breaks, you become your own travel agent — at the worst possible moment.</h2>
          <p data-reveal="up" data-delay="160" className="sub" style={{ maxWidth: 680 }}>
            The travel industry is excellent at selling trips and terrible at protecting them. The moment a delay hits, you&rsquo;re rebooking on hold, re-hailing the car, re-notifying the hotel — and almost always leaving money you&rsquo;re legally owed on the table.
          </p>

          <div style={{ marginTop: 46, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
            {[
              ['1 in 4', <>US flights ran late or were canceled over the last 12 months.<br /><span style={{ color: '#5B6478', fontSize: 13 }}>BTS / AirHelp, 2025</span></>, 60],
              ['4 apps', <>one crisis. Rebooking, ride, hotel, expenses — every disruption scatters you across airline queues and support lines.</>, 160],
              ['€250–600', <>owed per passenger for qualifying EU disruptions — yet only 43% of travelers even know the right exists.<br /><span style={{ color: '#5B6478', fontSize: 13 }}>EC 261 · Eurobarometer</span></>, 260],
            ].map(([big, body, delay], i) => (
              <div key={i} data-reveal="up" data-delay={delay} className="card" style={{ padding: '30px 28px' }}>
                <div className="grad-text" style={{ fontSize: 52, fontWeight: 780, letterSpacing: '-0.03em' }}>{big}</div>
                <div style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: '#8B92A8' }}>{body}</div>
              </div>
            ))}
          </div>

          <div data-reveal="up" style={{ marginTop: 26, borderRadius: 18, padding: '26px 30px', background: 'linear-gradient(92deg, rgba(26,114,232,.16), rgba(58,154,240,.06))', border: '1px solid rgba(59,158,240,.25)', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.01em' }}>Flighty tracks. TripIt organizes. Concur reports. <span style={{ color: '#5BBAFF' }}>Nobody closes the loop: disruption → rebooking → compensation.</span></div>
          </div>

          {showLocked && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 44 }}>
              <button className="btn" onClick={() => navGo('nda')}>
                <LockIcon c="#fff" />
                See how we fix it — continue under NDA
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ============ NDA GATE ============ */}
      {showLocked && (
        <section id="nda" className="section" style={{ padding: '90px 0 120px' }}>
          <div data-parallax="0.1" style={{ position: 'absolute', top: 40, right: -160, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,160,32,.09), transparent 65%)', pointerEvents: 'none' }} />
          <div className="wrap" style={{ maxWidth: 900 }}>
            <div style={{ textAlign: 'center' }}>
              <div data-reveal="up" className="chip chip--amber" style={{ fontSize: 12, letterSpacing: '.16em', fontWeight: 700 }}>CONFIDENTIAL MATERIALS AHEAD</div>
              <h2 data-reveal="up" data-delay="80" className="h2" style={{ fontSize: 42, marginTop: 18 }}>The rest is under NDA.</h2>
              <p data-reveal="up" data-delay="150" className="sub" style={{ maxWidth: 560, margin: '16px auto 0' }}>Product architecture, market math, unit economics and the ask are shared under a confidentiality agreement. Signing takes 30 seconds.</p>
            </div>

            <div data-reveal="up" data-delay="120" className="card" style={{ marginTop: 40, borderColor: 'rgba(59,158,240,.18)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.45)' }}>
              <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(59,158,240,.14)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Confidentiality &amp; Non-Disclosure Agreement</div>
                <div style={{ fontSize: 13, color: '#8B92A8' }}>Effective date: <span style={{ color: '#ECEEF4' }}>{today}</span> · {NDA_VERSION}</div>
              </div>

              <div style={{ margin: '22px 28px 0', height: 230, overflowY: 'auto', background: '#0C0F1A', border: '1px solid rgba(139,146,168,.2)', borderRadius: 12, padding: '18px 20px', fontSize: 13, lineHeight: 1.65, color: '#A7AEC2' }}>
                <p style={{ margin: '0 0 10px' }}>This Confidentiality and Non-Disclosure Agreement (the &ldquo;Agreement&rdquo;) is entered into as of the date of electronic signature below (the &ldquo;Effective Date&rdquo;) by and between <strong style={{ color: '#ECEEF4' }}>Trainovate Technologies LLC</strong>, a Nevada limited liability company (&ldquo;Discloser&rdquo;), and the individual or entity identified below (&ldquo;Recipient&rdquo;).</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#ECEEF4' }}>1. Purpose.</strong> Discloser has developed a mobile travel-technology product known as &ldquo;JetSetter Pro.&rdquo; Recipient wishes to review Confidential Information solely to evaluate a potential investment in, or business relationship with, Discloser (the &ldquo;Purpose&rdquo;).</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#ECEEF4' }}>2. Confidential Information.</strong> &ldquo;Confidential Information&rdquo; means all non-public information disclosed by Discloser in any form, including product designs, source code, roadmaps, financial models, unit economics, market analyses, supplier and API relationships, and the contents of this presentation.</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#ECEEF4' }}>3. Obligations.</strong> Recipient shall (a) use Confidential Information solely for the Purpose; (b) not disclose it to any third party without Discloser&rsquo;s prior written consent; and (c) protect it with at least the degree of care used for Recipient&rsquo;s own confidential information, and no less than reasonable care.</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#ECEEF4' }}>4. Exclusions.</strong> Confidential Information does not include information that (a) is or becomes publicly available through no fault of Recipient; (b) was rightfully known to Recipient before disclosure; (c) is independently developed without use of Confidential Information; or (d) is rightfully received from a third party without restriction.</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#ECEEF4' }}>5. Compelled Disclosure.</strong> Recipient may disclose Confidential Information to the extent required by law, provided Recipient gives Discloser prompt notice (where lawful) and reasonable cooperation to seek protective treatment.</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#ECEEF4' }}>6. No License.</strong> No license, ownership or other intellectual-property right is granted by this Agreement or by any disclosure.</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#ECEEF4' }}>7. No Obligation.</strong> Nothing in this Agreement obligates either party to proceed with any investment or transaction.</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#ECEEF4' }}>8. Term.</strong> Recipient&rsquo;s obligations survive for three (3) years from the Effective Date; trade secrets remain protected for as long as they remain trade secrets under applicable law.</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#ECEEF4' }}>9. Return or Destruction.</strong> Upon Discloser&rsquo;s written request, Recipient shall promptly return or destroy all Confidential Information and certify destruction on request.</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#ECEEF4' }}>10. Remedies.</strong> Unauthorized disclosure may cause irreparable harm for which monetary damages are inadequate; Discloser is entitled to seek injunctive relief in addition to all other remedies at law or in equity.</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#ECEEF4' }}>11. Governing Law; Venue.</strong> This Agreement is governed by the laws of the State of Nevada, without regard to conflict-of-laws rules. Exclusive venue lies in the state and federal courts located in Clark County, Nevada.</p>
                <p style={{ margin: 0 }}><strong style={{ color: '#ECEEF4' }}>12. Electronic Signature.</strong> Recipient consents to transacting electronically. Recipient&rsquo;s typed name and drawn signature below constitute a valid electronic signature under the U.S. E-SIGN Act and Nevada UETA (NRS Chapter 719) and bind Recipient to this Agreement.</p>
              </div>

              <div style={{ padding: '22px 28px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="grid-2">
                <input ref={nameRef} className="input" placeholder="Full legal name *" />
                <input ref={emailRef} type="email" className="input" placeholder="Email *" />
                <input ref={companyRef} className="input" placeholder="Company / firm *" />
                <input ref={titleRef} className="input" placeholder="Title / role *" />
              </div>

              <div style={{ padding: '16px 28px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: '#8B92A8' }}>Draw your signature *</div>
                  <div onClick={clearSig} style={{ fontSize: 12.5, color: '#5BBAFF', cursor: 'pointer' }}>Clear</div>
                </div>
                <canvas ref={initCanvas} style={{ display: 'block', width: '100%', height: 150, background: '#0C0F1A', border: '1px solid rgba(139,146,168,.25)', borderRadius: 12, touchAction: 'none', cursor: 'crosshair' }} />
                <div style={{ marginTop: 8, fontSize: 12, color: '#5B6478' }}>Your typed name and drawn signature are captured together with a timestamp as your electronic signature.</div>
              </div>

              {err && (
                <div style={{ margin: '14px 28px 0', padding: '11px 16px', borderRadius: 10, background: 'rgba(232,64,64,.1)', border: '1px solid rgba(232,64,64,.35)', color: '#F0A0A0', fontSize: 13.5 }}>{err}</div>
              )}

              <div style={{ padding: '20px 28px 26px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <button className="btn" onClick={sign} disabled={busy} style={busy ? { opacity: 0.6, cursor: 'wait' } : undefined}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 12.5 9.5 18 20 6.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {busy ? 'Recording signature…' : 'Agree, sign & unlock the pitch'}
                </button>
                <div style={{ fontSize: 12.5, color: '#5B6478', maxWidth: 330, lineHeight: 1.5 }}>By clicking, you agree to the terms above on behalf of yourself and the firm you represent. Your signature is stored securely.</div>
              </div>
            </div>

            <div data-reveal="up" style={{ marginTop: 34 }}>
              <div style={{ fontSize: 12.5, letterSpacing: '.16em', color: '#5B6478', textAlign: 'center', marginBottom: 16 }}>WHAT&rsquo;S INSIDE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
                {['The product & the Disruption Engine', 'IRIS — the agentic AI concierge', 'Market math: TAM · SAM · SOM', 'Business model & modeled margins', 'The ask & use of funds', 'Founder & roadmap'].map((t) => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 15px', borderRadius: 12, background: 'rgba(22,25,41,.6)', border: '1px solid rgba(59,158,240,.1)', color: '#8B92A8', fontSize: 13.5 }}>
                    <LockIcon />{t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============ GATED CONTENT ============ */}
      {showUnlocked && (
        <>
          {/* SOLUTION */}
          <section id="solution" className="section">
            <div data-parallax="0.1" style={{ position: 'absolute', top: 80, left: -160, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(26,114,232,.14), transparent 65%)', pointerEvents: 'none' }} />
            <div className="wrap grid-2" style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.75fr', gap: 56, alignItems: 'center' }}>
              <div>
                <Eyebrow>THE SOLUTION</Eyebrow>
                <h2 data-reveal="up" data-delay="80" className="h2">One app that watches every trip — and acts for you.</h2>
                <div style={{ marginTop: 36, display: 'grid', gap: 14 }}>
                  {[
                    ['Anticipate', 'Background monitoring of every flight, gate and connection — with leave-by intelligence from live traffic and TSA waits, before you ask.', <svg key="i" width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="#5BBAFF" strokeWidth="2" /><path d="M12 7.5V12l3 2.5" stroke="#5BBAFF" strokeWidth="2" strokeLinecap="round" /></svg>, 80, false],
                    ['Act', 'When plans break, IRIS has already found rebookings, re-staged your Uber, and notified the hotel — you approve, it executes.', <svg key="i" width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" fill="#5BBAFF" /></svg>, 180, false],
                    ['Recover', 'Receipts become expense reports. Delays become EU261/DOT compensation claims — drafted and filed automatically.', <svg key="i" width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M7 8.2C7 6.4 8.8 5.5 12 5.5s5 1 5 2.9c0 4.6-10 2.4-10 7 0 1.9 2 3.1 5 3.1s5-1 5-2.9" stroke="#1DB97D" strokeWidth="2" strokeLinecap="round" /></svg>, 280, true],
                  ].map(([t, body, icon, delay, green]) => (
                    <div key={t} data-reveal="left" data-delay={delay} className="card" style={{ display: 'flex', gap: 18, padding: '22px 24px' }}>
                      <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 13, background: green ? 'rgba(29,185,125,.12)' : 'rgba(59,158,240,.14)', border: green ? '1px solid rgba(29,185,125,.35)' : '1px solid rgba(59,158,240,.3)', display: 'grid', placeItems: 'center' }}>{icon}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16.5 }}>{t}</div>
                        <div style={{ marginTop: 5, fontSize: 14.5, lineHeight: 1.6, color: '#8B92A8' }}>{body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div data-parallax="0.05" style={{ display: 'flex', justifyContent: 'center' }}>
                <div data-reveal="right" data-delay="150" style={{ width: '100%', maxWidth: 300 }}>
                  <img src="/screens/02_home.png" alt="Home — one active-trip command center" className="phone" style={{ borderRadius: 28, animation: 'jspFloat 9s ease-in-out infinite' }} />
                </div>
              </div>
            </div>
          </section>

          {/* WEDGE / DISRUPTION ENGINE */}
          <section id="wedge" className="section section--tint">
            <div className="wrap">
              <div className="grid-2r" style={{ display: 'grid', gridTemplateColumns: '0.72fr 1.28fr', gap: 56, alignItems: 'center' }}>
                <div data-parallax="0.06" style={{ display: 'flex', justifyContent: 'center' }}>
                  <div data-reveal="left" data-delay="120" style={{ width: '100%', maxWidth: 290 }}>
                    <img src="/screens/03_disruption.png" alt="Disruption Engine — live rebooking and compensation" className="phone" style={{ borderRadius: 28, animation: 'jspFloat 10s ease-in-out infinite .6s' }} />
                  </div>
                </div>
                <div>
                  <Eyebrow>THE WEDGE</Eyebrow>
                  <h2 data-reveal="up" data-delay="80" className="h2">The Disruption Engine closes the loop.</h2>
                  <div style={{ marginTop: 34, display: 'grid' }}>
                    {[
                      ['01', 'Detect', 'FlightAware-powered monitoring catches the delay before the gate agent announces it.', 60, false],
                      ['02', 'Rebook', 'Live alternatives via Duffel and Amadeus, ranked by IRIS — rebook in one tap as agent of record.', 140, false],
                      ['03', 'Re-coordinate', 'Hotel notified, Uber re-staged, travel insurance surfaced — the whole trip re-synced around the new flight.', 220, false],
                      ['04', 'Reclaim', 'EU261 / DOT compensation eligibility checked and the claim auto-filed. Claim firms charge 25–35% to do this manually — we plan a 15% take on recovery.', 300, true],
                    ].map(([num, t, body, delay, last]) => (
                      <div key={num} data-reveal="right" data-delay={delay} style={{ display: 'flex', gap: 18 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', background: last ? 'rgba(29,185,125,.14)' : 'rgba(59,158,240,.14)', border: last ? '1px solid rgba(29,185,125,.5)' : '1px solid rgba(59,158,240,.4)', display: 'grid', placeItems: 'center', fontSize: 12.5, fontWeight: 700, color: last ? '#1DB97D' : '#5BBAFF', flexShrink: 0 }}>{num}</div>
                          {!last && <div style={{ width: 2, flex: 1, background: 'linear-gradient(180deg, rgba(59,158,240,.4), rgba(59,158,240,.1))' }} />}
                        </div>
                        <div style={{ paddingBottom: last ? 0 : 22 }}>
                          <div style={{ fontWeight: 700, fontSize: 16, color: last ? '#1DB97D' : '#ECEEF4' }}>{t}</div>
                          <div style={{ marginTop: 4, fontSize: 14.5, lineHeight: 1.6, color: '#8B92A8' }}>{body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div data-reveal="up" data-delay="200" style={{ marginTop: 30, padding: '18px 24px', borderRadius: 14, background: 'linear-gradient(92deg, rgba(29,185,125,.14), rgba(29,185,125,.04))', border: '1px solid rgba(29,185,125,.35)', fontSize: 17, fontWeight: 700 }}>
                    No competitor automates the claim. <span style={{ color: '#1DB97D' }}>We do.</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* IRIS */}
          <section id="iris" className="section">
            <div className="wrap grid-2" style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.75fr', gap: 56, alignItems: 'center' }}>
              <div>
                <Eyebrow>IRIS · POWERED BY CLAUDE</Eyebrow>
                <h2 data-reveal="up" data-delay="80" className="h2">A concierge that doesn&rsquo;t just answer. It acts.</h2>
                <p data-reveal="up" data-delay="150" className="sub" style={{ maxWidth: 560 }}>Generic chatbots answer questions. IRIS is grounded in your live itinerary and executes against it.</p>
                <div style={{ marginTop: 30, display: 'grid', gap: 12 }}>
                  {[
                    ['Grounded', 'Every answer runs against your live trips, loyalty status, weather and traffic — not a web search.', 80],
                    ['Agentic', 'Rebooks flights, checks you in, stages rides, submits expenses — with your approval, end to end.', 160],
                    ['Remembers', 'Aisle over window, Hyatt over Hilton, vegetarian meals — per-traveler preference memory that compounds with every trip.', 240],
                  ].map(([t, body, delay], i) => (
                    <div key={t}>
                      {i > 0 && <div style={{ height: 1, background: 'rgba(59,158,240,.1)', marginBottom: 12 }} />}
                      <div data-reveal="up" data-delay={delay} style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                        <div style={{ color: '#5BBAFF', fontWeight: 800, fontSize: 15, minWidth: 96 }}>{t}</div>
                        <div style={{ flex: 1, fontSize: 14.5, lineHeight: 1.6, color: '#8B92A8' }}>{body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div data-parallax="0.05" style={{ display: 'flex', justifyContent: 'center' }}>
                <div data-reveal="right" data-delay="150" style={{ width: '100%', maxWidth: 300 }}>
                  <img src="/screens/04_iris.png" alt="IRIS — agentic AI travel concierge" className="phone" style={{ borderRadius: 28, animation: 'jspFloat 9s ease-in-out infinite .4s' }} />
                </div>
              </div>
            </div>
          </section>

          {/* BREADTH */}
          <section className="section" style={{ padding: '90px 0 110px' }}>
            <div className="wrap">
              <div style={{ textAlign: 'center' }}>
                <Eyebrow>BEYOND THE CRISIS</Eyebrow>
                <h2 data-reveal="up" data-delay="80" className="h2">One trip, fully handled.</h2>
                <p data-reveal="up" data-delay="150" className="sub" style={{ maxWidth: 560, margin: '16px auto 0' }}>8+ integrated modules · 153 Swift files · native iOS (SwiftUI) · Firebase backend · Apple Watch + Live Activities</p>
              </div>
              <div style={{ marginTop: 48, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                {[
                  ['/screens/05_wallet.png', 'Travel Wallet', 'passes · hotels · insurance', 60, 0],
                  ['/screens/06_expenses.png', 'Expenses', 'OCR → one-tap submit to Brex / Ramp / Concur', 160, 26],
                  ['/screens/07_inflight.png', 'Live Tracking', 'in-flight + disruption polling', 260, 0],
                  ['/screens/08_paywall.png', 'Monetization', '$9.99/mo · $69.99/yr · live in StoreKit', 360, 26],
                ].map(([src, t, cap, delay, mt]) => (
                  <div key={t} data-reveal="pop" data-delay={delay} style={{ marginTop: mt }}>
                    <img src={src} alt={t} style={{ display: 'block', width: '100%', borderRadius: 22, border: '1px solid rgba(59,158,240,.2)', boxShadow: '0 24px 60px rgba(0,0,0,.5)' }} />
                    <div style={{ marginTop: 12, textAlign: 'center', fontSize: 14, fontWeight: 650 }}>{t}</div>
                    <div style={{ textAlign: 'center', fontSize: 12.5, color: '#8B92A8' }}>{cap}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* MARKET */}
          <section id="market" className="section section--tint">
            <div className="wrap">
              <Eyebrow>MARKET</Eyebrow>
              <h2 data-reveal="up" data-delay="80" className="h2" style={{ maxWidth: 720 }}>A focused slice of a $1.57 trillion system.</h2>
              <div className="grid-2" style={{ marginTop: 50, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
                <div data-reveal="left" className="hide-mobile" style={{ position: 'relative', height: 400 }}>
                  <div style={{ position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)', width: 390, height: 390, borderRadius: '50%', border: '1.5px solid rgba(59,158,240,.35)', background: 'radial-gradient(circle, rgba(26,114,232,.05), rgba(26,114,232,.12))' }} />
                  <div style={{ position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)', width: 235, height: 235, borderRadius: '50%', border: '1.5px solid rgba(91,186,255,.5)', background: 'rgba(59,158,240,.14)' }} />
                  <div style={{ position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)', width: 108, height: 108, borderRadius: '50%', border: '1.5px solid #5BBAFF', background: 'rgba(91,186,255,.3)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15, color: '#EAF4FF' }}>SOM</div>
                  <div style={{ position: 'absolute', left: '50%', bottom: 300, transform: 'translateX(-50%)', fontSize: 13, letterSpacing: '.12em', color: '#5BBAFF', fontWeight: 700 }}>TAM</div>
                  <div style={{ position: 'absolute', left: '50%', bottom: 175, transform: 'translateX(-50%)', fontSize: 13, letterSpacing: '.12em', color: '#8FCBFF', fontWeight: 700 }}>SAM</div>
                </div>
                <div style={{ display: 'grid', gap: 16 }}>
                  {[
                    ['$1.57T', <><strong style={{ color: '#ECEEF4' }}>TAM.</strong> Global business-travel spend, 2025 — passing $2T by 2029. US alone: $395B. <span style={{ color: '#5B6478' }}>(GBTA BTI)</span></>, 60],
                    ['$1.4B', <><strong style={{ color: '#ECEEF4' }}>SAM.</strong> ~12M US road warriors (6+ trips/yr) × ~$120/yr willingness to pay for premium travel software. <span style={{ color: '#E8A020' }}>[Est.]</span></>, 150],
                    ['$5M ARR', <><strong style={{ color: '#ECEEF4' }}>SOM.</strong> ~60K subscribers by Year 3 — 0.5% of the serviceable base. <span style={{ color: '#E8A020' }}>[Target]</span></>, 240],
                  ].map(([big, body, delay]) => (
                    <div key={big} data-reveal="right" data-delay={delay} className="card" style={{ borderRadius: 16, padding: '20px 24px', display: 'flex', gap: 18, alignItems: 'baseline' }}>
                      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', color: '#5BBAFF', minWidth: 130 }}>{big}</div>
                      <div style={{ fontSize: 14, lineHeight: 1.55, color: '#8B92A8' }}>{body}</div>
                    </div>
                  ))}
                  <div data-reveal="right" data-delay="300" style={{ fontSize: 12.5, color: '#5B6478', lineHeight: 1.6 }}>Sources: GBTA Business Travel Index 2025 · AirHelp 2025 USA Flight Disruption Report · EC 261/2004 · Eurobarometer. Estimates marked <span style={{ color: '#E8A020' }}>[Est.]</span> are founder-modeled.</div>
                </div>
              </div>
            </div>
          </section>

          {/* BUSINESS MODEL */}
          <section id="model" className="section">
            <div className="wrap">
              <Eyebrow>BUSINESS MODEL</Eyebrow>
              <h2 data-reveal="up" data-delay="80" className="h2" style={{ maxWidth: 720 }}>Subscription today. Three revenue lines tomorrow.</h2>
              <div className="grid-2" style={{ marginTop: 48, display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 24, alignItems: 'stretch' }}>
                <div data-reveal="left" className="card" style={{ borderRadius: 20, padding: 30 }}>
                  <div style={{ fontSize: 13, letterSpacing: '.16em', color: '#8B92A8', fontWeight: 700 }}>LIVE IN-APP TODAY</div>
                  <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 10 }}><div style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-0.03em' }}>$9.99</div><div style={{ fontSize: 17, color: '#8B92A8' }}>/ month</div></div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><div style={{ fontSize: 30, fontWeight: 750, letterSpacing: '-0.02em', color: '#5BBAFF' }}>$69.99</div><div style={{ fontSize: 15, color: '#8B92A8' }}>/ year · 7-day free trial (StoreKit)</div></div>
                  <div style={{ marginTop: 26, display: 'grid', gap: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span style={{ color: '#8B92A8' }}>Price / user / mo</span><span style={{ fontWeight: 700 }}>$9.99</span></div>
                    <div className="track" style={{ height: 8 }}><div className="fillbar" style={{ '--fill': '100%' }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span style={{ color: '#8B92A8' }}>Apple fee (Small Business Program, 15%)</span><span style={{ fontWeight: 700, color: '#E8A020' }}>−$1.50</span></div>
                    <div className="track" style={{ height: 8 }}><div className="fillbar" style={{ '--fill': '15%', background: '#E8A020' }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span style={{ color: '#8B92A8' }}>Variable cost / user (Claude + flight data + infra) <span style={{ color: '#E8A020' }}>[Est.]</span></span><span style={{ fontWeight: 700, color: '#E8A020' }}>−$1.75</span></div>
                    <div className="track" style={{ height: 8 }}><div className="fillbar" style={{ '--fill': '18%', background: '#E8A020' }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, paddingTop: 6, borderTop: '1px solid rgba(59,158,240,.15)' }}><span style={{ fontWeight: 700 }}>Gross profit / user / mo</span><span style={{ fontWeight: 800, color: '#1DB97D' }}>$6.74 · ≈79% margin <span style={{ color: '#E8A020', fontWeight: 600 }}>[Modeled]</span></span></div>
                  </div>
                  <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {['CAC target ≤ $35', 'Payback < 5 months', 'LTV : CAC ≥ 3 : 1'].map((t) => (
                      <div key={t} style={{ padding: '7px 12px', borderRadius: 999, background: 'rgba(59,158,240,.1)', border: '1px solid rgba(59,158,240,.25)', fontSize: 12.5, color: '#8FCBFF' }}>{t}</div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 16 }}>
                  {[
                    ['01', 'Booking commissions', 'In-app rebooking via Duffel as agent of record (free IATA TIDS) — commission on every ticket we place.', 60, false],
                    ['02', 'Compensation recovery — 15% take', 'Claim firms charge 25–35% and make you do the paperwork. IRIS files automatically; EU261 alone costs airlines ~€5B/yr.', 150, true],
                    ['03', 'Teams for SMB', 'Seat-based plans for small firms underserved by Navan and Concur — same app their travelers already love.', 240, false],
                  ].map(([num, t, body, delay, green]) => (
                    <div key={num} data-reveal="right" data-delay={delay} className="card" style={{ borderColor: green ? 'rgba(29,185,125,.3)' : undefined, padding: '24px 26px', display: 'flex', gap: 18, alignItems: 'center' }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: green ? '#1DB97D' : '#5BBAFF', minWidth: 56 }}>{num}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{t}</div>
                        <div style={{ marginTop: 4, fontSize: 14, lineHeight: 1.6, color: '#8B92A8' }}>{body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* MOAT */}
          <section id="moat" className="section section--tint">
            <div className="wrap">
              <Eyebrow>THE MOAT</Eyebrow>
              <h2 data-reveal="up" data-delay="80" className="h2" style={{ maxWidth: 720 }}>Six integrations no rival holds together.</h2>
              <p data-reveal="up" data-delay="150" className="sub" style={{ maxWidth: 640 }}>The closed loop spans flight data, booking, ground, expense and claims — and IRIS&rsquo;s per-traveler memory compounds with every trip.</p>
              <div data-reveal="up" data-delay="120" className="card" style={{ marginTop: 42, borderRadius: 20, overflow: 'auto' }}>
                <div style={{ minWidth: 760 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.7fr repeat(5, 1fr)', padding: '16px 24px', borderBottom: '1px solid rgba(59,158,240,.14)', fontSize: 13, fontWeight: 700, color: '#8B92A8' }}>
                    <div>Capability</div>
                    <div style={{ textAlign: 'center', color: '#5BBAFF' }}>JetSetter Pro</div>
                    <div style={{ textAlign: 'center' }}>Flighty</div>
                    <div style={{ textAlign: 'center' }}>TripIt</div>
                    <div style={{ textAlign: 'center' }}>Navan / Concur</div>
                    <div style={{ textAlign: 'center' }}>Gen-AI bots</div>
                  </div>
                  {[
                    ['Live trip monitoring', '✓', '✓', '✓', '✓', '—', false],
                    ['One-tap auto-rebooking', '✓', '—', '—', '±', '—', true],
                    ['Compensation auto-claim', '✓', '—', '—', '—', '—', false],
                    ['Agentic concierge that executes', '✓', '—', '—', '—', '±', true],
                    ['Expense OCR → one-tap submit', '✓', '—', '—', '✓', '—', false],
                  ].map(([cap, a, b, c, d, e, tint], i, arr) => (
                    <div key={cap} style={{ display: 'grid', gridTemplateColumns: '1.7fr repeat(5, 1fr)', padding: '15px 24px', borderBottom: i < arr.length - 1 ? '1px solid rgba(59,158,240,.08)' : 'none', fontSize: 14, alignItems: 'center', background: tint ? 'rgba(59,158,240,.03)' : 'transparent' }}>
                      <div style={{ color: '#ECEEF4' }}>{cap}</div>
                      <div style={{ textAlign: 'center', color: '#1DB97D', fontWeight: 800 }}>{a}</div>
                      {[b, c, d, e].map((v, j) => (
                        <div key={j} style={{ textAlign: 'center', color: v === '—' ? '#3A4258' : '#8B92A8' }}>{v}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ROADMAP */}
          <section id="roadmap" className="section">
            <div className="wrap">
              <Eyebrow>STAGE &amp; ROADMAP</Eyebrow>
              <h2 data-reveal="up" data-delay="80" className="h2" style={{ maxWidth: 760 }}>Built. Not a deck-stage idea.</h2>
              <div data-reveal="up" data-delay="140" className="chip chip--amber" style={{ marginTop: 16, fontSize: 13 }}>Honest stage marker: pre-launch — no public traction claimed.</div>
              <div style={{ marginTop: 52, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '26px 0' }}>
                {[
                  ['NOW', 'Product complete', '153 Swift files, 8 modules, TestFlight-ready.', 40, 'done'],
                  ['Q3 2026', 'TestFlight beta', '500 road warriors from points & FF communities.', 120, 'next'],
                  ['Q4 2026', 'App Store launch', 'Subscription live; lounge & premium-card GTM begins.', 200, 'next'],
                  ['Q1 2027', 'Disruption loop GA', 'Live rebooking + auto-claims — revenue lines 01 & 02 switch on.', 280, 'next'],
                  ['Q2 2027', 'Teams (B2B)', 'Seat-based plans for SMBs; consumer → prosumer → team.', 360, 'open'],
                ].map(([when, t, body, delay, kind], i, arr) => (
                  <div key={when} data-reveal="up" data-delay={delay} style={{ position: 'relative', padding: i < arr.length - 1 ? '0 14px 0 0' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, background: kind === 'done' ? '#1DB97D' : kind === 'next' ? '#3B9EF0' : 'transparent', border: kind === 'open' ? '2px solid #3B9EF0' : 'none', boxShadow: kind === 'done' ? '0 0 0 5px rgba(29,185,125,.15)' : kind === 'next' ? '0 0 0 5px rgba(59,158,240,.15)' : 'none' }} />
                      {i < arr.length - 1 && <div style={{ height: 2, flex: 1, background: kind === 'done' ? 'linear-gradient(90deg, rgba(29,185,125,.6), rgba(59,158,240,.25))' : 'rgba(59,158,240,.25)' }} />}
                    </div>
                    <div style={{ marginTop: 16, fontSize: 12.5, letterSpacing: '.14em', color: kind === 'done' ? '#1DB97D' : '#5BBAFF', fontWeight: 700 }}>{when}</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 15.5 }}>{t}</div>
                    <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.55, color: '#8B92A8', paddingRight: 8 }}>{body}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* THE ASK */}
          <section id="ask" className="section" style={{ padding: '120px 0', overflow: 'clip' }}>
            <div data-parallax="0.12" style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 720, height: 720, borderRadius: '50%', background: 'radial-gradient(circle, rgba(26,114,232,.18), transparent 62%)', pointerEvents: 'none' }} />
            <div className="wrap" style={{ position: 'relative' }}>
              <div style={{ textAlign: 'center' }}>
                <Eyebrow>THE ASK</Eyebrow>
                <div data-reveal="pop" data-delay="100" className="ask-h" style={{ marginTop: 22, fontSize: 96, fontWeight: 820, letterSpacing: '-0.035em', lineHeight: 1 }}>
                  <span className="grad-text">{ASK}</span>
                  <span style={{ color: '#ECEEF4' }}> for {EQUITY}</span>
                </div>
                <div data-reveal="up" data-delay="200" style={{ marginTop: 16, fontSize: 17, color: '#8B92A8' }}>{VALUATION} implied valuation · 18 months of runway to App Store GA and the first 10,000 subscribers <span style={{ color: '#E8A020' }}>[Target]</span></div>
              </div>
              <div className="grid-2" style={{ marginTop: 56, display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 24 }}>
                <div data-reveal="left" className="card" style={{ borderRadius: 20, padding: 30 }}>
                  <div style={{ fontSize: 13, letterSpacing: '.16em', color: '#8B92A8', fontWeight: 700, marginBottom: 22 }}>USE OF FUNDS</div>
                  <div style={{ display: 'grid', gap: 18 }}>
                    {[
                      ['Engineering & live travel-API contracts', '40% · $200K', '40%', 'Duffel, FlightAware, Amadeus production keys · disruption-loop hardening'],
                      ['Go-to-market', '25% · $125K', '25%', 'Frequent-flyer & points communities, lounge / premium-card partnerships'],
                      ['Compliance, legal & agent-of-record', '20% · $100K', '20%', 'IATA TIDS, claims workflow, privacy & payments compliance'],
                      ['Operations & buffer', '15% · $75K', '15%', ''],
                    ].map(([t, amt, fill, note]) => (
                      <div key={t}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5, marginBottom: 7 }}><span style={{ fontWeight: 650 }}>{t}</span><span style={{ color: '#5BBAFF', fontWeight: 700 }}>{amt}</span></div>
                        <div className="track"><div className="fillbar" style={{ '--fill': fill }} /></div>
                        {note && <div style={{ marginTop: 5, fontSize: 12.5, color: '#5B6478' }}>{note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
                  <div data-reveal="right" data-delay="60" className="card" style={{ padding: '22px 26px' }}>
                    <div style={{ fontWeight: 700, fontSize: 15.5, color: '#5BBAFF' }}>Why now</div>
                    <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.65, color: '#8B92A8' }}>Disruptions at record highs · NDC/aggregator APIs finally allow programmatic rebooking · frontier LLMs make a true agentic concierge real. The product is already built.</div>
                  </div>
                  <div data-reveal="right" data-delay="150" className="card" style={{ padding: '22px 26px' }}>
                    <div style={{ fontWeight: 700, fontSize: 15.5, color: '#5BBAFF' }}>What a partner gets</div>
                    <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.65, color: '#8B92A8' }}>{EQUITY} of a veteran-owned company with a finished native iOS product, three stacked revenue lines, and a category — disruption recovery — with no incumbent.</div>
                  </div>
                  <div data-reveal="right" data-delay="240" style={{ borderRadius: 18, padding: '22px 26px', background: 'linear-gradient(92deg, rgba(26,114,232,.18), rgba(58,154,240,.07))', border: '1px solid rgba(59,158,240,.3)' }}>
                    <div style={{ fontSize: 15, lineHeight: 1.65, color: '#ECEEF4' }}>&ldquo;The system helps you book, then abandons you when it breaks. We&rsquo;re the app that stays.&rdquo;</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* FOUNDER */}
          <section id="team" className="section section--tint" style={{ padding: '110px 0 90px', borderBottom: 'none' }}>
            <div className="wrap">
              <Eyebrow>FOUNDER</Eyebrow>
              <div style={{ marginTop: 34, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 44, alignItems: 'start' }} className="grid-2">
                <div data-reveal="pop" style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
                  <div style={{ width: 170, height: 170, borderRadius: '50%', overflow: 'hidden', border: '1.5px solid rgba(91,186,255,.4)', boxShadow: '0 24px 60px rgba(0,0,0,.45)' }}>
                    <img src="/founder-headshot.png" alt="Jamil Kareem Jones" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div style={{ display: 'grid', gap: 7, justifyItems: 'center' }}>
                    <div style={{ padding: '6px 13px', borderRadius: 999, background: 'rgba(29,185,125,.1)', border: '1px solid rgba(29,185,125,.35)', fontSize: 12, color: '#4ED8A0', fontWeight: 600 }}>Disabled-veteran-owned</div>
                    <div style={{ padding: '6px 13px', borderRadius: 999, background: 'rgba(59,158,240,.1)', border: '1px solid rgba(59,158,240,.25)', fontSize: 12, color: '#8FCBFF', fontWeight: 600 }}>Las Vegas, NV</div>
                  </div>
                </div>
                <div>
                  <h2 data-reveal="up" style={{ margin: 0, fontSize: 40, letterSpacing: '-0.02em', fontWeight: 770 }}>Jamil Kareem Jones</h2>
                  <div data-reveal="up" data-delay="70" style={{ marginTop: 8, fontSize: 16, color: '#5BBAFF', fontWeight: 650 }}>Founder &amp; Chief Product Officer — Trainovate Technologies LLC</div>
                  <p data-reveal="up" data-delay="140" style={{ margin: '20px 0 0', maxWidth: 720, fontSize: 16, lineHeight: 1.7, color: '#A7AEC2' }}>
                    Jamil is the founder of Trainovate Technologies, a disabled-veteran-owned, Las Vegas-based company building AI-powered EHS compliance and workforce-training software, including the Soteria product suite. A disabled U.S. Army veteran with over 20 years spanning aviation MRO, manufacturing, oil &amp; gas, and international operations, his career includes an EHS consultancy at Apple Computer and serving as a Senior EHS Manager at DoorDash Corporate. He pairs frontline operational expertise with hands-on AI engineering — and is completing a D.Sc. in AI Engineering at Colorado Technical University. JetSetter Pro was born from two decades of living in airports.
                  </p>
                  <div data-reveal="up" data-delay="210" style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {['U.S. Army veteran', '20+ yrs aviation & industrial ops', 'Ex-Apple (EHS consultancy) · Ex-DoorDash (Sr. EHS Manager)', 'D.Sc. AI Engineering (in progress)'].map((t) => (
                      <div key={t} style={{ padding: '9px 15px', borderRadius: 11, background: '#161929', border: '1px solid rgba(59,158,240,.18)', fontSize: 13.5 }}>{t}</div>
                    ))}
                  </div>
                  <div data-reveal="up" data-delay="280" style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <a href="mailto:jamil@trainovations.com" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 18px', borderRadius: 11, background: 'linear-gradient(92deg, #1A72E8, #3A9AF0)', fontWeight: 650, fontSize: 14, color: '#fff', textDecoration: 'none', boxShadow: '0 8px 24px rgba(26,114,232,.35)' }}>jamil@trainovations.com</a>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 18px', borderRadius: 11, background: '#161929', border: '1px solid rgba(59,158,240,.2)', fontSize: 14, color: '#ECEEF4' }}>702-569-8330</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* FOOTER */}
      <div style={{ borderTop: '1px solid rgba(59,158,240,.1)', padding: '34px 0 44px' }}>
        <div className="wrap" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <PlaneMark size={24} radius={7} />
            <div style={{ fontSize: 13, color: '#8B92A8' }}>© 2026 Trainovate Technologies LLC — Confidential. Shared for evaluation under NDA only.</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12.5, color: '#5B6478' }}>
            <div>Signatures stored server-side (SQLite) — see README</div>
            {!locked && <div onClick={relock} style={{ color: '#5B6478', cursor: 'pointer' }}>Re-lock this browser</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
