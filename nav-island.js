/* THECONCLAVE — FLOATING ISLAND NAV v3.0 SOVEREIGN — FULL SITE */
(function(){'use strict';

/* ── ALL PAGES with section groupings ── */
const SECTIONS = [
  {
    label: 'REALM',
    pages: [
      {label:'Home',            icon:'🏠', href:'/',                   key:'index'},
      {label:'ARK',             icon:'🦕', href:'/ark',                key:'ark'},
      {label:'Minecraft',       icon:'⛏️', href:'/minecraft',          key:'minecraft'},
      {label:'World Hub',       icon:'🌐', href:'/worldconnecthub',    key:'hub'},
      {label:'ClaveShard Shop', icon:'💎', href:'/claveshard-shop',    key:'shop'},
    ]
  },
  {
    label: 'SUPPORT',
    pages: [
      {label:'Donate',          icon:'💛', href:'/sponsoranddonate',   key:'donate'},
      {label:'Sponsor',         icon:'🤝', href:'/promotor',           key:'sponsor'},
    ]
  },
  {
    label: 'COMMUNITY',
    pages: [
      {label:'Meet The Team',   icon:'👥', href:'/meettheteam',        key:'meet'},
      {label:"Sandy's Art Galla",icon:'🎨',href:'/sandysartgalla',     key:'gallery'},
      {label:'World Connect',   icon:'🌐', href:'/worldconnecthub',    key:'worldconnect'},
      {label:'SuzyQs',          icon:'🔥', href:'/suzyqs',             key:'suzyqs'},
      {label:'Choco',           icon:'🐾', href:'/choco',              key:'choco'},
    ]
  },
  {
    label: 'PARTNERS',
    pages: [
      {label:'Partners',        icon:'🤝', href:'/promotor',           key:'partners'},
      {label:'Sol Parade',      icon:'🎵', href:'/promotor/sol-parade',key:'solparade'},
      {label:'PUBG',            icon:'🎯', href:'/promotor/pubg',      key:'pubg'},
    ]
  },
  {
    label: 'INFO',
    pages: [
      {label:'Developers',      icon:'⚙️', href:'/meettheteam',        key:'developers'},
      {label:'Terms',           icon:'📄', href:'/terms',              key:'terms'},
      {label:'Privacy',         icon:'🔒', href:'/privacy',            key:'privacy'},
    ]
  },
  {
    label: 'AEGIS',
    pages: [
      {label:'AEGIS AI',        icon:'🤖', href:'/aegis-ai',           key:'aegis', highlight:true},
      {label:'Login',           icon:'🔐', href:'/login',              key:'login'},
      {label:'Admin',           icon:'⚡', href:'/admin',              key:'admin'},
    ]
  },
];

/* Flat list for pill bar (top picks only — space constrained) */
const PILL_LINKS = [
  {label:'Home',      icon:'🏠', href:'/'},
  {label:'ARK',       icon:'🦕', href:'/ark'},
  {label:'Minecraft', icon:'⛏️', href:'/minecraft'},
  {label:'Hub',       icon:'🌐', href:'/worldconnecthub'},
  {label:'Shop',      icon:'💎', href:'/claveshard-shop'},
  {label:'Partners',  icon:'🤝', href:'/promotor'},
  {label:'Team',      icon:'👥', href:'/meettheteam'},
  {label:'Art Galla', icon:'🎨', href:'/sandysartgalla'},
  {label:'AEGIS AI',  icon:'🤖', href:'/aegis-ai'},
  {label:'Discord',   icon:'💬', href:'https://discord.gg/theconclave', external:true, dc:true},
];

const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';

/* ── Styles ── */
const s = document.createElement('style');
s.textContent = `
@property --nia{syntax:'<angle>';initial-value:0deg;inherits:false;}
#ni-wrap{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483640;pointer-events:none;display:flex;flex-direction:column;align-items:center;}
#ni{pointer-events:all;position:relative;display:flex;align-items:center;height:58px;background:rgba(3,2,10,.97);border-radius:29px;overflow:hidden;cursor:pointer;
  transition:width .55s cubic-bezier(.34,1.56,.64,1),height .45s cubic-bezier(.34,1.56,.64,1),border-radius .4s ease,box-shadow .4s ease;
  box-shadow:0 0 0 1px rgba(255,255,255,.06),0 8px 40px rgba(0,0,0,.85),0 0 60px rgba(123,47,255,.15);
  backdrop-filter:blur(32px) saturate(200%);-webkit-backdrop-filter:blur(32px) saturate(200%);}
#ni::before{content:'';position:absolute;inset:0;border-radius:inherit;padding:1.5px;
  background:conic-gradient(from var(--nia,0deg),#FF0080,#FF6600,#FFB800,#00FF88,#00CCFF,#8800FF,#FF00CC,#FF0080);
  -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
  -webkit-mask-composite:xor;mask-composite:exclude;animation:ni-rot 3.5s linear infinite;opacity:.6;}
@keyframes ni-rot{to{--nia:360deg;}}
#ni::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% -20%,rgba(123,47,255,.1),transparent 70%);pointer-events:none;opacity:0;transition:opacity .3s;}
#ni:hover::after{opacity:1;}
#ni.closed{width:248px;}
#ni.open{width:min(920px,calc(100vw - 20px));border-radius:34px;box-shadow:0 0 0 1px rgba(255,255,255,.09),0 24px 80px rgba(0,0,0,.95),0 0 140px rgba(123,47,255,.25);}
#ni.open::before{opacity:1;}

/* Logo */
#ni-logo{display:flex;align-items:center;gap:10px;padding:0 14px 0 18px;flex-shrink:0;z-index:1;text-decoration:none;}
#ni-logo-img{width:30px;height:30px;object-fit:contain;filter:drop-shadow(0 0 10px rgba(255,184,0,.95)) drop-shadow(0 0 24px rgba(255,100,0,.5));animation:ni-lp 3s ease infinite;flex-shrink:0;}
@keyframes ni-lp{0%,100%{filter:drop-shadow(0 0 10px rgba(255,184,0,.9)) drop-shadow(0 0 22px rgba(255,100,0,.4));}50%{filter:drop-shadow(0 0 18px rgba(255,184,0,1)) drop-shadow(0 0 40px rgba(255,76,210,.7));}}
#ni-logo-text{font-family:'Cinzel Decorative','Orbitron',serif;font-size:.64rem;font-weight:700;letter-spacing:.05em;background:linear-gradient(135deg,#FFB800 0%,#FF4CD2 50%,#7B2FFF 100%);background-size:200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:ni-ts 4s linear infinite;white-space:nowrap;}
@keyframes ni-ts{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
.ni-div{width:1px;height:26px;background:linear-gradient(to bottom,transparent,rgba(255,255,255,.12),transparent);flex-shrink:0;margin:0 4px;}

/* Current page label (closed state) */
#ni-cur{display:flex;align-items:center;gap:6px;padding:5px 14px 5px 7px;font-family:'Share Tech Mono',monospace;font-size:.62rem;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.5);white-space:nowrap;flex-shrink:0;z-index:1;transition:opacity .25s,width .3s;overflow:hidden;}
#ni-dot{width:7px;height:7px;border-radius:50%;background:#7B2FFF;box-shadow:0 0 10px #7B2FFF,0 0 20px rgba(123,47,255,.5);flex-shrink:0;animation:ni-dp 2.5s ease infinite;}
@keyframes ni-dp{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.6);opacity:1}}
#ni.open #ni-cur{opacity:0;width:0;padding:0;}

/* Pill links (open state horizontal strip) */
#ni-links{display:flex;align-items:center;gap:1px;overflow:hidden;flex:1;padding:0 10px;}
.ni-lnk{display:flex;align-items:center;gap:5px;padding:7px 11px;border-radius:22px;text-decoration:none;font-family:'Exo 2','Orbitron',sans-serif;font-size:.63rem;font-weight:600;letter-spacing:.03em;color:rgba(255,255,255,.42);white-space:nowrap;flex-shrink:0;transition:all .18s ease;opacity:0;transform:translateY(7px) scale(.9);pointer-events:none;position:relative;}
#ni.open .ni-lnk{opacity:1;transform:none;pointer-events:all;}
#ni.open .ni-lnk:nth-child(1){transition-delay:.03s}
#ni.open .ni-lnk:nth-child(2){transition-delay:.06s}
#ni.open .ni-lnk:nth-child(3){transition-delay:.09s}
#ni.open .ni-lnk:nth-child(4){transition-delay:.12s}
#ni.open .ni-lnk:nth-child(5){transition-delay:.15s}
#ni.open .ni-lnk:nth-child(6){transition-delay:.18s}
#ni.open .ni-lnk:nth-child(7){transition-delay:.21s}
#ni.open .ni-lnk:nth-child(8){transition-delay:.24s}
#ni.open .ni-lnk:nth-child(9){transition-delay:.27s}
#ni.open .ni-lnk:nth-child(10){transition-delay:.30s}
.ni-lnk:hover{color:#fff;background:rgba(255,255,255,.08);}
.ni-lnk.act{color:#00D4FF;background:rgba(0,212,255,.12);}
.ni-lnk.act::after{content:'';position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:#00D4FF;box-shadow:0 0 8px #00D4FF;}
.ni-lnk.dc{color:#7289DA;background:rgba(114,137,218,.1);border:1px solid rgba(114,137,218,.25);margin-left:5px;}
.ni-lnk.dc:hover{background:rgba(114,137,218,.25);color:#fff;border-color:rgba(114,137,218,.6);}
.ni-icon{font-size:.88rem;line-height:1;}

/* ── FULL DROPDOWN (expands downward from pill) ── */
#ni-dropdown{
  pointer-events:none;
  position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);
  width:min(640px,calc(100vw - 20px));
  background:rgba(3,2,10,.98);
  border:1px solid rgba(255,255,255,.09);
  border-radius:20px;
  box-shadow:0 24px 80px rgba(0,0,0,.95),0 0 0 1px rgba(255,255,255,.04),0 0 80px rgba(123,47,255,.12);
  backdrop-filter:blur(32px);
  overflow:hidden;
  max-height:0;
  opacity:0;
  transition:max-height .45s cubic-bezier(.4,0,.2,1),opacity .3s ease,transform .35s cubic-bezier(.34,1.2,.64,1);
  transform:translateX(-50%) translateY(-8px);
}
#ni-wrap.drop-open #ni-dropdown{
  pointer-events:all;
  max-height:80vh;
  opacity:1;
  transform:translateX(-50%) translateY(0);
  overflow-y:auto;
  scrollbar-width:thin;
  scrollbar-color:rgba(123,47,255,.4) transparent;
}
/* Rainbow top edge on dropdown */
#ni-dropdown::before{
  content:'';display:block;height:2px;
  background:linear-gradient(90deg,#FF0080,#FF6600,#FFB800,#00FF88,#00CCFF,#8800FF,#FF00CC,#FF0080);
  background-size:300%;animation:ni-rot 3s linear infinite;
}

/* Section headers */
.ni-sec-hdr{
  font-family:'Share Tech Mono',monospace;font-size:.52rem;letter-spacing:.22em;
  text-transform:uppercase;color:rgba(255,255,255,.22);
  padding:.7rem 1.2rem .3rem;
  border-top:1px solid rgba(255,255,255,.04);
  margin-top:2px;
}
.ni-sec-hdr:first-child{border-top:none;margin-top:0;}

/* Dropdown links */
.ni-drop-lnk{
  display:flex;align-items:center;gap:.75rem;
  padding:.65rem 1.2rem;
  text-decoration:none;
  font-family:'Exo 2',sans-serif;font-size:.72rem;font-weight:600;letter-spacing:.02em;
  color:rgba(255,255,255,.52);
  transition:all .15s ease;
  border-radius:0;
  position:relative;
}
.ni-drop-lnk:hover{color:#fff;background:rgba(255,255,255,.06);}
.ni-drop-lnk.act{color:#00D4FF;background:rgba(0,212,255,.08);}
.ni-drop-lnk.act::before{content:'';position:absolute;left:0;top:20%;height:60%;width:2px;background:#00D4FF;border-radius:0 2px 2px 0;box-shadow:0 0 8px #00D4FF;}
.ni-drop-lnk.highlight{color:#00D4FF;font-weight:700;}
.ni-drop-lnk.highlight:hover{background:rgba(0,212,255,.1);}
.ni-drop-icon{font-size:1rem;width:22px;text-align:center;flex-shrink:0;}

/* Discord badge bottom */
#ni-disc{position:fixed;bottom:28px;right:22px;z-index:2147483638;display:flex;align-items:center;gap:9px;padding:12px 22px;background:rgba(88,101,242,.97);backdrop-filter:blur(16px);border:1px solid rgba(114,137,218,.5);border-radius:30px;text-decoration:none;font-family:'Exo 2',sans-serif;font-size:.74rem;font-weight:700;color:#fff;letter-spacing:.05em;box-shadow:0 4px 28px rgba(88,101,242,.65),0 0 0 1px rgba(255,255,255,.06);animation:disc-fl 4s ease infinite;transition:all .25s;}
@keyframes disc-fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
#ni-disc:hover{box-shadow:0 10px 40px rgba(88,101,242,.9);transform:translateY(-3px)!important;animation-play-state:paused;}
#ni-disc svg{width:18px;height:18px;fill:#fff;flex-shrink:0;}

/* Admin button */
#ni-adm-btn{display:none;position:fixed;top:16px;right:18px;z-index:2147483641;align-items:center;gap:6px;padding:8px 16px;background:rgba(123,47,255,.15);border:1px solid rgba(123,47,255,.4);border-radius:22px;font-family:'Share Tech Mono',monospace;font-size:.56rem;letter-spacing:.12em;text-transform:uppercase;color:#a78bfa;cursor:pointer;transition:all .2s;backdrop-filter:blur(12px);}
#ni-adm-btn:hover{background:rgba(123,47,255,.3);color:#fff;}
#ni-adm-ov{display:none;position:fixed;inset:0;z-index:2147483642;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);}
#ni-adm-pnl{position:absolute;top:72px;right:16px;width:290px;max-height:calc(100vh - 90px);overflow-y:auto;background:rgba(5,3,15,.99);border:1px solid rgba(123,47,255,.3);border-radius:16px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.95);}
#ni-adm-pnl h2{font-family:'Orbitron',sans-serif;font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7B2FFF;margin:0 0 12px;padding-bottom:10px;border-bottom:1px solid rgba(123,47,255,.2);}
.ah{font-family:'Share Tech Mono',monospace;font-size:.5rem;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.22);margin:10px 0 5px;}
.aa{display:flex;align-items:center;gap:7px;padding:8px 11px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);color:rgba(255,255,255,.6);font-family:'Exo 2',sans-serif;font-size:.62rem;font-weight:600;cursor:pointer;text-decoration:none;transition:all .15s;margin-bottom:3px;width:100%;box-sizing:border-box;}
.aa:hover{background:rgba(123,47,255,.15);border-color:rgba(123,47,255,.4);color:#fff;}
#ni-adm-x{position:absolute;top:12px;right:12px;background:none;border:1px solid rgba(255,255,255,.1);border-radius:50%;width:24px;height:24px;color:rgba(255,255,255,.4);font-size:.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;}
#ni-adm-x:hover{background:rgba(255,255,255,.1);color:#fff;}

@media(max-width:600px){
  #ni.closed{width:200px;}
  #ni-logo-text{display:none;}
  #ni-dropdown{width:calc(100vw - 14px);}
  .ni-drop-lnk{font-size:.68rem;padding:.6rem 1rem;}
}
`;
document.head.appendChild(s);

/* ── Build DOM ── */
const wrap = document.createElement('div');
wrap.id = 'ni-wrap';

const pill = document.createElement('div');
pill.id = 'ni';
pill.className = 'closed';

/* Logo */
const logo = document.createElement('a');
logo.id = 'ni-logo';
logo.href = '/';
logo.innerHTML = '<img id="ni-logo-img" src="/conclave-badge.png" alt="" onerror="this.style.display=\'none\'"><span id="ni-logo-text">TheConclave\u00ae</span>';
pill.appendChild(logo);

const d1 = document.createElement('div');
d1.className = 'ni-div';
pill.appendChild(d1);

/* Current page indicator */
const allPages = SECTIONS.flatMap(s => s.pages);
const cur = allPages.find(p => {
  if (!p.href || p.href.startsWith('http')) return false;
  const h = p.href.replace(/^\//, '') || 'index';
  const pp = path.replace(/^\//, '') || 'index';
  return pp === h || (pp.startsWith(h) && h !== 'index' && h.length > 2);
}) || allPages[0];

const curEl = document.createElement('div');
curEl.id = 'ni-cur';
curEl.innerHTML = '<span id="ni-dot"></span><span>' + (cur.icon || '\u2b21') + ' ' + cur.label + '</span>';
pill.appendChild(curEl);

/* Pill horizontal links */
const linksEl = document.createElement('div');
linksEl.id = 'ni-links';
PILL_LINKS.forEach(p => {
  const a = document.createElement('a');
  const isAct = path === (p.href === '/' ? '/' : p.href.replace(/^\//, ''));
  a.className = 'ni-lnk' + (isAct ? ' act' : '') + (p.dc ? ' dc' : '');
  a.href = p.href;
  if (p.external) { a.target = '_blank'; a.rel = 'noopener'; }
  a.innerHTML = '<span class="ni-icon">' + p.icon + '</span><span>' + p.label + '</span>';
  linksEl.appendChild(a);
});
pill.appendChild(linksEl);

/* ── Full sectioned dropdown ── */
const dropdown = document.createElement('div');
dropdown.id = 'ni-dropdown';

SECTIONS.forEach(sec => {
  const hdr = document.createElement('div');
  hdr.className = 'ni-sec-hdr';
  hdr.textContent = sec.label;
  dropdown.appendChild(hdr);

  sec.pages.forEach(p => {
    const a = document.createElement('a');
    const isAct = p.href && path === (p.href === '/' ? '/' : p.href.replace(/^\//, ''));
    a.className = 'ni-drop-lnk' + (isAct ? ' act' : '') + (p.highlight ? ' highlight' : '');
    a.href = p.href || '#';
    if (p.external) { a.target = '_blank'; a.rel = 'noopener'; }
    a.innerHTML = '<span class="ni-drop-icon">' + (p.icon || '') + '</span><span>' + p.label + '</span>';
    dropdown.appendChild(a);
  });
});

wrap.appendChild(pill);
wrap.appendChild(dropdown);
document.body.appendChild(wrap);

/* ── Discord badge ── */
const disc = document.createElement('a');
disc.id = 'ni-disc';
disc.href = 'https://discord.gg/theconclave';
disc.target = '_blank';
disc.rel = 'noopener';
disc.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.003.024.015.046.033.06a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>Join Discord';
document.body.appendChild(disc);

/* ── Toggle logic — click pill to open, click pill icon to toggle dropdown ── */
let open = false, dropOpen = false, timer = null;

function doOpen() { clearTimeout(timer); if (open) return; open = true; pill.classList.replace('closed', 'open'); }
function doClose() { clearTimeout(timer); timer = setTimeout(() => { if (!open) return; open = false; pill.classList.replace('open', 'closed'); closeDropdown(); }, 280); }
function openDropdown() { dropOpen = true; wrap.classList.add('drop-open'); }
function closeDropdown() { dropOpen = false; wrap.classList.remove('drop-open'); }

pill.addEventListener('mouseenter', doOpen);
pill.addEventListener('mouseleave', doClose);
dropdown.addEventListener('mouseenter', () => clearTimeout(timer));
dropdown.addEventListener('mouseleave', doClose);

/* Click logo/pill body = toggle dropdown */
pill.addEventListener('click', e => {
  if (!open) { doOpen(); e.stopPropagation(); return; }
  if (e.target.closest('a.ni-lnk')) return; // let link navigate
  dropOpen ? closeDropdown() : openDropdown();
  e.stopPropagation();
});

document.addEventListener('click', e => {
  if (!wrap.contains(e.target)) { doClose(); closeDropdown(); }
});

/* Touch support */
pill.addEventListener('touchstart', e => {
  if (!open) { e.preventDefault(); doOpen(); }
}, { passive: false });

/* ── Admin panel ── */
const ab = document.createElement('button');
ab.id = 'ni-adm-btn';
ab.textContent = '\u2699 ADMIN';
document.body.appendChild(ab);
const ao = document.createElement('div');
ao.id = 'ni-adm-ov';
ao.innerHTML = '<div id="ni-adm-pnl"><button id="ni-adm-x">\u2715</button><h2>\u2699 Admin Panel</h2><div class="ah">Dashboard</div><a class="aa" href="/admin">\ud83d\udcca Full Dashboard \u2192</a><div class="ah">Content</div><a class="aa" href="/admin?action=announce">\ud83d\udce2 Post Announcement</a><a class="aa" href="/admin?action=shop">\ud83d\udecd Edit Shop Tiers</a><a class="aa" href="/admin?action=upload">\ud83d\udcc1 Upload Asset</a><div class="ah">Discord</div><a class="aa" href="https://discordapp.com/channels/1438103556610723922" target="_blank">\ud83d\udcac Discord Server \u2192</a></div>';
document.body.appendChild(ao);
ab.addEventListener('click', () => ao.style.display = 'block');
ao.addEventListener('click', e => { if (e.target === ao) ao.style.display = 'none'; });
ao.querySelector('#ni-adm-x').addEventListener('click', () => ao.style.display = 'none');

function chkAdmin() {
  const ok = localStorage.getItem('conclave_admin') === 'true' || document.cookie.includes('conclave_admin=true');
  if (ok) { ab.style.display = 'flex'; document.body.classList.add('admin-mode'); }
}
window.CONCLAVE_SET_ADMIN = v => {
  if (v) { localStorage.setItem('conclave_admin', 'true'); ab.style.display = 'flex'; document.body.classList.add('admin-mode'); }
  else { localStorage.removeItem('conclave_admin'); ab.style.display = 'none'; document.body.classList.remove('admin-mode'); }
};
chkAdmin();

})();
