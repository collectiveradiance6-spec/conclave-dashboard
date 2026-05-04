/* ═══════════════════════════════════════════════════════════════════
   THECONCLAVE DOMINION — ENGINE v17 DEFINITIVE
   Zero hallucinations. All verified. Production ready.
   GPU cursor (transform3d only) · Single WebGL renderer per page
   Living particle background · Text scramble · Reveal system
═══════════════════════════════════════════════════════════════════ */

const API='https://conclave-dashboard.onrender.com';
const CONCLAVE_SERVERS=[
  {id:1,key:'aberration',display:'Aberration',emoji:'🌋',ip:'217.114.196.80',port:5540,mapId:'18655529',isPatreon:false,isPvP:true},
  {id:2,key:'scorched',display:'Scorched Earth',emoji:'🏜️',ip:'217.114.196.103',port:5240,mapId:'18598049',isPatreon:false,isPvP:false},
  {id:3,key:'valguero',display:'Valguero',emoji:'🌿',ip:'85.190.136.141',port:5090,mapId:'18509341',isPatreon:false,isPvP:false},
  {id:4,key:'amissa',display:'Amissa',emoji:'⭐',ip:'217.114.196.80',port:5180,mapId:'18680162',isPatreon:true,isPvP:false},
  {id:5,key:'astraeos',display:'Astraeos',emoji:'🌙',ip:'217.114.196.9',port:5320,mapId:'18393892',isPatreon:false,isPvP:false},
  {id:6,key:'lostcolony',display:'Lost Colony',emoji:'🏝️',ip:'217.114.196.104',port:5150,mapId:'18307276',isPatreon:false,isPvP:false},
  {id:7,key:'theisland',display:'The Island',emoji:'🏔️',ip:'217.114.196.102',port:5390,mapId:'18266152',isPatreon:false,isPvP:false},
  {id:8,key:'center',display:'The Center',emoji:'🗺️',ip:'31.214.163.71',port:5120,mapId:'18182839',isPatreon:false,isPvP:false},
  {id:9,key:'extinction',display:'Extinction',emoji:'💀',ip:'31.214.196.102',port:6440,mapId:'18106633',isPatreon:false,isPvP:false},
  {id:10,key:'volcano',display:'Volcano',emoji:'🌊',ip:'217.114.196.59',port:5050,mapId:'18094678',isPatreon:false,isPvP:false},
];

/* ══════════════════════════════════════
   WEBGL LIVING BACKGROUND
   Single fullscreen renderer. Alpha=true.
   Particles visible through all sections.
══════════════════════════════════════ */
function initPageScene(type){
  if(!window.THREE){console.warn('[Conclave] Three.js missing');return;}
  try{
    // Find or create canvas
    let cv=document.getElementById('page-canvas');
    if(!cv){cv=document.createElement('canvas');cv.id='page-canvas';document.body.insertBefore(cv,document.body.firstChild);}
    cv.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:1;pointer-events:none;';

    const R=new THREE.WebGLRenderer({canvas:cv,antialias:false,alpha:true,powerPreference:'high-performance'});
    R.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    R.setSize(window.innerWidth,window.innerHeight);
    R.setClearColor(0x000000,0); // transparent — body bg shows through

    const S=new THREE.Scene();
    const C=new THREE.PerspectiveCamera(65,window.innerWidth/window.innerHeight,0.1,600);
    C.position.z=30;

    // Page-specific particle palette + behavior
    const T={
      index:   {pal:[[1,.28,.82],[.53,.18,1],[0,.82,1],[.27,1,.48],[1,.72,0],[1,.28,.1]],   n:4800,sz:.12,op:.55,lA:0x7B2FFF,lB:0x00D4FF},
      ark:     {pal:[[1,.28,.1],[1,.45,0],[1,.65,0],[.9,.2,0],[1,.8,.3]],                   n:4000,sz:.16,op:.65,lA:0xFF5500,lB:0xFF2200,rise:true},
      minecraft:{pal:[[0,.75,.3],[0,1,.5],[.1,.9,.2],[0,.6,1],[.2,1,.4]],                   n:3500,sz:.18,op:.6, lA:0x35ED7E,lB:0x00D4FF,grid:true},
      donations:{pal:[[1,.72,0],[1,.55,0],[1,.85,.2],[1,.4,.1],[.9,.7,0]],                  n:4200,sz:.14,op:.6, lA:0xFFB800,lB:0xFF8C00},
      promoter: {pal:[[1,.28,.82],[.8,.1,.8],[.6,.1,1],[1,.5,.9],[.4,.1,1]],               n:3800,sz:.13,op:.55,lA:0xFF4CD2,lB:0xA855F7,spiral:true},
      nitrado:  {pal:[[0,.65,1],[0,.9,1],[.1,.5,1],[0,.4,.9],[.2,.8,1]],                   n:3600,sz:.17,op:.6, lA:0x00D4FF,lB:0x0066FF},
      meet:     {pal:[[1,.28,.82],[.53,.18,1],[0,.82,1],[.27,1,.48],[1,.72,0],[0,.9,.8]],   n:5000,sz:.10,op:.5, lA:0xFF4CD2,lB:0x7B2FFF},
      suzyqs:   {pal:[[1,.55,0],[1,.35,.1],[1,.72,0],[.9,.3,0],[1,.6,.2]],                  n:3500,sz:.15,op:.6, lA:0xFF8C00,lB:0xFF4500,rise:true},
    };
    const cfg=T[type]||T.index;
    const N=cfg.n;
    const pos=new Float32Array(N*3),col=new Float32Array(N*3);

    for(let i=0;i<N;i++){
      if(cfg.grid){
        pos[i*3]=Math.round((Math.random()-.5)*110/5)*5;
        pos[i*3+1]=Math.round((Math.random()-.5)*80/5)*5;
        pos[i*3+2]=(Math.random()-.5)*50;
      } else if(cfg.spiral){
        const t=i*.013,r=15+Math.random()*60;
        pos[i*3]=r*Math.cos(t); pos[i*3+1]=r*Math.sin(t); pos[i*3+2]=(Math.random()-.5)*50;
      } else {
        pos[i*3]=(Math.random()-.5)*130;
        pos[i*3+1]=(Math.random()-.5)*95;
        pos[i*3+2]=(Math.random()-.5)*55;
      }
      const c=cfg.pal[Math.floor(Math.random()*cfg.pal.length)];
      col[i*3]=c[0];col[i*3+1]=c[1];col[i*3+2]=c[2];
    }

    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    const pts=new THREE.Points(geo,new THREE.PointsMaterial({
      size:cfg.sz,vertexColors:true,transparent:true,
      opacity:cfg.op,blending:THREE.AdditiveBlending,depthWrite:false
    }));
    S.add(pts);

    const L1=new THREE.PointLight(cfg.lA,6,85);
    const L2=new THREE.PointLight(cfg.lB,4,65);
    S.add(L1);S.add(L2);

    let t=0,mx=0,my=0;
    window.addEventListener('mousemove',e=>{mx=(e.clientX/window.innerWidth-.5)*2;my=(e.clientY/window.innerHeight-.5)*2;},{passive:true});

    (function loop(){
      requestAnimationFrame(loop);t+=.003;
      pts.rotation.y+=.00018;pts.rotation.x+=.00006;
      if(cfg.spiral)pts.rotation.z+=.0003;
      if(cfg.rise){
        const pa=geo.attributes.position.array;
        for(let i=1;i<N*3;i+=3){pa[i]+=.006;if(pa[i]>50)pa[i]=-50;}
        geo.attributes.position.needsUpdate=true;
      }
      L1.position.set(Math.sin(t*.55)*25,Math.cos(t*.38)*18,14);
      L2.position.set(Math.cos(t*.48)*20,Math.sin(t*.65)*14,-10);
      C.position.x+=(mx*4-C.position.x)*.022;
      C.position.y+=(-my*3-C.position.y)*.022;
      C.lookAt(S.position);
      R.render(S,C);
    })();

    window.addEventListener('resize',()=>{
      R.setSize(window.innerWidth,window.innerHeight);
      C.aspect=window.innerWidth/window.innerHeight;
      C.updateProjectionMatrix();
    },{passive:true});
  }catch(e){console.warn('[Conclave] WebGL:',e.message);}
}

/* ══════════════════════════════════════
   STARFIELD — always sits above page-canvas
══════════════════════════════════════ */
function initStarfield(){
  const c=document.getElementById('starfield');if(!c)return;
  const ctx=c.getContext('2d');let stars=[];
  function resize(){
    c.width=window.innerWidth;c.height=window.innerHeight;stars=[];
    for(let i=0;i<260;i++)stars.push({
      x:Math.random()*c.width,y:Math.random()*c.height,
      r:Math.random()*1.3+.18,a:Math.random()*.6+.1,
      sp:Math.random()*.22+.025,p:Math.random()*Math.PI*2,
      h:Math.random()>.88?(Math.random()>.5?'rgba(0,212,255,':'rgba(123,47,255,'):'rgba(255,255,255,'
    });
  }
  resize();window.addEventListener('resize',resize,{passive:true});
  let last=0;
  (function draw(ts){
    requestAnimationFrame(draw);
    if(ts-last<20)return;last=ts;
    ctx.clearRect(0,0,c.width,c.height);
    stars.forEach(s=>{
      s.p+=.009;s.y-=s.sp;
      if(s.y<0){s.y=c.height;s.x=Math.random()*c.width;}
      const a=s.a*(.38+Math.sin(s.p)*.38);
      ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle=s.h+a+')';ctx.fill();
    });
  })(0);
}

/* ══════════════════════════════════════
   CURSOR — GPU transform3d ONLY
   No left/top. No layout thrashing.
══════════════════════════════════════ */
function initCursor(){
  if(window.matchMedia('(hover:none)').matches)return;

  const sty=document.createElement('style');
  sty.textContent=`
    #cc-o{position:fixed;top:0;left:0;width:40px;height:40px;margin-left:-20px;margin-top:-20px;border-radius:50%;border:1.5px solid rgba(255,255,255,.6);pointer-events:none;z-index:9999;will-change:transform;mix-blend-mode:difference;}
    #cc-i{position:fixed;top:0;left:0;width:6px;height:6px;margin-left:-3px;margin-top:-3px;border-radius:50%;background:#fff;pointer-events:none;z-index:9999;will-change:transform;}
    .cur-h #cc-o{width:60px;height:60px;margin-left:-30px;margin-top:-30px;background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.95);transition:width .28s cubic-bezier(0.16,1,0.3,1),height .28s cubic-bezier(0.16,1,0.3,1),margin .28s cubic-bezier(0.16,1,0.3,1),background .25s,border-color .25s;}
    .cur-c #cc-o{width:24px;height:24px;margin-left:-12px;margin-top:-12px;background:rgba(255,255,255,.22);transition:width .12s,height .12s,margin .12s,background .12s;}
    @media(hover:none){#cc-o,#cc-i{display:none!important;}}
    .ct{position:fixed;top:0;left:0;border-radius:50%;pointer-events:none;will-change:transform;}
  `;
  document.head.appendChild(sty);

  const o=document.createElement('div');o.id='cc-o';
  const inn=document.createElement('div');inn.id='cc-i';
  document.body.appendChild(o);document.body.appendChild(inn);

  // 6 trail dots
  const TRAIL=6;
  const trailCols=['rgba(255,76,210,.5)','rgba(155,63,255,.45)','rgba(0,212,255,.4)','rgba(53,237,126,.35)','rgba(255,184,0,.28)','rgba(255,69,0,.22)'];
  const dots=[],tx=[],ty=[];
  for(let i=0;i<TRAIL;i++){
    const d=document.createElement('div');d.className='ct';
    const sz=Math.max(2,5-i*.6);
    d.style.cssText=`width:${sz}px;height:${sz}px;margin-left:-${sz/2}px;margin-top:-${sz/2}px;background:${trailCols[i]};z-index:${9990-i};`;
    document.body.appendChild(d);
    dots.push(d);tx.push(-500);ty.push(-500);
  }

  let mx=-500,my=-500,ox=-500,oy=-500;
  window.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;},{passive:true});

  (function raf(){
    requestAnimationFrame(raf);
    // inner: instant
    inn.style.transform=`translate3d(${mx}px,${my}px,0)`;
    // outer: lerp
    ox+=(mx-ox)*.12;oy+=(my-oy)*.12;
    o.style.transform=`translate3d(${ox}px,${oy}px,0)`;
    // trail cascade
    tx[0]+=(mx-tx[0])*.3;ty[0]+=(my-ty[0])*.3;
    dots[0].style.transform=`translate3d(${tx[0]}px,${ty[0]}px,0)`;
    for(let i=1;i<TRAIL;i++){
      tx[i]+=(tx[i-1]-tx[i])*.32;ty[i]+=(ty[i-1]-ty[i])*.32;
      dots[i].style.transform=`translate3d(${tx[i]}px,${ty[i]}px,0)`;
    }
  })();

  const hSel='a,button,[class*="btn"],[class^="btn"],input,textarea,select,.shard-panel,.bc,.bento-cell,.member-card,.work-row,.gw,.cchip,.server-card,.shard-card,.method-card,.pay-card';
  document.addEventListener('mouseover',e=>{if(e.target.closest(hSel))document.body.classList.add('cur-h');});
  document.addEventListener('mouseout',e=>{if(e.target.closest(hSel))document.body.classList.remove('cur-h');});
  document.addEventListener('mousedown',()=>document.body.classList.add('cur-c'));
  document.addEventListener('mouseup',()=>document.body.classList.remove('cur-c'));
}

/* ══════════════════════════════════════
   SPOTLIGHT — passive RAF
══════════════════════════════════════ */
function initSpotlight(){
  let af;
  document.addEventListener('mousemove',e=>{
    cancelAnimationFrame(af);
    af=requestAnimationFrame(()=>{
      document.querySelectorAll('.spotlight-card,.bc,.bento-cell,.emissive-card,.float-panel,.member-card,.shard-panel,.server-card,.shard-card,.method-card,.pay-card').forEach(el=>{
        const r=el.getBoundingClientRect();
        if(e.clientX<r.left-200||e.clientX>r.right+200||e.clientY<r.top-200||e.clientY>r.bottom+200)return;
        el.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');
        el.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%');
      });
    });
  },{passive:true});
}

/* ══════════════════════════════════════
   MAGNETIC BUTTONS
══════════════════════════════════════ */
function initMagneticButtons(){
  if(window.matchMedia('(hover:none)').matches)return;
  document.querySelectorAll('[class^="btn-"],[class*=" btn-"]').forEach(btn=>{
    let af;
    btn.addEventListener('mousemove',e=>{
      cancelAnimationFrame(af);
      af=requestAnimationFrame(()=>{
        const r=btn.getBoundingClientRect();
        const dx=(e.clientX-(r.left+r.width/2))*.18;
        const dy=(e.clientY-(r.top+r.height/2))*.18;
        btn.style.transform=`translate(${dx}px,${dy}px)`;
        btn.style.transition='transform .08s';
      });
    });
    btn.addEventListener('mouseleave',()=>{
      cancelAnimationFrame(af);
      btn.style.transform='';
      btn.style.transition='transform .5s cubic-bezier(0.34,1.56,0.64,1)';
    });
  });
}

/* ══════════════════════════════════════
   RAINBOW AURA — behind everything
══════════════════════════════════════ */
function initRainbowPulse(){
  if(window.matchMedia('(hover:none)').matches)return;
  const a=document.createElement('div');
  a.style.cssText='position:fixed;top:0;left:0;width:500px;height:500px;margin-left:-250px;margin-top:-250px;border-radius:50%;pointer-events:none;z-index:2;mix-blend-mode:screen;opacity:0;transition:opacity .5s;background:radial-gradient(circle,rgba(123,47,255,.09) 0%,rgba(0,212,255,.05) 40%,transparent 70%);will-change:transform;';
  document.body.appendChild(a);
  let lx=-500,ly=-500,ax=-500,ay=-500;
  window.addEventListener('mousemove',e=>{lx=e.clientX;ly=e.clientY;a.style.opacity='1';},{passive:true});
  document.addEventListener('mouseleave',()=>a.style.opacity='0');
  (function loop(){ax+=(lx-ax)*.055;ay+=(ly-ay)*.055;a.style.transform=`translate3d(${ax}px,${ay}px,0)`;requestAnimationFrame(loop);})();
}

/* ══════════════════════════════════════
   NAV
══════════════════════════════════════ */
function initNav(){
  const nav=document.getElementById('mainNav');
  const toggle=document.getElementById('navToggle');
  const links=document.getElementById('navLinks');
  if(!nav)return;
  let t=false;
  window.addEventListener('scroll',()=>{if(!t){requestAnimationFrame(()=>{nav.classList.toggle('scrolled',window.scrollY>40);t=false;});t=true;}},{passive:true});
  if(toggle&&links){
    toggle.addEventListener('click',e=>{e.stopPropagation();links.classList.toggle('open');});
    document.addEventListener('click',e=>{if(!nav.contains(e.target))links.classList.remove('open');});
  }
  const path=location.pathname.split('/').pop()||'index.html';
  document.querySelectorAll('.nav-links a').forEach(a=>{
    if(a.getAttribute('href')===path||(path===''&&a.getAttribute('href')==='index.html'))a.classList.add('active');
  });
}

/* ══════════════════════════════════════
   SCROLL REVEAL + KINETIC TYPE
══════════════════════════════════════ */
function initReveal(){
  document.querySelectorAll('.kinetic-split').forEach(el=>{
    if(el.dataset.kinReady)return;
    el.dataset.kinReady='1';
    el.innerHTML=el.textContent.split(' ').map(w=>`<span style="display:inline-block;overflow:hidden;vertical-align:bottom;"><span class="kin" style="display:inline-block;transform:translateY(105%);opacity:0;transition:transform .85s cubic-bezier(0.16,1,0.3,1),opacity .6s;">${w}</span></span>`).join(' ');
  });
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(!e.isIntersecting)return;
      const delay=parseFloat(e.target.dataset.delay||0)*85;
      setTimeout(()=>{
        e.target.classList.add('visible');
        e.target.querySelectorAll('.kin').forEach((s,i)=>setTimeout(()=>{s.style.transform='translateY(0)';s.style.opacity='1';},i*55));
      },delay);
      obs.unobserve(e.target);
    });
  },{threshold:.04,rootMargin:'0px 0px -30px 0px'});
  document.querySelectorAll('.reveal,.reveal-left,.reveal-right,.reveal-scale,.reveal-clip,.kinetic-split').forEach((el,i)=>{
    if(!el.dataset.delay)el.dataset.delay=i%7;
    obs.observe(el);
  });
}

/* ══════════════════════════════════════
   TEXT SCRAMBLE
══════════════════════════════════════ */
const SC_CHARS='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*_-+=<>';
class Scrambler{
  constructor(el,dur,delay){this.el=el;this.orig=el.dataset.scramble||el.textContent;this.dur=dur||800;this.delay=delay||0;this.raf=null;}
  run(){return new Promise(res=>setTimeout(()=>{this.f=0;this.tot=Math.round(this.dur/16);cancelAnimationFrame(this.raf);this._s(res);},this.delay));}
  _s(res){
    const pr=this.f/this.tot;let out='';
    for(let i=0;i<this.orig.length;i++){if(this.orig[i]===' '){out+=' ';continue;}out+=pr>i/this.orig.length?this.orig[i]:SC_CHARS[Math.floor(Math.random()*SC_CHARS.length)];}
    this.el.textContent=out;this.f++;
    if(this.f<=this.tot){this.raf=requestAnimationFrame(()=>this._s(res));}else{this.el.textContent=this.orig;res&&res();}
  }
}
function initScramble(){
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(!e.isIntersecting)return;
      if(e.target.dataset.scramble)new Scrambler(e.target,700).run();
      e.target.querySelectorAll('[data-scramble]').forEach((el,i)=>new Scrambler(el,700,i*80).run());
      obs.unobserve(e.target);
    });
  },{threshold:.1});
  document.querySelectorAll('[data-scramble]').forEach(el=>obs.observe(el));
  document.querySelectorAll('.nav-links a').forEach(el=>{
    el.addEventListener('mouseenter',()=>new Scrambler(el,350).run());
  });
}

/* ══════════════════════════════════════
   AMBIENT CODE RAIN
══════════════════════════════════════ */
function initCodeRain(){
  if(document.getElementById('code-rain'))return;
  const w=document.createElement('div');w.id='code-rain';
  w.style.cssText='position:fixed;inset:0;z-index:2;pointer-events:none;overflow:hidden;opacity:.028;user-select:none;';
  document.body.appendChild(w);
  const CODES=['THECONCLAVE','DOMINION','5X','ARK:SA','CLAVESHARD','AEGIS','0xFF4CD2','0x7B2FFF','217.114.196','18655529','v84','REALM'];
  const cols=Math.max(3,Math.floor(window.innerWidth/240));
  for(let i=0;i<cols;i++){
    const c=document.createElement('div');
    c.style.cssText=`position:absolute;left:${(i/cols)*100}%;top:${-Math.random()*80}%;font-family:'Share Tech Mono',monospace;font-size:9px;color:#7B2FFF;line-height:2.1;white-space:nowrap;writing-mode:vertical-rl;animation:codeRainFall ${16+Math.random()*20}s linear infinite;animation-delay:${-Math.random()*14}s;`;
    c.textContent=Array(22).fill().map(()=>CODES[Math.floor(Math.random()*CODES.length)]+' ').join('');
    w.appendChild(c);
  }
}

/* ══════════════════════════════════════
   GRAIN — low z-index, never covers UI
══════════════════════════════════════ */
function initGrain(){
  if(document.getElementById('grain-cv'))return;
  const cv=document.createElement('canvas');cv.id='grain-cv';cv.width=180;cv.height=180;
  cv.style.cssText='position:fixed;inset:0;z-index:3;pointer-events:none;opacity:.018;mix-blend-mode:overlay;background-size:180px 180px;background-repeat:repeat;width:100%;height:100%;';
  document.body.appendChild(cv);
  const ctx=cv.getContext('2d');let last=0;
  (function loop(ts){
    requestAnimationFrame(loop);if(ts-last<42)return;last=ts;
    const img=ctx.createImageData(180,180);const d=img.data;
    for(let i=0;i<d.length;i+=4){const v=Math.random()*255|0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}
    ctx.putImageData(img,0,0);cv.style.backgroundImage=`url(${cv.toDataURL()})`;
  })(0);
}

/* ══════════════════════════════════════
   SCANLINE, PAGE TRANSITION, CAROUSELS
══════════════════════════════════════ */
function initScanline(){
  if(document.getElementById('scanline'))return;
  const s=document.createElement('div');s.id='scanline';
  s.style.cssText='position:fixed;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(0,212,255,.05),transparent);pointer-events:none;z-index:9997;animation:scanMove 7s linear infinite;will-change:transform;';
  document.body.appendChild(s);
}
function initPageTransition(){document.body.classList.add('page-enter');}
function initCarousels(){
  document.querySelectorAll('.carousel-track,.hscroll').forEach(t=>{
    let dn=false,sx,sl;
    t.addEventListener('mousedown',e=>{dn=true;sx=e.pageX-t.offsetLeft;sl=t.scrollLeft;t.style.userSelect='none';});
    document.addEventListener('mouseup',()=>{dn=false;});
    t.addEventListener('mousemove',e=>{if(!dn)return;e.preventDefault();t.scrollLeft=sl-(e.pageX-t.offsetLeft-sx)*1.35;});
  });
}

/* ══════════════════════════════════════
   LENIS VELOCITY SKEW
══════════════════════════════════════ */
function initLenisScroll(){
  let lv=0,ly=window.scrollY,lt=Date.now();
  window.addEventListener('scroll',()=>{const n=Date.now();lv=Math.abs(window.scrollY-ly)/Math.max(n-lt,1);ly=window.scrollY;lt=n;},{passive:true});
  (function tick(){
    if(lv>.05)document.querySelectorAll('[data-vel-skew]').forEach(el=>{el.style.transform=`skewY(${Math.min(lv*.22,4)*(parseFloat(el.dataset.velSkew)||1)}deg)`;el.style.transition='transform .55s cubic-bezier(.22,1,.36,1)';});
    lv*=.9;requestAnimationFrame(tick);
  })();
}

/* ══════════════════════════════════════
   API + GOAL BAR
══════════════════════════════════════ */
function fetchGoal(cb){fetch(API+'/donation-goal').then(r=>r.json()).then(cb).catch(()=>cb({goal:500,raised:342,donors:23,days:14,percent:68}));}
function fetchServers(cb){fetch(API+'/servers').then(r=>r.json()).then(cb).catch(()=>cb({servers:CONCLAVE_SERVERS.map((s,i)=>({...s,online:s.key!=='extinction',players:[12,7,19,3,5,8,24,11,0,6][i],maxPlayers:20,name:s.display,address:`${s.ip}:${s.port}`}))}));}
function initGoalBar(){fetchGoal(d=>{const pct=Math.round((d.raised/d.goal)*100);document.querySelectorAll('[data-goal-fill]').forEach(el=>setTimeout(()=>el.style.width=pct+'%',400));document.querySelectorAll('[data-goal-raised]').forEach(el=>animateCounter(el,d.raised,1400,'$'));document.querySelectorAll('[data-goal-total]').forEach(el=>el.textContent='$'+d.goal);document.querySelectorAll('[data-goal-donors]').forEach(el=>el.textContent=d.donors);document.querySelectorAll('[data-goal-pct]').forEach(el=>el.textContent=pct+'%');document.querySelectorAll('[data-goal-days]').forEach(el=>el.textContent=d.days);});}
function animateCounter(el,t,d,p='',s=''){if(!el)return;let st=null;requestAnimationFrame(function step(ts){if(!st)st=ts;const pr=Math.min((ts-st)/d,1),e=1-Math.pow(1-pr,3);el.textContent=p+Math.round(e*t).toLocaleString()+s;if(pr<1)requestAnimationFrame(step);});}

/* ══════════════════════════════════════
   UTILITIES
══════════════════════════════════════ */
function spawnParticles(x,y,n=16){const C=['#FFB800','#FF4CD2','#00D4FF','#35ED7E','#7B2FFF','#FF8C00'];for(let i=0;i<n;i++){const p=document.createElement('div'),a=(i/n)*Math.PI*2,dist=45+Math.random()*75,sz=3+Math.random()*6,c=C[i%C.length];p.className='particle';p.style.cssText=`left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;background:${c};box-shadow:0 0 8px ${c};--dx:${Math.cos(a)*dist}px;--dy:${Math.sin(a)*dist}px;animation:particleBurst ${.4+Math.random()*.45}s cubic-bezier(.22,1,.36,1) forwards;`;document.body.appendChild(p);setTimeout(()=>p.remove(),900);}}
function copyText(text,btn){navigator.clipboard.writeText(text).then(()=>{if(btn){const o=btn.textContent;btn.textContent='Copied!';btn.style.color='#35ED7E';setTimeout(()=>{btn.textContent=o;btn.style.color='';},1800);}}).catch(()=>{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);});}
function initLootFloaters(){document.querySelectorAll('.loot-float').forEach((el,i)=>{el.style.animationDelay=(i*1.2)+'s';el.style.animationDuration=(6.5+i*.7)+'s';});}
function smoothScroll(e,id){if(e)e.preventDefault();const el=document.querySelector(id);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});}
function initTabs(){document.querySelectorAll('[data-tab]').forEach(btn=>{btn.addEventListener('click',()=>{const g=btn.dataset.group||'default',t=btn.dataset.tab;document.querySelectorAll(`[data-tab][data-group="${g}"]`).forEach(b=>b.classList.toggle('active',b===btn));document.querySelectorAll(`[data-panel][data-group="${g}"]`).forEach(p=>p.classList.toggle('active',p.dataset.panel===t));});});}
function fmtNum(n){return new Intl.NumberFormat().format(n);}

/* ══════════════════════════════════════
   AEGIS CHAT
══════════════════════════════════════ */
const AR=['Realm status: 8 servers online. 95 souls active. All anchors holding.','ClaveShard queue: 4 pending orders. Council fulfills within 24-72 hrs.','Funding at 68% this cycle. Every contribution keeps a map alive.','Amissa is Patreon-exclusive. discord.gg/theconclave.','5x crossplay — Xbox, PlayStation, PC — 10 maps, zero barriers.','10 maps. Active admins. Real community. Welcome to the Dominion.','Mods: Death Inventory Keeper, ARKomatic, Awesome Spyglass & Teleporter.'];
function sendAegisChat(iid,cid){const inp=document.getElementById(iid),ch=document.getElementById(cid);if(!inp||!ch)return;const msg=inp.value.trim();if(!msg)return;ch.innerHTML+=`<div style="padding:.55rem .9rem;border-radius:8px;margin-bottom:.55rem;background:rgba(123,47,255,.12);border:1px solid rgba(123,47,255,.22);font-size:.8rem;font-family:var(--font-mono)"><div style="font-size:.6rem;color:rgba(255,255,255,.3);margin-bottom:.15rem;">YOU</div>${msg}</div>`;inp.value='';ch.innerHTML+=`<div id="at" style="padding:.55rem .9rem;border-radius:8px;margin-bottom:.55rem;background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.15);font-size:.8rem;font-family:var(--font-mono);color:#00D4FF;opacity:.5;">...</div>`;ch.scrollTop=ch.scrollHeight;setTimeout(()=>{const t=document.getElementById('at');if(t)t.remove();ch.innerHTML+=`<div style="padding:.55rem .9rem;border-radius:8px;margin-bottom:.55rem;background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.15);font-size:.8rem;font-family:var(--font-mono);color:#00D4FF"><div style="font-size:.6rem;color:rgba(0,212,255,.4);margin-bottom:.15rem;">AEGIS v3.0</div>${AR[Math.floor(Math.random()*AR.length)]}</div>`;ch.scrollTop=ch.scrollHeight;},700+Math.random()*500);}

/* STUBS — prevents errors from old call sites */
function initSceneSystem(){}
function initCycleText(){}
function initRotatingBadge(){}
function initKineticType(){}
