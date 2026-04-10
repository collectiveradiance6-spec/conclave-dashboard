/* ═══════════════════════════════════════════════════════════════════
   THECONCLAVE DOMINION — OMNIBUS ENGINE v12K
   Three.js · GSAP · p5.js · Anime.js · WebGL · IntersectionObserver
   "We didn't wait for the light. We became it."
═══════════════════════════════════════════════════════════════════ */

/* ── LIVE SERVER REGISTRY ── */
const CONCLAVE_SERVERS = [
  { id:1,  key:'aberration',  name:'TheConclave-Aberration-5xCrossplay',  display:'Aberration',    map:'Aberration',     emoji:'🌋', version:'v84.16', ip:'217.114.196.80',  port:5540, mapId:'18655529', isPatreon:false, isPvP:true  },
  { id:2,  key:'scorched',    name:'TheConclave-Scorched-5xCrossplay',    display:'Scorched Earth', map:'ScorchedEarth_P',emoji:'🏜️', version:'v84.16', ip:'217.114.196.103', port:5240, mapId:'18598049', isPatreon:false, isPvP:false },
  { id:3,  key:'valguero',    name:'TheConclave-Valguero-5xCrossplay',    display:'Valguero',       map:'Valguero_P',     emoji:'🌿', version:'v84.16', ip:'85.190.136.141',  port:5090, mapId:'18509341', isPatreon:false, isPvP:false },
  { id:4,  key:'amissa',      name:'TheConclave-Amissa-Patreon-5xCrossplay',display:'Amissa',       map:'Amissa',         emoji:'⭐', version:'v84.28', ip:'217.114.196.80',  port:5180, mapId:'18680162', isPatreon:true,  isPvP:false },
  { id:5,  key:'astraeos',    name:'TheConclave-Astraeos-5xCrossplay',    display:'Astraeos',       map:'Astraeos',       emoji:'🌙', version:'v84.28', ip:'217.114.196.9',   port:5320, mapId:'18393892', isPatreon:false, isPvP:false },
  { id:6,  key:'lostcolony',  name:'TheConclave-LostColony-5xCrossplay',  display:'Lost Colony',    map:'LostColony',     emoji:'🏝️', version:'v84.28', ip:'217.114.196.104', port:5150, mapId:'18307276', isPatreon:false, isPvP:false },
  { id:7,  key:'theisland',   name:'TheConclave-TheIsland-5xCrossplay',   display:'The Island',     map:'TheIsland',      emoji:'🏔️', version:'v84.28', ip:'217.114.196.102', port:5390, mapId:'18266152', isPatreon:false, isPvP:false },
  { id:8,  key:'center',      name:'TheConclave-Center-5xCrossplay',      display:'The Center',     map:'TheCenter',      emoji:'🗺️', version:'v84.28', ip:'31.214.163.71',   port:5120, mapId:'18182839', isPatreon:false, isPvP:false },
  { id:9,  key:'extinction',  name:'TheConclave-Extinction-5xCrossplay',  display:'Extinction',     map:'Extinction',     emoji:'💀', version:'v84.28', ip:'31.214.196.102',  port:6440, mapId:'18106633', isPatreon:false, isPvP:false },
  { id:10, key:'volcano',     name:'TheConclave-Volcano-5xCrossplay',     display:'Volcano',        map:'Volcano',        emoji:'🌊', version:'v84.28', ip:'217.114.196.59',  port:5050, mapId:'18094678', isPatreon:false, isPvP:false },
];

/* ── STARFIELD ── */
function initStarfield() {
  const c = document.getElementById('starfield');
  if (!c) return;
  const ctx = c.getContext('2d');
  let stars = [];
  function resize() {
    c.width = innerWidth; c.height = innerHeight; stars = [];
    for (let i = 0; i < 280; i++) stars.push({
      x:Math.random()*c.width, y:Math.random()*c.height,
      r:Math.random()*1.4+.2, alpha:Math.random()*.8+.1,
      speed:Math.random()*.35+.04, pulse:Math.random()*Math.PI*2,
      hue:Math.random()>.85 ? (Math.random()>.5 ? 'rgba(0,212,255,' : 'rgba(123,47,255,') : 'rgba(255,255,255,'
    });
  }
  resize(); window.addEventListener('resize', resize);
  (function draw() {
    requestAnimationFrame(draw);
    ctx.clearRect(0, 0, c.width, c.height);
    stars.forEach(s => {
      s.pulse += .016; s.y -= s.speed;
      if (s.y < 0) { s.y = c.height; s.x = Math.random()*c.width; }
      const a = s.alpha * (.4 + Math.sin(s.pulse) * .4);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fillStyle = s.hue + a + ')'; ctx.fill();
      if (s.r > 1.1) {
        ctx.beginPath();
        ctx.moveTo(s.x-s.r*3,s.y); ctx.lineTo(s.x+s.r*3,s.y);
        ctx.moveTo(s.x,s.y-s.r*3); ctx.lineTo(s.x,s.y+s.r*3);
        ctx.strokeStyle = `rgba(180,220,255,${a*.3})`; ctx.lineWidth = .5; ctx.stroke();
      }
    });
  })();
}

/* ── RAINBOW PULSE + MAGNETIC CURSOR ── */
function initRainbowPulse() {
  const cursor = document.createElement('div');
  cursor.style.cssText = 'position:fixed;width:380px;height:380px;border-radius:50%;pointer-events:none;z-index:9998;mix-blend-mode:screen;transform:translate(-50%,-50%);transition:opacity .4s;opacity:0;background:radial-gradient(circle,rgba(123,47,255,.14) 0%,rgba(0,212,255,.08) 40%,transparent 70%);will-change:transform;';
  document.body.appendChild(cursor);
  let mx = -500, my = -500;
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    cursor.style.left = mx + 'px'; cursor.style.top = my + 'px'; cursor.style.opacity = '1';
  });
  document.addEventListener('mouseleave', () => cursor.style.opacity = '0');

  // Magnetic tilt
  let af;
  document.addEventListener('mousemove', e => {
    cancelAnimationFrame(af);
    af = requestAnimationFrame(() => {
      document.querySelectorAll('.float-panel, .emissive-card, .gcard, .server-card-arch, .staff-card').forEach(el => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width/2, cy = r.top + r.height/2;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 450) {
          const s = 1 - dist/450;
          const rx = (-dy/450)*10*s, ry = (dx/450)*10*s;
          el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(${s*6}px)`;
          el.style.transition = 'transform .08s';
        } else if (el.style.perspective) {
          el.style.transform = '';
          el.style.transition = 'transform .5s cubic-bezier(.22,1,.36,1)';
        }
      });
    });
  });
}

/* ── NAV ── */
function initNav() {
  const nav = document.getElementById('mainNav');
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (!nav) return;
  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 60));
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!nav.contains(e.target)) links.classList.remove('open');
    });
  }
  // Active link
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) a.classList.add('active');
  });
}

/* ── SCROLL REVEAL ── */
function initReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        const delay = e.target.dataset.delay || 0;
        setTimeout(() => e.target.classList.add('visible'), delay * 80);
        obs.unobserve(e.target);
      }
    });
  }, { threshold:.06, rootMargin:'0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach((el, i) => {
    if (!el.dataset.delay) el.dataset.delay = i % 6;
    obs.observe(el);
  });
}

/* ── MARQUEE ── */
function initMarquee() {
  document.querySelectorAll('.marquee-track').forEach(track => {
    const clone = track.cloneNode(true);
    track.parentElement.appendChild(clone);
  });
}

/* ── COUNTER ANIMATION ── */
function animateCounter(el, target, duration = 1400, prefix = '', suffix = '') {
  if (!el) return;
  let start = null;
  requestAnimationFrame(function step(ts) {
    if (!start) start = ts;
    const prog = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - prog, 3);
    el.textContent = prefix + Math.round(ease * target).toLocaleString() + suffix;
    if (prog < 1) requestAnimationFrame(step);
  });
}

/* ── API ── */
const API = 'https://conclave-dashboard.onrender.com';

function fetchGoal(cb) {
  fetch(API + '/donation-goal')
    .then(r => r.json()).then(cb)
    .catch(() => cb({ goal:500, raised:342, donors:23, days:14, percent:68 }));
}

function fetchServers(cb) {
  fetch(API + '/servers')
    .then(r => r.json()).then(cb)
    .catch(() => cb({
      servers: CONCLAVE_SERVERS.map((s, i) => ({
        ...s,
        online: s.key !== 'extinction',
        players: [12, 7, 19, 3, 5, 8, 24, 11, 0, 6][i],
        maxPlayers: 20,
        pvp: s.isPvP,
        name: s.display,
        map: s.map,
        address: `${s.ip}:${s.port}`
      }))
    }));
}

/* ── GOAL BAR ── */
function initGoalBar() {
  fetchGoal(d => {
    const pct = Math.round((d.raised / d.goal) * 100);
    document.querySelectorAll('[data-goal-fill]').forEach(el => {
      setTimeout(() => el.style.width = pct + '%', 300);
    });
    document.querySelectorAll('[data-goal-raised]').forEach(el => {
      animateCounter(el, d.raised, 1400, '$');
    });
    document.querySelectorAll('[data-goal-total]').forEach(el => el.textContent = '$' + d.goal);
    document.querySelectorAll('[data-goal-donors]').forEach(el => el.textContent = d.donors);
    document.querySelectorAll('[data-goal-pct]').forEach(el => el.textContent = pct + '%');
    document.querySelectorAll('[data-goal-days]').forEach(el => el.textContent = d.days);
  });
}

/* ── SCANLINE ── */
function initScanline() {
  const scan = document.createElement('div');
  scan.style.cssText = 'position:fixed;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(0,212,255,.08),transparent);pointer-events:none;z-index:9997;animation:scanMove 5s linear infinite;will-change:transform;';
  document.body.appendChild(scan);
}

/* ── COPY ── */
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.style.color = '#35ED7E';
      setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1800);
    }
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  });
}

/* ── PARTICLE BURST ── */
function spawnParticles(x, y, count = 14) {
  const colors = ['#FFB800','#FF4CD2','#00D4FF','#35ED7E','#7B2FFF','#FF8C00'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    const angle = (i / count) * Math.PI * 2;
    const dist = 60 + Math.random() * 80;
    const size = 4 + Math.random() * 6;
    const color = colors[Math.floor(Math.random() * colors.length)];
    p.className = 'particle';
    p.style.cssText = `
      left:${x}px; top:${y}px; width:${size}px; height:${size}px;
      background:${color}; box-shadow:0 0 8px ${color};
      --dx:${Math.cos(angle)*dist}px; --dy:${Math.sin(angle)*dist}px;
      animation:particleBurst ${.5+Math.random()*.4}s cubic-bezier(.22,1,.36,1) forwards;
    `;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  }
}

/* ── TABS ── */
function initTabs() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.group || 'default';
      const tab = btn.dataset.tab;
      document.querySelectorAll(`[data-tab][data-group="${group}"]`).forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll(`[data-panel][data-group="${group}"]`).forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
    });
  });
}

/* ── GSAP COUNTER ── */
function gsapCounter(el) {
  if (!el || !window.gsap) return;
  const target = parseInt(el.dataset.count || el.textContent, 10);
  if (isNaN(target)) return;
  const prefix = el.dataset.prefix || '';
  const suffix = el.dataset.suffix || '';
  gsap.from({ val:0 }, {
    val: target, duration:2, ease:'power2.out',
    onUpdate: function() { el.textContent = prefix + Math.round(this._targets[0].val).toLocaleString() + suffix; }
  });
}

/* ── SPLIT TEXT (GSAP) ── */
function splitAndAnimate(selector, stagger = .04, delay = 0) {
  const el = document.querySelector(selector);
  if (!el || !window.gsap) return;
  const text = el.textContent;
  el.innerHTML = text.split('').map(c =>
    c === ' ' ? '<span style="display:inline-block;width:.3em;">&nbsp;</span>'
    : `<span style="display:inline-block;opacity:0;transform:translateY(60px) rotateX(-90deg);transform-origin:50% 0">${c}</span>`
  ).join('');
  gsap.to(`${selector} span`, {
    opacity:1, y:0, rotateX:0,
    stagger, delay, duration:.7, ease:'back.out(1.5)'
  });
}

/* ── SMOOTH SCROLL ── */
function smoothScroll(e, target) {
  e.preventDefault();
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}

/* ── GSAP SCROLL TRIGGERS (if available) ── */
function initScrollAnimations() {
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  // Parallax images
  document.querySelectorAll('[data-parallax]').forEach(el => {
    gsap.to(el, {
      y: () => el.dataset.parallax || '-15%',
      ease: 'none',
      scrollTrigger: { trigger:el, start:'top bottom', end:'bottom top', scrub:1 }
    });
  });

  // Stagger reveals
  document.querySelectorAll('.archiv-feature-item').forEach((el, i) => {
    gsap.from(el, {
      scrollTrigger: { trigger:el, start:'top 90%' },
      x:-20, opacity:0, duration:.7, delay:i*.1, ease:'power2.out'
    });
  });
}

/* ── AEGIS CHAT (shared component) ── */
const AEGIS_REPLIES = [
  "Realm status: All anchors holding. 8 servers online, 95 souls active across the cluster.",
  "ClaveShard queue: 4 pending orders. Council members are on it.",
  "No codex violations detected in the last 24 hours. The realm endures.",
  "Server funding at 68% for this cycle. Every contribution keeps a map alive.",
  "I see all that happens in the Dominion. The Council's will is enforced.",
  "The Amissa server is Patreon-only. Join discord.gg/theconclave to learn more.",
  "TheConclave runs 5x crossplay on Xbox, PlayStation, and PC — all maps, all platforms.",
  "ClaveShard orders are fulfilled by Council within 24–72 hours. Submit via the ARK page.",
  "10 maps, zero pay-to-win, maximum chaos. Welcome to the Dominion.",
  "Mods active: Death Inventory Keeper, ARKomatic, Awesome Spyglass & Teleporter.",
];

function sendAegisChat(inputId, chatId) {
  const input = document.getElementById(inputId);
  const chat = document.getElementById(chatId);
  if (!input || !chat) return;
  const msg = input.value.trim();
  if (!msg) return;
  chat.innerHTML += `<div style="padding:.6rem .9rem;border-radius:8px;margin-bottom:.6rem;background:rgba(123,47,255,.1);border:1px solid rgba(123,47,255,.2);font-size:.82rem;"><div style="font-size:.65rem;color:rgba(255,255,255,.3);margin-bottom:.2rem;">YOU</div>${msg}</div>`;
  input.value = '';
  const thinking = `<div id="aegis-thinking" style="padding:.6rem .9rem;border-radius:8px;margin-bottom:.6rem;background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.15);font-size:.82rem;color:#00D4FF;"><div style="font-size:.65rem;color:rgba(0,212,255,.5);margin-bottom:.2rem;">AEGIS</div>Processing...</div>`;
  chat.innerHTML += thinking;
  chat.scrollTop = chat.scrollHeight;
  setTimeout(() => {
    const t = document.getElementById('aegis-thinking');
    if (t) t.remove();
    chat.innerHTML += `<div style="padding:.6rem .9rem;border-radius:8px;margin-bottom:.6rem;background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.15);font-size:.82rem;color:#00D4FF;"><div style="font-size:.65rem;color:rgba(0,212,255,.5);margin-bottom:.2rem;">AEGIS CORE v3.0</div>${AEGIS_REPLIES[Math.floor(Math.random()*AEGIS_REPLIES.length)]}</div>`;
    chat.scrollTop = chat.scrollHeight;
  }, 700 + Math.random() * 600);
}

/* ── LOOT FLOAT INIT ── */
function initLootFloaters() {
  document.querySelectorAll('.loot-float').forEach((el, i) => {
    el.style.animationDelay = (i * 1.3) + 's';
  });
}

/* ── NUMBER FORMAT ── */
function fmtNum(n) { return new Intl.NumberFormat().format(n); }
