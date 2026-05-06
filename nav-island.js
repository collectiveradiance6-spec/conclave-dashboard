/**
 * nav-island.js — TheConclave Dominion
 * Floating Dynamic Island nav with full page dropdown
 * Drop this file in root and it auto-injects the nav into every page
 */
(function(){
'use strict';

const PAGES = [
  { label:'🏠 Home',           href:'/',                    section:'Main' },
  { label:'🦕 ARK Servers',    href:'/ark',                 section:'Main' },
  { label:'🌐 World Hub',      href:'/worldconnecthub',     section:'Main' },
  { label:'◈ ClaveShard Shop', href:'/claveshard-shop',     section:'Main' },
  { label:'🛍️ Shop',          href:'/shop',                section:'Main' },
  { label:'❤️ Sponsor & Donate',href:'/sponsoranddonate',  section:'Community' },
  { label:'👥 Meet The Team',  href:'/meettheteam',         section:'Community' },
  { label:'🎨 Art Galla',      href:'/sandysartgalla',      section:'Community' },
  { label:'🤝 Partners',       href:'/promotor',            section:'Community' },
  { label:'🌞 Sol Parade',     href:'/promotor/sol-parade', section:'Partners' },
  { label:'🎯 PUBG',           href:'/promotor/pubg',       section:'Partners' },
  { label:'🔒 Privacy Policy', href:'/privacy',             section:'Legal' },
  { label:'📜 Terms',          href:'/terms',               section:'Legal' },
  { label:'⛏️ Minecraft',     href:'/minecraft',            section:'Servers' },
  { label:'🤖 AEGIS AI',       href:'/aegis-ai',            section:'Systems' },
  { label:'⚙️ Admin Panel',   href:'/admin',               section:'Systems' },
  { label:'🛡️ AEGIS Admin',  href:'/aegis-admin',          section:'Systems' },
];

const SECTIONS = ['Main','Community','Partners','Servers','Legal','Systems'];

/* detect active page */
function isActive(href){
  const p = window.location.pathname.replace(/\/+$/,'') || '/';
  const h = href.replace(/\/+$/,'') || '/';
  return p === h;
}

/* build styles */
const style = document.createElement('style');
style.textContent = `
#ni-island{
  position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99999;
  display:flex;align-items:center;gap:10px;
  background:rgba(4,1,12,.95);
  border-radius:100px;padding:7px 18px 7px 14px;
  backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);
  box-shadow:0 0 0 1px rgba(255,76,210,.22),0 8px 40px rgba(0,0,0,.75);
  transition:box-shadow .3s;white-space:nowrap;
  font-family:'Share Tech Mono',monospace;
}
#ni-island:hover{
  box-shadow:0 0 0 1px rgba(255,76,210,.42),0 12px 50px rgba(255,76,210,.18);
}
.ni-logo{
  font-family:'Orbitron',sans-serif;font-size:.6rem;font-weight:900;
  color:#fff;letter-spacing:.14em;text-decoration:none;flex-shrink:0;
}
.ni-dot{
  width:7px;height:7px;border-radius:50%;flex-shrink:0;
  background:#FF4CD2;box-shadow:0 0 10px #FF4CD2;
  animation:ni-pulse 2s infinite;
}
@keyframes ni-pulse{
  0%,100%{opacity:1;transform:scale(1)}
  50%{opacity:.35;transform:scale(.65)}
}
/* quick links strip */
.ni-quick{display:flex;gap:14px;margin-left:4px;}
.ni-quick a{
  font-size:.5rem;letter-spacing:.1em;text-transform:uppercase;
  color:rgba(255,255,255,.38);text-decoration:none;transition:color .2s;
}
.ni-quick a:hover,.ni-quick a.ni-on{color:#FF4CD2;}
@media(max-width:700px){.ni-quick{display:none}}

/* dropdown toggle */
.ni-toggle{
  display:flex;align-items:center;gap:.35rem;
  font-size:.5rem;letter-spacing:.1em;text-transform:uppercase;
  color:rgba(255,255,255,.35);cursor:pointer;
  padding:.25rem .55rem;border-radius:100px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
  transition:all .2s;margin-left:4px;user-select:none;
  white-space:nowrap;
}
.ni-toggle:hover{color:#FF4CD2;border-color:rgba(255,76,210,.28);background:rgba(255,76,210,.06);}
.ni-toggle-arrow{
  display:inline-block;transition:transform .25s;font-size:.5rem;line-height:1;
}
#ni-island.ni-open .ni-toggle-arrow{transform:rotate(180deg);}

/* dropdown panel */
#ni-dropdown{
  position:fixed;top:58px;left:50%;transform:translateX(-50%);
  z-index:99998;
  background:rgba(4,1,12,.97);
  border:1px solid rgba(255,76,210,.18);
  border-radius:20px;padding:1.2rem 1.4rem;
  backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);
  box-shadow:0 20px 60px rgba(0,0,0,.75),0 0 0 1px rgba(255,76,210,.1);
  min-width:320px;max-width:680px;width:90vw;
  display:none;
  animation:ni-drop .2s cubic-bezier(.34,1.2,.64,1);
}
@keyframes ni-drop{
  from{opacity:0;transform:translateX(-50%) translateY(-12px) scale(.97)}
  to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}
}
#ni-island.ni-open ~ #ni-dropdown{display:block;}

.ni-section-label{
  font-family:'Share Tech Mono',monospace;
  font-size:.44rem;letter-spacing:.22em;text-transform:uppercase;
  color:rgba(255,76,210,.32);margin:0 0 .5rem;
  display:flex;align-items:center;gap:.5rem;
}
.ni-section-label::after{content:'';flex:1;height:1px;background:rgba(255,76,210,.1);}

.ni-section{margin-bottom:.9rem;}
.ni-section:last-child{margin-bottom:0;}

.ni-section-links{
  display:flex;flex-wrap:wrap;gap:.35rem;
}
.ni-section-links a{
  font-family:'Share Tech Mono',monospace;
  font-size:.48rem;letter-spacing:.08em;text-transform:uppercase;
  color:rgba(255,255,255,.38);text-decoration:none;
  padding:.28rem .72rem;border-radius:100px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
  transition:all .18s;white-space:nowrap;
}
.ni-section-links a:hover{
  color:#fff;background:rgba(255,76,210,.1);border-color:rgba(255,76,210,.28);
}
.ni-section-links a.ni-on{
  color:#FF4CD2;background:rgba(255,76,210,.1);border-color:rgba(255,76,210,.28);
}

/* mobile close overlay */
#ni-overlay{
  display:none;position:fixed;inset:0;z-index:99997;
}
#ni-island.ni-open ~ #ni-overlay{display:block;}
`;
document.head.appendChild(style);

/* build HTML */
const island = document.createElement('div');
island.id = 'ni-island';

const logo = document.createElement('a');
logo.className = 'ni-logo';
logo.href = '/';
logo.textContent = 'THECONCLAVE®';

const dot = document.createElement('span');
dot.className = 'ni-dot';

/* quick links — most visited */
const quick = document.createElement('div');
quick.className = 'ni-quick';
[
  {label:'Home',href:'/'},
  {label:'ARK',href:'/ark'},
  {label:'Hub',href:'/worldconnecthub'},
  {label:'Shop',href:'/claveshard-shop'},
  {label:'Discord',href:'https://discord.gg/theconclave',ext:true},
].forEach(({label,href,ext})=>{
  const a = document.createElement('a');
  a.href = href;
  a.textContent = label;
  if(ext){ a.target='_blank'; a.rel='noopener'; }
  if(isActive(href)) a.classList.add('ni-on');
  quick.appendChild(a);
});

/* all pages toggle */
const toggle = document.createElement('div');
toggle.className = 'ni-toggle';
toggle.innerHTML = `All Pages <span class="ni-toggle-arrow">▾</span>`;
toggle.addEventListener('click', e => {
  e.stopPropagation();
  island.classList.toggle('ni-open');
});

island.appendChild(logo);
island.appendChild(dot);
island.appendChild(quick);
island.appendChild(toggle);

/* dropdown */
const dropdown = document.createElement('div');
dropdown.id = 'ni-dropdown';

/* group by section */
SECTIONS.forEach(sec => {
  const pages = PAGES.filter(p => p.section === sec);
  if(!pages.length) return;
  const section = document.createElement('div');
  section.className = 'ni-section';
  const lbl = document.createElement('div');
  lbl.className = 'ni-section-label';
  lbl.textContent = sec;
  const links = document.createElement('div');
  links.className = 'ni-section-links';
  pages.forEach(p => {
    const a = document.createElement('a');
    a.href = p.href;
    a.textContent = p.label;
    if(isActive(p.href)) a.classList.add('ni-on');
    links.appendChild(a);
  });
  section.appendChild(lbl);
  section.appendChild(links);
  dropdown.appendChild(section);
});

/* overlay to close on outside click */
const overlay = document.createElement('div');
overlay.id = 'ni-overlay';
overlay.addEventListener('click', () => island.classList.remove('ni-open'));

/* inject */
function inject(){
  document.body.appendChild(island);
  document.body.appendChild(dropdown);
  document.body.appendChild(overlay);
}

if(document.body) inject();
else document.addEventListener('DOMContentLoaded', inject);

/* close on esc */
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') island.classList.remove('ni-open');
});

})();
