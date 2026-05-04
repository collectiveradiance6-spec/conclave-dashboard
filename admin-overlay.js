/* ═══════════════════════════════════════════════════════════════
   THECONCLAVE DOMINION — ADMIN CUSTOMIZATION OVERLAY
   Floating admin panel. Only visible when tcd_admin_ok is set.
   Allows per-page editing, section toggling, theme tweaks.
═══════════════════════════════════════════════════════════════ */
(function(){
  if(!sessionStorage.getItem('tcd_admin_ok')) return;
  if(window.__tcd_admin_overlay_loaded__) return;
  window.__tcd_admin_overlay_loaded__ = true;

  const page = location.pathname.split('/').pop()||'index.html';

  /* ── INJECT STYLES ── */
  const s=document.createElement('style');
  s.textContent=`
#__tcd_aov__{
  position:fixed;bottom:0;left:0;right:0;z-index:99999;
  pointer-events:none;
}
#__tcd_aov_bar__{
  pointer-events:all;
  background:rgba(4,3,14,0.97);
  border-top:1px solid rgba(255,184,0,0.3);
  display:flex;align-items:center;gap:8px;
  padding:8px 16px;
  backdrop-filter:blur(20px);
  transform:translateY(100%);
  transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1);
}
#__tcd_aov_bar__.visible{transform:translateY(0);}
#__tcd_aov_tab__{
  pointer-events:all;
  position:fixed;bottom:0;left:50%;transform:translateX(-50%);
  background:rgba(255,184,0,0.12);
  border:1px solid rgba(255,184,0,0.4);
  border-bottom:none;
  border-radius:10px 10px 0 0;
  padding:4px 18px;
  font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.15em;
  color:#ffb800;cursor:pointer;
  transition:all 0.2s;z-index:100000;
}
#__tcd_aov_tab__:hover{background:rgba(255,184,0,0.22);}
#__tcd_aov_tab__.hidden-tab{bottom:-30px;}

/* Panel */
#__tcd_aov_panel__{
  pointer-events:all;
  position:fixed;right:0;top:0;bottom:0;width:380px;
  background:rgba(4,3,14,0.98);
  border-left:1px solid rgba(255,184,0,0.25);
  z-index:99998;
  display:flex;flex-direction:column;
  transform:translateX(100%);
  transition:transform 0.4s cubic-bezier(0.22,1,.36,1);
  backdrop-filter:blur(24px);
  overflow:hidden;
}
#__tcd_aov_panel__.open{transform:translateX(0);}
.aov-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:16px 20px;
  border-bottom:1px solid rgba(255,255,255,0.07);
  flex-shrink:0;
}
.aov-title{
  font-family:'Orbitron',monospace;font-size:11px;letter-spacing:0.2em;
  color:#ffb800;text-transform:uppercase;
}
.aov-close{
  background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
  border-radius:6px;padding:4px 8px;color:rgba(255,255,255,0.5);
  cursor:pointer;font-size:12px;transition:all 0.2s;
}
.aov-close:hover{border-color:rgba(255,0,0,0.4);color:#ff4444;}
.aov-body{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:16px;}
.aov-section{
  background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
  border-radius:10px;padding:14px;
}
.aov-section-title{
  font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.18em;
  color:rgba(255,255,255,0.35);text-transform:uppercase;margin-bottom:10px;
}
.aov-btn{
  display:flex;align-items:center;justify-content:center;gap:6px;
  width:100%;padding:9px 14px;border-radius:8px;
  font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:0.12em;
  text-transform:uppercase;cursor:pointer;transition:all 0.2s;
  text-decoration:none;border:1px solid;
}
.aov-btn-gold{background:rgba(255,184,0,0.1);border-color:rgba(255,184,0,0.35);color:#ffb800;}
.aov-btn-gold:hover{background:rgba(255,184,0,0.2);border-color:rgba(255,184,0,0.6);}
.aov-btn-cyan{background:rgba(0,212,255,0.08);border-color:rgba(0,212,255,0.3);color:#00d4ff;}
.aov-btn-cyan:hover{background:rgba(0,212,255,0.18);border-color:rgba(0,212,255,0.6);}
.aov-btn-red{background:rgba(255,23,68,0.08);border-color:rgba(255,23,68,0.3);color:#ff4444;}
.aov-btn-red:hover{background:rgba(255,23,68,0.18);border-color:rgba(255,23,68,0.6);}
.aov-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.aov-label{font-family:'Share Tech Mono',monospace;font-size:9px;color:rgba(255,255,255,0.4);margin-bottom:4px;letter-spacing:0.1em;}
.aov-input{
  width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
  border-radius:6px;padding:7px 10px;color:#fff;font-family:'Share Tech Mono',monospace;
  font-size:10px;outline:none;transition:border 0.2s;
}
.aov-input:focus{border-color:rgba(255,184,0,0.45);}
.aov-toggle{display:flex;align-items:center;justify-content:space-between;padding:4px 0;}
.aov-toggle-label{font-family:'Share Tech Mono',monospace;font-size:10px;color:rgba(255,255,255,0.55);}
.aov-switch{
  position:relative;width:36px;height:18px;cursor:pointer;
}
.aov-switch input{opacity:0;width:0;height:0;}
.aov-slider{
  position:absolute;inset:0;background:rgba(255,255,255,0.1);border-radius:100px;
  transition:0.3s;border:1px solid rgba(255,255,255,0.15);
}
.aov-slider::before{
  content:'';position:absolute;height:12px;width:12px;
  left:2px;bottom:2px;background:rgba(255,255,255,0.4);
  border-radius:50%;transition:0.3s;
}
.aov-switch input:checked + .aov-slider{background:rgba(255,184,0,0.3);border-color:rgba(255,184,0,0.5);}
.aov-switch input:checked + .aov-slider::before{transform:translateX(18px);background:#ffb800;}
.aov-page-badge{
  display:inline-flex;align-items:center;gap:6px;
  background:rgba(0,212,255,0.07);border:1px solid rgba(0,212,255,0.2);
  border-radius:100px;padding:3px 10px;
  font-family:'Share Tech Mono',monospace;font-size:9px;color:#00d4ff;
  letter-spacing:0.12em;text-transform:uppercase;
}
.aov-footer{
  flex-shrink:0;padding:14px 20px;
  border-top:1px solid rgba(255,255,255,0.06);
}
  `;
  document.head.appendChild(s);

  /* ── BUILD UI ── */
  const wrap=document.createElement('div');
  wrap.id='__tcd_aov__';
  wrap.innerHTML=`
  <div id="__tcd_aov_tab__">⚙ ADMIN MODE</div>
  <div id="__tcd_aov_panel__" role="dialog" aria-label="Admin Customization Panel">
    <div class="aov-header">
      <div>
        <div class="aov-title">⚙ Admin Panel</div>
        <div class="aov-page-badge" style="margin-top:6px">📄 ${page}</div>
      </div>
      <button class="aov-close" id="__aov_close__">✕ Close</button>
    </div>
    <div class="aov-body">

      <!-- Quick Nav -->
      <div class="aov-section">
        <div class="aov-section-title">Quick Access</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <a class="aov-btn aov-btn-gold" href="AEGIS-Admin.html">⚙ AEGIS Admin Dashboard</a>
          <a class="aov-btn aov-btn-cyan" href="AEGIS-Auth.html">🔑 Auth Portal</a>
        </div>
      </div>

      <!-- Page Sections Toggle -->
      <div class="aov-section" id="__aov_sections__">
        <div class="aov-section-title">Page Sections</div>
        <div id="__aov_sections_list__"></div>
      </div>

      <!-- Theme Quick Tweaks -->
      <div class="aov-section">
        <div class="aov-section-title">Theme Accent</div>
        <div class="aov-grid2">
          <div>
            <div class="aov-label">Primary Color</div>
            <input type="color" id="__aov_color1__" value="#00D4FF" class="aov-input" style="height:36px;cursor:pointer;padding:2px">
          </div>
          <div>
            <div class="aov-label">Secondary Color</div>
            <input type="color" id="__aov_color2__" value="#7B2FFF" class="aov-input" style="height:36px;cursor:pointer;padding:2px">
          </div>
        </div>
        <div style="margin-top:8px">
          <button class="aov-btn aov-btn-gold" onclick="window.__aov_apply_theme__()">Apply Theme</button>
        </div>
      </div>

      <!-- Announcement Banner -->
      <div class="aov-section">
        <div class="aov-section-title">Page Banner</div>
        <div>
          <div class="aov-label">Banner Text</div>
          <input type="text" id="__aov_banner_txt__" class="aov-input" placeholder="Enter announcement..." style="margin-bottom:8px">
          <div class="aov-label">Banner Type</div>
          <select id="__aov_banner_type__" class="aov-input" style="margin-bottom:8px">
            <option value="info">Info (Cyan)</option>
            <option value="warn">Warning (Gold)</option>
            <option value="event">Event (Purple)</option>
            <option value="wipe">Wipe (Red)</option>
          </select>
          <div class="aov-grid2">
            <button class="aov-btn aov-btn-cyan" onclick="window.__aov_show_banner__()">Show Banner</button>
            <button class="aov-btn aov-btn-red" onclick="window.__aov_hide_banner__()">Hide Banner</button>
          </div>
        </div>
      </div>

      <!-- Dev Tools -->
      <div class="aov-section">
        <div class="aov-section-title">Dev Tools</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="aov-btn aov-btn-cyan" onclick="location.reload()">⟳ Reload Page</button>
          <button class="aov-btn aov-btn-red" onclick="window.__aov_logout__()">⏏ Exit Admin Mode</button>
        </div>
      </div>
    </div>
    <div class="aov-footer" style="font-family:'Share Tech Mono',monospace;font-size:8px;color:rgba(255,255,255,0.2);text-align:center;letter-spacing:0.1em">
      CONCLAVE AEGIS ADMIN v3 · AUTHORIZED ACCESS ONLY
    </div>
  </div>
  `;
  document.body.appendChild(wrap);

  /* ── BANNER SYSTEM ── */
  let bannerEl=null;
  const bannerColors={
    info:{bg:'rgba(0,212,255,0.12)',border:'rgba(0,212,255,0.35)',color:'#00d4ff'},
    warn:{bg:'rgba(255,184,0,0.12)',border:'rgba(255,184,0,0.35)',color:'#ffb800'},
    event:{bg:'rgba(123,47,255,0.12)',border:'rgba(123,47,255,0.35)',color:'#a855f7'},
    wipe:{bg:'rgba(255,23,68,0.12)',border:'rgba(255,23,68,0.35)',color:'#ff1744'},
  };

  window.__aov_show_banner__=()=>{
    const txt=document.getElementById('__aov_banner_txt__')?.value;
    const type=document.getElementById('__aov_banner_type__')?.value||'info';
    if(!txt) return;
    if(bannerEl) bannerEl.remove();
    const c=bannerColors[type]||bannerColors.info;
    bannerEl=document.createElement('div');
    bannerEl.style.cssText=`position:fixed;top:70px;left:0;right:0;z-index:9000;
      background:${c.bg};border-bottom:1px solid ${c.border};
      padding:10px var(--px,2rem);text-align:center;
      font-family:'Share Tech Mono',monospace;font-size:11px;color:${c.color};
      letter-spacing:0.1em;backdrop-filter:blur(10px);
      display:flex;align-items:center;justify-content:center;gap:12px;`;
    bannerEl.innerHTML=`<span>${txt}</span>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:${c.color};cursor:pointer;font-size:14px;line-height:1">✕</button>`;
    document.body.insertBefore(bannerEl,document.body.children[1]);
  };
  window.__aov_hide_banner__=()=>{if(bannerEl){bannerEl.remove();bannerEl=null;}};

  /* ── SECTION TOGGLES ── */
  const sections=document.querySelectorAll('section,[data-section],[id$="-section"]');
  const secList=document.getElementById('__aov_sections_list__');
  if(sections.length && secList){
    sections.forEach((sec,i)=>{
      const id=sec.id||sec.dataset.section||`section-${i}`;
      const label=sec.dataset.label||sec.querySelector('h2,h3')?.textContent?.trim().slice(0,30)||id;
      const row=document.createElement('div');
      row.className='aov-toggle';
      row.innerHTML=`
        <span class="aov-toggle-label">${label}</span>
        <label class="aov-switch">
          <input type="checkbox" checked onchange="document.getElementById('${id}')?document.getElementById('${id}').style.display=this.checked?'':'none':void 0">
          <span class="aov-slider"></span>
        </label>`;
      secList.appendChild(row);
    });
  } else if(secList){
    secList.innerHTML='<div style="font-family:Share Tech Mono,monospace;font-size:9px;color:rgba(255,255,255,0.25)">No labelled sections found</div>';
  }

  /* ── THEME ── */
  window.__aov_apply_theme__=()=>{
    const c1=document.getElementById('__aov_color1__')?.value||'#00D4FF';
    const c2=document.getElementById('__aov_color2__')?.value||'#7B2FFF';
    document.documentElement.style.setProperty('--el',c1);
    document.documentElement.style.setProperty('--pl',c2);
    localStorage.setItem('tcd_theme_c1',c1);
    localStorage.setItem('tcd_theme_c2',c2);
  };
  // restore saved
  const sc1=localStorage.getItem('tcd_theme_c1'),sc2=localStorage.getItem('tcd_theme_c2');
  if(sc1){document.documentElement.style.setProperty('--el',sc1);const e=document.getElementById('__aov_color1__');if(e)e.value=sc1;}
  if(sc2){document.documentElement.style.setProperty('--pl',sc2);const e=document.getElementById('__aov_color2__');if(e)e.value=sc2;}

  /* ── LOGOUT ── */
  window.__aov_logout__=()=>{
    sessionStorage.removeItem('tcd_admin_ok');
    location.reload();
  };

  /* ── TOGGLE PANEL ── */
  const panel=document.getElementById('__tcd_aov_panel__');
  const tab=document.getElementById('__tcd_aov_tab__');
  const closeBtn=document.getElementById('__aov_close__');
  let open=false;
  const toggle=()=>{
    open=!open;
    panel.classList.toggle('open',open);
    tab.textContent=open?'✕ CLOSE':'⚙ ADMIN MODE';
  };
  tab.addEventListener('click',toggle);
  if(closeBtn) closeBtn.addEventListener('click',toggle);
  window.__tcd_admin_overlay_toggle__=toggle;

})();
