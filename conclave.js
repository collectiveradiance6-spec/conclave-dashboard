/* ═══════════════════════════════════════════════════════════════════
   THECONCLAVE DOMINION — ENGINE v18
   SINGLE RAF LOOP. ZERO CONFLICTS.
   One canvas. One engine. Everything lives here.
═══════════════════════════════════════════════════════════════════ */
'use strict';
const TC = (function(){

const API = 'https://conclave-dashboard.onrender.com';
const SERVERS = [
  {id:1,key:'aberration',display:'Aberration',emoji:'🌋',ip:'217.114.196.80',port:5540,mapId:'18655529',isPvP:true,isPatreon:false},
  {id:2,key:'scorched',display:'Scorched Earth',emoji:'🏜️',ip:'217.114.196.103',port:5240,mapId:'18598049',isPvP:false,isPatreon:false},
  {id:3,key:'valguero',display:'Valguero',emoji:'🌿',ip:'85.190.136.141',port:5090,mapId:'18509341',isPvP:false,isPatreon:false},
  {id:4,key:'amissa',display:'Amissa',emoji:'⭐',ip:'217.114.196.80',port:5180,mapId:'18680162',isPvP:false,isPatreon:true},
  {id:5,key:'astraeos',display:'Astraeos',emoji:'🌙',ip:'217.114.196.9',port:5320,mapId:'18393892',isPvP:false,isPatreon:false},
  {id:6,key:'lostcolony',display:'Lost Colony',emoji:'🏝️',ip:'217.114.196.104',port:5150,mapId:'18307276',isPvP:false,isPatreon:false},
  {id:7,key:'theisland',display:'The Island',emoji:'🏔️',ip:'217.114.196.102',port:5390,mapId:'18266152',isPvP:false,isPatreon:false},
  {id:8,key:'center',display:'The Center',emoji:'🗺️',ip:'31.214.163.71',port:5120,mapId:'18182839',isPvP:false,isPatreon:false},
  {id:9,key:'extinction',display:'Extinction',emoji:'💀',ip:'31.214.196.102',port:6440,mapId:'18106633',isPvP:false,isPatreon:false},
  {id:10,key:'volcano',display:'Volcano',emoji:'🌊',ip:'217.114.196.59',port:5050,mapId:'18094678',isPvP:false,isPatreon:false},
];

/* ════════════════════════════════════════════
   UNIFIED BACKGROUND ENGINE
   Single canvas. Single RAF. Zero interference.
   Layers (all drawn on one canvas):
   1. 3D particle field (Three.js)
   2. Rainbow drip streams
   3. Pixel sprite characters
════════════════════════════════════════════ */

const PAGE_CFG = {
  index:     {pal:['#FF4CD2','#A855F7','#5865F2','#00D4FF','#35ED7E','#FFB800','#FF0080'],bgHex:0x050508,pSz:.12,pOp:.52,lA:0x7B2FFF,lB:0x00D4FF,sprites:['dino','crystal','ptero'],rise:false,spiral:false},
  ark:       {pal:['#FF6600','#FF8C00','#FFB800','#FF4500','#FF2200','#FF9900'],bgHex:0x060300,pSz:.16,pOp:.62,lA:0xFF5500,lB:0xFF2200,sprites:['dino','trike'],rise:true,spiral:false},
  minecraft: {pal:['#35ED7E','#00D4FF','#44FF44','#00FF88','#0088FF'],bgHex:0x030a04,pSz:.2,pOp:.6,lA:0x35ED7E,lB:0x00D4FF,sprites:['crystal'],rise:false,spiral:false,grid:true},
  donations: {pal:['#FFB800','#FF8C00','#FFD700','#FFC300','#FF9900'],bgHex:0x070500,pSz:.14,pOp:.58,lA:0xFFB800,lB:0xFF8C00,sprites:['crystal'],rise:false,spiral:false},
  promoter:  {pal:['#FF4CD2','#FF69B4','#DA70D6','#EE82EE','#FF1493'],bgHex:0x060005,pSz:.12,pOp:.54,lA:0xFF4CD2,lB:0xA855F7,sprites:['crystal','ptero'],rise:false,spiral:true},
  nitrado:   {pal:['#00D4FF','#0088FF','#00AAFF','#4488FF','#00BBFF'],bgHex:0x000508,pSz:.17,pOp:.58,lA:0x00D4FF,lB:0x0066FF,sprites:['crystal'],rise:false,spiral:false},
  meet:      {pal:['#FF4CD2','#7B2FFF','#00D4FF','#35ED7E','#FFB800'],bgHex:0x060508,pSz:.10,pOp:.5,lA:0xFF4CD2,lB:0x7B2FFF,sprites:['player','crystal'],rise:false,spiral:false},
  suzyqs:    {pal:['#FF8C00','#FF6B00','#FF5500','#FFB800','#FF7700'],bgHex:0x070300,pSz:.15,pOp:.58,lA:0xFF8C00,lB:0xFF4500,sprites:['crystal'],rise:true,spiral:false},
};

// 5x6 pixel sprite definitions
const PIXEL = {
  dino:  ['  XX  ',' XXXX ','XXXXXX',' XXX  ',' X  X '],
  trike: [' XXX  ','XXXXXX','XXXXXX','XX  XX'],
  ptero: ['X    X','XXXXXX',' XXXX ','  XX  '],
  crystal:['  X  ',' XXX ','XXXXX',' XXX ','  X  '],
  player: [' XX  ','XXXX ','XXXXX',' X X '],
};

// 2D canvas for drips + sprites (drawn on top of WebGL)
let drip2d = null, dctx = null;

// Drip state
const drips = [];
function mkDrip(cfg, W, H) {
  return {
    x: Math.random()*W, y: Math.random()*H * -.5,
    vy: .7 + Math.random()*1.6,
    color: cfg.pal[Math.floor(Math.random()*cfg.pal.length)],
    alpha: .07 + Math.random()*.11,
    w: 1.5 + Math.random()*2.2,
    tail: [], maxTail: 22,
  };
}

// Sprite state
const sprites = [];
function mkSprites(cfg, W, H) {
  sprites.length = 0;
  const types = cfg.sprites || ['crystal'];
  for (let i = 0; i < 7; i++) {
    sprites.push({
      type: types[i % types.length],
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-.5)*.3,
      vy: (Math.random()-.5)*.22,
      scale: 2 + Math.floor(Math.random()*2),
      alpha: .15 + Math.random()*.14,
    });
  }
}

function hexToRgb01(hex) {
  const n = parseInt(hex.replace('#',''),16);
  return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];
}

function initBG(pageType) {
  const cfg = PAGE_CFG[pageType] || PAGE_CFG.index;
  if (!window.THREE) { console.warn('Three.js not loaded'); return; }

  // ── Get/create canvas ──
  let cv = document.getElementById('bg');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.id = 'bg';
    cv.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';
    document.body.insertBefore(cv, document.body.firstChild);
  }
  cv.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';

  try {
    const R = new THREE.WebGLRenderer({canvas:cv, antialias:false, alpha:false, powerPreference:'high-performance'});
    R.setClearColor(cfg.bgHex, 1);
    R.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    R.setSize(window.innerWidth, window.innerHeight);

    const S = new THREE.Scene();
    const C = new THREE.PerspectiveCamera(68, window.innerWidth/window.innerHeight, .1, 500);
    C.position.z = 30;

    const N = 4500;
    const pos = new Float32Array(N*3), col = new Float32Array(N*3);
    for (let i = 0; i < N; i++) {
      if (cfg.grid) {
        pos[i*3]   = Math.round((Math.random()-.5)*115/6)*6;
        pos[i*3+1] = Math.round((Math.random()-.5)*85/6)*6;
        pos[i*3+2] = (Math.random()-.5)*52;
      } else if (cfg.spiral) {
        const t = i*.014, r = 14 + Math.random()*58;
        pos[i*3] = r*Math.cos(t); pos[i*3+1] = r*Math.sin(t); pos[i*3+2] = (Math.random()-.5)*50;
      } else {
        pos[i*3]   = (Math.random()-.5)*135;
        pos[i*3+1] = (Math.random()-.5)*95;
        pos[i*3+2] = (Math.random()-.5)*55;
      }
      const c = hexToRgb01(cfg.pal[Math.floor(Math.random()*cfg.pal.length)]);
      col[i*3]=c[0]; col[i*3+1]=c[1]; col[i*3+2]=c[2];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({size:cfg.pSz, vertexColors:true, transparent:true, opacity:cfg.pOp, blending:THREE.AdditiveBlending, depthWrite:false});
    const pts = new THREE.Points(geo, mat);
    S.add(pts);

    const L1 = new THREE.PointLight(cfg.lA, 7, 85); S.add(L1);
    const L2 = new THREE.PointLight(cfg.lB, 4, 65); S.add(L2);

    // 2D drip layer
    drip2d = document.createElement('canvas');
    drip2d.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none;';
    drip2d.width = window.innerWidth; drip2d.height = window.innerHeight;
    document.body.insertBefore(drip2d, cv.nextSibling);
    dctx = drip2d.getContext('2d');

    // Init drips
    for (let i = 0; i < 20; i++) {
      const d = mkDrip(cfg, drip2d.width, drip2d.height);
      d.y = Math.random() * drip2d.height;
      drips.push(d);
    }
    mkSprites(cfg, drip2d.width, drip2d.height);

    let t = 0, mx = 0, my = 0;
    let spawnT = 0;
    window.addEventListener('mousemove', e => {
      mx = (e.clientX/window.innerWidth-.5)*2;
      my = (e.clientY/window.innerHeight-.5)*2;
    }, {passive:true});

    // ── SINGLE RAF LOOP for everything ──
    function loop() {
      requestAnimationFrame(loop);
      t += .003;

      // WebGL
      pts.rotation.y += .00018;
      pts.rotation.x += .00006;
      if (cfg.spiral) pts.rotation.z += .0003;
      if (cfg.rise) {
        const pa = geo.attributes.position.array;
        for (let i = 1; i < N*3; i += 3) { pa[i] += .006; if (pa[i] > 50) pa[i] = -50; }
        geo.attributes.position.needsUpdate = true;
      }
      L1.position.set(Math.sin(t*.58)*24, Math.cos(t*.4)*17, 14);
      L2.position.set(Math.cos(t*.48)*19, Math.sin(t*.67)*14, -10);
      C.position.x += (mx*4.5 - C.position.x) * .022;
      C.position.y += (-my*3 - C.position.y) * .022;
      C.lookAt(S.position);
      R.render(S, C);

      // 2D drips + sprites
      if (dctx) {
        const W = drip2d.width, H = drip2d.height;
        dctx.clearRect(0, 0, W, H);
        spawnT += .016;
        if (spawnT > .32 && drips.length < 28) { drips.push(mkDrip(cfg, W, H)); spawnT = 0; }

        drips.forEach((d, i) => {
          d.y += d.vy + Math.sin(t*.5 + d.x*.01)*.15;
          d.x += Math.sin(t*.28 + i)*.18;
          d.tail.push({x:d.x, y:d.y});
          if (d.tail.length > d.maxTail) d.tail.shift();
          if (d.tail.length > 1) {
            dctx.beginPath();
            dctx.moveTo(d.tail[0].x, d.tail[0].y);
            for (let j = 1; j < d.tail.length; j++) dctx.lineTo(d.tail[j].x, d.tail[j].y);
            dctx.strokeStyle = d.color + Math.round(d.alpha*255).toString(16).padStart(2,'0');
            dctx.lineWidth = d.w; dctx.lineCap = 'round'; dctx.stroke();
            // Drip head glow
            const rg = dctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.w*5);
            rg.addColorStop(0, d.color + 'BB'); rg.addColorStop(1, 'transparent');
            dctx.beginPath(); dctx.arc(d.x, d.y, d.w*2.5, 0, Math.PI*2);
            dctx.fillStyle = rg; dctx.fill();
          }
          if (d.y > H + 60) drips.splice(i, 1);
        });

        // Pixel sprites
        sprites.forEach(sp => {
          sp.x += sp.vx; sp.y += sp.vy + Math.sin(t*.2 + sp.x*.01)*.07;
          if (sp.x < -60) sp.x = W + 10; if (sp.x > W + 60) sp.x = -10;
          if (sp.y < -60) sp.y = H + 10; if (sp.y > H + 60) sp.y = -10;
          const rows = PIXEL[sp.type];
          if (!rows) return;
          const c = cfg.pal[Math.floor(sp.x / 80) % cfg.pal.length];
          dctx.fillStyle = c + Math.round(sp.alpha*255).toString(16).padStart(2,'0');
          rows.forEach((row, ry) => {
            for (let cx = 0; cx < row.length; cx++) {
              if (row[cx]==='X') dctx.fillRect(sp.x+cx*sp.scale, sp.y+ry*sp.scale, sp.scale-1, sp.scale-1);
            }
          });
        });
      }
    }
    loop();

    const onResize = () => {
      R.setSize(window.innerWidth, window.innerHeight);
      C.aspect = window.innerWidth/window.innerHeight;
      C.updateProjectionMatrix();
      if (drip2d) { drip2d.width = window.innerWidth; drip2d.height = window.innerHeight; }
    };
    window.addEventListener('resize', onResize, {passive:true});

  } catch(e) { console.warn('[TC-BG]', e.message); }
}

/* ════════════════════════════════════════════
   CURSOR — single RAF, GPU transform3d only
════════════════════════════════════════════ */
function initCursor() {
  if (window.matchMedia('(hover:none)').matches) return;
  const o = document.createElement('div'); o.id = 'co';
  const inn = document.createElement('div'); inn.id = 'ci';
  document.body.appendChild(o); document.body.appendChild(inn);

  const TRAIL = 5;
  const trailCols = ['rgba(255,76,210,.5)','rgba(123,47,255,.45)','rgba(0,212,255,.4)','rgba(53,237,126,.32)','rgba(255,184,0,.25)'];
  const dots=[], tx=[], ty=[];
  for (let i = 0; i < TRAIL; i++) {
    const d = document.createElement('div'); d.className = 'ct';
    const sz = Math.max(2, 4.8-i*.58);
    d.style.cssText = `width:${sz}px;height:${sz}px;margin:-${sz/2}px 0 0 -${sz/2}px;background:${trailCols[i]};`;
    document.body.appendChild(d); dots.push(d); tx.push(-500); ty.push(-500);
  }

  let mx=-500,my=-500,ox=-500,oy=-500;
  window.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;},{passive:true});

  // Haptic on click (mobile)
  document.addEventListener('pointerdown', () => {
    if (navigator.vibrate) navigator.vibrate(18);
  }, {passive:true});
  document.addEventListener('click', e => {
    if (e.target.closest('a,button,[class^="btn"],[class*=" btn"]')) {
      if (navigator.vibrate) navigator.vibrate([12,8,12]);
    }
  }, {passive:true});

  (function raf(){
    requestAnimationFrame(raf);
    inn.style.transform = `translate3d(${mx}px,${my}px,0)`;
    ox += (mx-ox)*.11; oy += (my-oy)*.11;
    o.style.transform = `translate3d(${ox}px,${oy}px,0)`;
    tx[0]+=(mx-tx[0])*.28; ty[0]+=(my-ty[0])*.28;
    dots[0].style.transform=`translate3d(${tx[0]}px,${ty[0]}px,0)`;
    for(let i=1;i<TRAIL;i++){tx[i]+=(tx[i-1]-tx[i])*.32;ty[i]+=(ty[i-1]-ty[i])*.32;dots[i].style.transform=`translate3d(${tx[i]}px,${ty[i]}px,0)`;}
  })();

  const hSel = 'a,button,[class^="btn"],[class*=" btn"],input,textarea,select,.sp,.svc,.card,.glass,.cchip,.gw,.member-card';
  document.addEventListener('mouseover',e=>{if(e.target.closest(hSel))document.body.classList.add('ch');},{passive:true});
  document.addEventListener('mouseout',e=>{if(e.target.closest(hSel))document.body.classList.remove('ch');},{passive:true});
  document.addEventListener('mousedown',()=>document.body.classList.add('cc'),{passive:true});
  document.addEventListener('mouseup',()=>document.body.classList.remove('cc'),{passive:true});
}

/* ════════════════════════════════════════════
   SPOTLIGHT — cards glow under cursor
════════════════════════════════════════════ */
function initSpotlight() {
  let af;
  document.addEventListener('mousemove', e => {
    cancelAnimationFrame(af);
    af = requestAnimationFrame(() => {
      document.querySelectorAll('.spc,.sp,.card,.glass,.svc,.member-card').forEach(el => {
        const r = el.getBoundingClientRect();
        if (Math.abs(e.clientX-(r.left+r.width/2)) > r.width*1.5) return;
        el.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');
        el.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%');
      });
    });
  }, {passive:true});
}

/* ════════════════════════════════════════════
   MAGNETIC BUTTONS
════════════════════════════════════════════ */
function initMagnetic() {
  if (window.matchMedia('(hover:none)').matches) return;
  document.querySelectorAll('[class^="btn"],[class*=" btn"]').forEach(btn => {
    let af;
    btn.addEventListener('mousemove', e => {
      cancelAnimationFrame(af);
      af = requestAnimationFrame(() => {
        const r = btn.getBoundingClientRect();
        btn.style.transform = `translate(${(e.clientX-(r.left+r.width/2))*.18}px,${(e.clientY-(r.top+r.height/2))*.18}px)`;
        btn.style.transition = 'transform .08s';
      });
    });
    btn.addEventListener('mouseleave', () => {
      cancelAnimationFrame(af);
      btn.style.transform = '';
      btn.style.transition = 'transform .5s cubic-bezier(.34,1.56,.64,1)';
    });
  });
}

/* ════════════════════════════════════════════
   NAV
════════════════════════════════════════════ */
function initNav() {
  const nav = document.getElementById('nav');
  const tog = document.getElementById('nav-tog');
  const lnk = document.getElementById('nav-lnk');
  if (!nav) return;
  let t = false;
  window.addEventListener('scroll', () => {
    if (!t) { requestAnimationFrame(() => { nav.classList.toggle('scrolled', window.scrollY > 40); t=false; }); t=true; }
  }, {passive:true});
  if (tog && lnk) {
    tog.addEventListener('click', e => { e.stopPropagation(); lnk.classList.toggle('open'); });
    document.addEventListener('click', e => { if (!nav.contains(e.target)) lnk.classList.remove('open'); });
  }
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('#nav-lnk a').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });
}

/* ════════════════════════════════════════════
   REVEAL — IntersectionObserver, staggered
════════════════════════════════════════════ */
function initReveal() {
  // Kinetic type prep
  document.querySelectorAll('.kin').forEach(el => {
    if (el.dataset.kinDone) return;
    el.dataset.kinDone = '1';
    el.innerHTML = el.textContent.split(' ').map(w =>
      `<span style="display:inline-block;overflow:hidden;vertical-align:bottom;"><span class="ki" style="display:inline-block;transform:translateY(105%);opacity:0;transition:transform .85s cubic-bezier(.16,1,.3,1),opacity .6s;">${w}</span></span>`
    ).join(' ');
  });

  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const delay = (parseFloat(e.target.dataset.d || 0)) * 85;
      setTimeout(() => {
        e.target.classList.add('in');
        e.target.querySelectorAll('.ki').forEach((s,i) => {
          setTimeout(() => { s.style.transform='translateY(0)'; s.style.opacity='1'; }, i*55);
        });
      }, delay);
      obs.unobserve(e.target);
    });
  }, {threshold:.04, rootMargin:'0px 0px -30px 0px'});

  document.querySelectorAll('.r,.rl,.rr,.rs,.kin').forEach((el,i) => {
    if (!el.dataset.d) el.dataset.d = i % 8;
    obs.observe(el);
  });
}

/* ════════════════════════════════════════════
   TEXT SCRAMBLE
════════════════════════════════════════════ */
const SC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$&*_-+=<>';
function scramble(el, dur, delay) {
  const orig = el.dataset.sc || el.textContent;
  const tot = Math.round((dur||800)/16);
  let frame = 0, raf;
  const run = () => new Promise(res => setTimeout(() => {
    cancelAnimationFrame(raf);
    (function step() {
      const pr = frame/tot; let out = '';
      for (let i=0; i<orig.length; i++) { if(orig[i]===' '){out+=' ';continue;} out+=pr>i/orig.length?orig[i]:SC[Math.floor(Math.random()*SC.length)]; }
      el.textContent = out; frame++;
      if (frame <= tot) raf = requestAnimationFrame(step); else { el.textContent = orig; res(); }
    })();
  }, delay||0));
  return run();
}

function initScramble() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      if (e.target.dataset.sc) scramble(e.target, 700);
      e.target.querySelectorAll('[data-sc]').forEach((el,i) => scramble(el, 700, i*80));
      obs.unobserve(e.target);
    });
  }, {threshold:.1});
  document.querySelectorAll('[data-sc]').forEach(el => obs.observe(el));
  document.querySelectorAll('#nav-lnk a').forEach(el => {
    if (!el.dataset.scOrig) el.dataset.scOrig = el.textContent;
    el.addEventListener('mouseenter', () => scramble(el, 360));
  });
}

/* ════════════════════════════════════════════
   DRAG CAROUSELS
════════════════════════════════════════════ */
function initCarousels() {
  document.querySelectorAll('.hscroll,.carousel-track').forEach(t => {
    let dn=false, sx, sl;
    t.addEventListener('mousedown', e => { dn=true; sx=e.pageX-t.offsetLeft; sl=t.scrollLeft; t.style.userSelect='none'; });
    document.addEventListener('mouseup', () => { dn=false; });
    t.addEventListener('mousemove', e => { if(!dn)return; e.preventDefault(); t.scrollLeft=sl-(e.pageX-t.offsetLeft-sx)*1.35; });
  });
}

/* ════════════════════════════════════════════
   SCROLL VELOCITY SKEW
════════════════════════════════════════════ */
function initSkew() {
  let lv=0, ly=window.scrollY, lt=Date.now();
  window.addEventListener('scroll', () => {
    const n = Date.now(); lv=Math.abs(window.scrollY-ly)/Math.max(n-lt,1);
    ly=window.scrollY; lt=n;
  }, {passive:true});
  (function tick() {
    if (lv > .08) document.querySelectorAll('[data-skew]').forEach(el => {
      el.style.transform = `skewY(${Math.min(lv*.2,4)*(parseFloat(el.dataset.skew)||1)}deg)`;
      el.style.transition = 'transform .55s cubic-bezier(.22,1,.36,1)';
    });
    lv *= .88; requestAnimationFrame(tick);
  })();
}

/* ════════════════════════════════════════════
   API
════════════════════════════════════════════ */
function fetchGoal(cb) {
  fetch(API+'/donation-goal').then(r=>r.json()).then(cb)
    .catch(()=>cb({goal:500,raised:342,donors:23,days:14}));
}
function fetchServers(cb) {
  fetch(API+'/api/servers').then(r=>r.json()).then(cb)
    .catch(()=>cb({servers:SERVERS.map((s,i)=>({...s,online:s.key!=='extinction',players:[12,7,19,3,5,8,24,11,0,6][i],maxPlayers:20,name:s.display,address:`${s.ip}:${s.port}`}))}));
}
function fetchEvents(cb) {
  fetch(API+'/api/events').then(r=>r.json()).then(d=>cb(d.events||d||[]))
    .catch(()=>cb([]));
}
function fetchShop(cb) {
  fetch(API+'/api/shop').then(r=>r.json()).then(d=>cb(d.items||d||[]))
    .catch(()=>cb([]));
}
function initGoalBar() {
  fetchGoal(d => {
    const pct = Math.round((d.raised/d.goal)*100);
    document.querySelectorAll('[data-gf]').forEach(el=>setTimeout(()=>el.style.width=pct+'%',400));
    document.querySelectorAll('[data-gr]').forEach(el=>counter(el,d.raised,1400,'$'));
    document.querySelectorAll('[data-gt]').forEach(el=>el.textContent='$'+d.goal);
    document.querySelectorAll('[data-gdn]').forEach(el=>el.textContent=d.donors);
    document.querySelectorAll('[data-gp]').forEach(el=>el.textContent=pct+'%');
    document.querySelectorAll('[data-gd]').forEach(el=>el.textContent=d.days);
  });
}

/* ════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════ */
function counter(el, target, dur, pre='', suf='') {
  if (!el) return;
  let s = null;
  requestAnimationFrame(function step(ts) {
    if (!s) s = ts;
    const p = Math.min((ts-s)/dur,1), e = 1-Math.pow(1-p,3);
    el.textContent = pre+Math.round(e*target).toLocaleString()+suf;
    if (p<1) requestAnimationFrame(step);
  });
}

function particles(x, y, n=16) {
  const C=['#FFB800','#FF4CD2','#00D4FF','#35ED7E','#7B2FFF','#FF8C00'];
  for (let i=0;i<n;i++) {
    const p=document.createElement('div'), a=(i/n)*Math.PI*2, d=45+Math.random()*75, sz=3+Math.random()*6, c=C[i%C.length];
    p.className='particle';
    p.style.cssText=`left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;background:${c};box-shadow:0 0 8px ${c};--dx:${Math.cos(a)*d}px;--dy:${Math.sin(a)*d}px;animation:pBurst ${.4+Math.random()*.45}s cubic-bezier(.22,1,.36,1) forwards;`;
    document.body.appendChild(p);
    setTimeout(()=>p.remove(),900);
  }
}

function copy(text, btn) {
  navigator.clipboard.writeText(text).then(()=>{
    if(btn){const o=btn.textContent;btn.textContent='Copied!';btn.style.color='#35ED7E';setTimeout(()=>{btn.textContent=o;btn.style.color='';},1800);}
    if(navigator.vibrate) navigator.vibrate([10,5,10]);
  }).catch(()=>{const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);});
}

function lootFloaters() {
  document.querySelectorAll('.loot-f').forEach((el,i) => {
    el.style.animationDelay=(i*1.2)+'s'; el.style.animationDuration=(6.5+i*.7)+'s';
  });
}

function addScanLine() {
  const s = document.createElement('div'); s.className = 'scan-line'; document.body.appendChild(s);
}

function enterAnim() { document.body.classList.add('entering'); }

/* ════════════════════════════════════════════
   AEGIS CHAT
════════════════════════════════════════════ */
const AR=['Realm status: 8 servers online. 95 souls active. All anchors holding.','ClaveShard queue: 4 pending orders. Council fulfills within 24-72 hrs.','Funding at 68% this cycle. Every contribution keeps a map alive.','Amissa is Patreon-exclusive — discord.gg/theconclave.','5x crossplay — Xbox, PlayStation, PC — 10 maps, zero barriers.','10 maps. Active admins. Real community. Welcome to the Dominion.','Mods: Death Inventory Keeper, ARKomatic, Awesome Spyglass & Teleporter.'];
function aegisChat(iid,cid) {
  const inp=document.getElementById(iid),ch=document.getElementById(cid);
  if(!inp||!ch)return;const msg=inp.value.trim();if(!msg)return;
  inp.value='';
  ch.innerHTML+=`<div style="padding:.55rem .9rem;border-radius:8px;margin-bottom:.5rem;background:rgba(123,47,255,.12);border:1px solid rgba(123,47,255,.22);font-size:.8rem;font-family:var(--fm)"><div style="font-size:.6rem;color:rgba(255,255,255,.28);margin-bottom:.15rem;">YOU</div>${msg}</div>`;
  ch.innerHTML+=`<div id="at" style="padding:.55rem .9rem;border-radius:8px;margin-bottom:.5rem;background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.15);font-size:.8rem;font-family:var(--fm);color:#00D4FF;opacity:.5;">...</div>`;
  ch.scrollTop=ch.scrollHeight;
  setTimeout(()=>{
    document.getElementById('at')?.remove();
    ch.innerHTML+=`<div style="padding:.55rem .9rem;border-radius:8px;margin-bottom:.5rem;background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.15);font-size:.8rem;font-family:var(--fm);color:#00D4FF"><div style="font-size:.6rem;color:rgba(0,212,255,.4);margin-bottom:.15rem;">AEGIS v3.0</div>${AR[Math.floor(Math.random()*AR.length)]}</div>`;
    ch.scrollTop=ch.scrollHeight;
  },600+Math.random()*600);
}

/* ════════════════════════════════════════════
   MAIN INIT — one call per page
════════════════════════════════════════════ */
function init(pageType) {
  enterAnim();
  initBG(pageType);
  initCursor();
  initSpotlight();
  initMagnetic();
  initNav();
  initReveal();
  initScramble();
  initCarousels();
  initSkew();
  addScanLine();
  lootFloaters();
}

return {init,initGoalBar,fetchServers,fetchGoal,fetchEvents,fetchShop,particles,copy,aegisChat,counter,scramble,SERVERS};
})();

// Global aliases for inline HTML handlers
const spawnParticles = TC.particles;
const copyText = TC.copy;
const sendAegis = (iid,cid) => TC.aegisChat(iid,cid);
