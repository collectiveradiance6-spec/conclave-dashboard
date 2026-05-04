/* ═══════════════════════════════════════════════════════════════
   AEGIS COMPANION v5.0 — LEFT SIDE — Rainbow Particle Human
   700 particles · Typed arrays · Single RAF · No CSS animations
   Canvas additive blending · Zone spring physics · Mouse repulsion
═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const API='https://api.theconclavedominion.com';

/* ─── PAGE CTX ─── */
const PAGES={
  index:    {g:"Welcome to TheConclave Dominion, Survivor. I'm AEGIS — ask me anything.",q:['How do I join the servers?','What are the server rates?','Tell me about ClaveShard','Which map is best to start?']},
  ark:      {g:"You're on the ARK page. Ask me about maps, rates, mods, or how to connect.",q:['What maps do you run?','How do I connect?','What are the rates?','Is there PvP?']},
  minecraft:{g:"Bedrock server is live. Need the IP or setup help?",q:["What's the server IP?",'Bedrock only?','Any plugins?','How many players?']},
  donations:{g:"Your support keeps all 10 servers running. I'll walk you through your options.",q:['What do I get?','Tell me about Patreon','What is Amissa?','CashApp info']},
  nitrado:  {g:"Our Nitrado affiliate link supports the Dominion directly.",q:['What is Nitrado?','Does this support you?','ARK server setup?','Any discount?']},
  MeetTheConclave:{g:"Meet the Council — 12 members who built and run the Dominion.",q:['Who leads?','What is the Council?','How do I join?','Tell me about AEGIS']},
};
const _pk=window.location.pathname.split('/').pop().replace('.html','');
const PG=PAGES[_pk]||PAGES.index;

const IDLE=["Ask me anything, Survivor...","10 maps. All platforms. I know them all.","Need help? I'm always watching.","The Dominion never sleeps. Neither do I.","Tap to talk to your guide.","ClaveShard questions? Come find me.","What are you looking for?"];
const THINK=["Consulting the archives...","Scanning the Dominion...","Reaching into the void...","One moment, Survivor..."];

/* ─── CANVAS ─── */
const CW=170,CH=250;   // canvas size (overflow for aura)
const BCX=85,BCY=242;  // body base center in canvas

/* ─── ZONES (local coords: 0,0 = feet, y negative = up) ─── */
const Z=[
  // [cx,  cy,    rx, ry,  w,   eye]
  [  0, -190,  18, 20, .09, 0], // 0  head
  [  0, -165,   5,  7, .03, 0], // 1  neck
  [  0, -138,  18, 23, .18, 0], // 2  chest
  [  0, -108,  14, 16, .12, 0], // 3  abdomen
  [-30, -138,   9, 19, .08, 0], // 4  L upper arm
  [-36, -110,   6, 13, .06, 0], // 5  L forearm
  [ 30, -138,   9, 19, .08, 0], // 6  R upper arm
  [ 36, -110,   6, 13, .06, 0], // 7  R forearm
  [-10,  -72,   9, 25, .09, 0], // 8  L thigh
  [ 10,  -72,   9, 25, .09, 0], // 9  R thigh
  [-10,  -36,   7, 19, .07, 0], // 10 L shin
  [ 10,  -36,   7, 19, .07, 0], // 11 R shin
  [-38,  -96,   5,  5, .03, 0], // 12 L hand
  [ 38,  -96,   5,  5, .03, 0], // 13 R hand
  [ -7, -194,   4,  3, .01, 1], // 14 L eye
  [  7, -194,   4,  3, .01, 1], // 15 R eye
];

// cumulative weights
const TW=Z.reduce((s,z)=>s+z[4],0);
let _acc=0;
const CUM=Z.map(z=>{_acc+=z[4]/TW;return _acc;});
function rz(){const r=Math.random();for(let i=0;i<CUM.length;i++)if(r<CUM[i])return i;return 0;}

/* ─── PARTICLE POOL (typed arrays — no GC pressure) ─── */
const N=700;
const PX  =new Float32Array(N);  // local x
const PY  =new Float32Array(N);  // local y
const VX  =new Float32Array(N);  // velocity x
const VY  =new Float32Array(N);  // velocity y
const PHUE=new Float32Array(N);  // hue offset
const PSZ =new Float32Array(N);  // size
const PAL =new Float32Array(N);  // alpha
const PZI =new Uint8Array(N);    // zone index
const PESC=new Float32Array(N);  // escape 0-1

function initP(i,zi){
  const z=Z[zi];
  const a=Math.random()*Math.PI*2;
  const r=Math.sqrt(Math.random());
  PX[i]  = z[0]+Math.cos(a)*z[2]*r;
  PY[i]  = z[1]+Math.sin(a)*z[3]*r;
  VX[i]  = (Math.random()-.5)*.5;
  VY[i]  = (Math.random()-.5)*.5;
  PHUE[i]= Math.random()*360;
  PSZ[i] = z[5]? 2.5+Math.random() : Math.random()*2.2+.7;
  PAL[i] = z[5]? .9+Math.random()*.1 : Math.random()*.65+.3;
  PZI[i] = zi;
  PESC[i]= 0;
}
for(let i=0;i<N;i++) initP(i,rz());

/* ─── BUILD DOM ─── */
const css=document.createElement('style');
css.textContent=`
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Exo+2:ital,wght@0,300;0,400;0,500;1,300&display=swap');
#_ac{position:fixed;bottom:0;left:20px;z-index:9990;pointer-events:none;display:flex;flex-direction:column;align-items:center;}
#_acC{display:block;cursor:pointer;pointer-events:all;filter:drop-shadow(0 0 12px rgba(123,47,255,.4));}
#_acC:hover{filter:drop-shadow(0 0 20px rgba(123,47,255,.7));}
#_acB{position:absolute;bottom:${CH-20}px;left:-4px;background:rgba(4,5,18,.97);border:1px solid rgba(123,47,255,.4);border-radius:14px;border-bottom-left-radius:3px;padding:10px 13px;min-width:190px;max-width:255px;pointer-events:none;opacity:0;transform:translateY(8px) scale(.95);transform-origin:bottom left;transition:opacity .22s,transform .22s cubic-bezier(.34,1.4,.64,1);box-shadow:0 8px 40px rgba(0,0,0,.78);backdrop-filter:blur(20px);}
#_acB.s{opacity:1;transform:none;}
#_acB::after{content:'';position:absolute;bottom:-6px;left:14px;width:10px;height:10px;background:rgba(4,5,18,.97);border-left:1px solid rgba(123,47,255,.4);border-bottom:1px solid rgba(123,47,255,.4);transform:rotate(-45deg);}
#_acBN{font-family:'Orbitron',monospace;font-size:.56rem;color:rgba(196,181,253,.5);letter-spacing:.1em;margin-bottom:4px;}
#_acBT{font-family:'Exo 2',sans-serif;font-size:.74rem;color:rgba(255,255,255,.82);line-height:1.5;}
#_acBP{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px;}
.acp{font-family:'Exo 2',sans-serif;font-size:.62rem;color:rgba(196,181,253,.75);background:rgba(123,47,255,.12);border:1px solid rgba(123,47,255,.25);border-radius:20px;padding:3px 9px;cursor:pointer;pointer-events:all;transition:all .14s;white-space:nowrap;}
.acp:hover{background:rgba(123,47,255,.25);color:#c4b5fd;}
#_acN{position:absolute;top:10px;left:0;width:12px;height:12px;border-radius:50%;background:#ff4cd2;border:2px solid #000;box-shadow:0 0 8px rgba(255,76,210,.8);display:none;animation:_acnp .3s cubic-bezier(.34,1.56,.64,1);}
@keyframes _acnp{from{transform:scale(0)}to{transform:scale(1)}}
#_acP{position:fixed;bottom:${CH+10}px;left:16px;width:335px;max-height:460px;background:rgba(4,6,18,.98);border:1px solid rgba(123,47,255,.3);border-radius:18px;display:flex;flex-direction:column;pointer-events:all;opacity:0;transform:translateY(16px) scale(.96);transform-origin:bottom left;transition:opacity .26s cubic-bezier(.4,0,.2,1),transform .26s cubic-bezier(.34,1.2,.64,1);box-shadow:0 0 0 1px rgba(123,47,255,.1),0 30px 70px rgba(0,0,0,.88);backdrop-filter:blur(28px);z-index:9989;visibility:hidden;}
#_acP.o{opacity:1;transform:none;visibility:visible;}
#_acPH{padding:13px 15px 11px;background:rgba(123,47,255,.07);border-bottom:1px solid rgba(123,47,255,.15);display:flex;align-items:center;gap:9px;flex-shrink:0;}
#_acPAV{width:34px;height:34px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 38% 35%,rgba(196,181,253,.25),rgba(123,47,255,1) 55%,rgba(8,2,25,1));border:1.5px solid rgba(123,47,255,.5);box-shadow:0 0 12px rgba(123,47,255,.5);display:flex;align-items:center;justify-content:center;font-size:14px;}
#_acPN{font-family:'Orbitron',monospace;font-size:.69rem;font-weight:700;color:#c4b5fd;letter-spacing:.07em;}
#_acPS{font-family:'Exo 2',sans-serif;font-size:.62rem;color:rgba(255,255,255,.34);margin-top:1px;}
#_acPC{margin-left:auto;width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);color:rgba(255,255,255,.3);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .17s;flex-shrink:0;}
#_acPC:hover{background:rgba(255,255,255,.1);color:#fff;}
#_acM{flex:1;overflow-y:auto;padding:13px 11px 7px;display:flex;flex-direction:column;gap:9px;scrollbar-width:thin;scrollbar-color:rgba(123,47,255,.2) transparent;}
#_acM::-webkit-scrollbar{width:3px;}
#_acM::-webkit-scrollbar-thumb{background:rgba(123,47,255,.25);border-radius:3px;}
.acm{display:flex;gap:7px;animation:_acmi .2s ease-out;}
@keyframes _acmi{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
.acm.u{flex-direction:row-reverse;}
.acmav{width:25px;height:25px;border-radius:50%;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:11px;}
.acm.b .acmav{background:radial-gradient(circle at 38% 35%,rgba(196,181,253,.2),rgba(123,47,255,1) 55%,rgba(8,2,25,1));border:1px solid rgba(123,47,255,.4);box-shadow:0 0 7px rgba(123,47,255,.4);}
.acm.u .acmav{background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.18);color:rgba(0,212,255,.7);font-size:9px;}
.acbb{max-width:80%;padding:8px 12px;border-radius:13px;font-family:'Exo 2',sans-serif;font-size:.77rem;line-height:1.55;color:rgba(255,255,255,.84);}
.acm.b .acbb{background:rgba(123,47,255,.1);border:1px solid rgba(123,47,255,.18);border-bottom-left-radius:3px;}
.acm.u .acbb{background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.16);border-bottom-left-radius:3px;color:rgba(255,255,255,.68);}
.acd{display:flex;gap:4px;align-items:center;}
.acd span{width:5px;height:5px;border-radius:50%;background:rgba(123,47,255,.65);animation:_acdot 1.1s ease-in-out infinite;}
.acd span:nth-child(2){animation-delay:.18s}.acd span:nth-child(3){animation-delay:.36s}
@keyframes _acdot{0%,80%,100%{transform:scale(.7);opacity:.35}40%{transform:scale(1.3);opacity:1}}
#_acQ{padding:5px 10px;display:flex;gap:5px;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.04);flex-shrink:0;}
.acqr{font-family:'Exo 2',sans-serif;font-size:.62rem;color:rgba(196,181,253,.68);background:rgba(123,47,255,.09);border:1px solid rgba(123,47,255,.18);border-radius:20px;padding:3px 8px;cursor:pointer;transition:all .13s;white-space:nowrap;}
.acqr:hover{background:rgba(123,47,255,.2);color:#c4b5fd;}
#_acIR{display:flex;gap:7px;padding:8px 11px 12px;flex-shrink:0;}
#_acI{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 11px;color:#fff;font-family:'Exo 2',sans-serif;font-size:.77rem;outline:none;resize:none;height:36px;min-height:36px;max-height:78px;overflow-y:auto;line-height:1.4;transition:border-color .17s;}
#_acI::placeholder{color:rgba(255,255,255,.2);}
#_acI:focus{border-color:rgba(123,47,255,.42);}
#_acS{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#7b2fff,#00d4ff);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .17s,box-shadow .17s;flex-shrink:0;}
#_acS:hover{transform:scale(1.07);box-shadow:0 0 16px rgba(123,47,255,.55);}
#_acS:active{transform:scale(.93);}
#_acS.busy{opacity:.4;cursor:not-allowed;}
#_acS svg{width:15px;height:15px;fill:#fff;}
@media(max-width:500px){#_ac{left:8px;}#_acP{left:4px;width:calc(100vw - 8px);}}
`;
document.head.appendChild(css);

const root=document.createElement('div');
root.id='_ac';
root.innerHTML=`
  <div id="_acN"></div>
  <div id="_acB">
    <div id="_acBN">CONCLAVE AEGIS</div>
    <div id="_acBT"></div>
    <div id="_acBP"></div>
  </div>
  <canvas id="_acC" width="${CW}" height="${CH}"></canvas>`;
document.body.appendChild(root);

const pnl=document.createElement('div');
pnl.id='_acP';
pnl.innerHTML=`
  <div id="_acPH">
    <div id="_acPAV">👁</div>
    <div><div id="_acPN">CONCLAVE AEGIS</div><div id="_acPS">Community Guide · ${PG.g.split(' ')[0]}</div></div>
    <div id="_acPC" onclick="window.__ag.close()">✕</div>
  </div>
  <div id="_acM"></div>
  <div id="_acQ"></div>
  <div id="_acIR">
    <textarea id="_acI" placeholder="Ask me anything..." rows="1"></textarea>
    <button id="_acS" onclick="window.__ag.send()">
      <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
    </button>
  </div>`;
document.body.appendChild(pnl);

/* ─── CANVAS CTX ─── */
const cv=document.getElementById('_acC');
const cx=cv.getContext('2d',{alpha:true,willReadFrequently:false});

/* ─── REFS ─── */
const bbl=document.getElementById('_acB');
const bbt=document.getElementById('_acBT');
const bbp=document.getElementById('_acBP');
const nDot=document.getElementById('_acN');
const msgs=document.getElementById('_acM');
const qrow=document.getElementById('_acQ');
const inp=document.getElementById('_acI');
const sbtn=document.getElementById('_acS');
const psub=document.getElementById('_acPS');

/* ─── STATE ─── */
let isOpen=false,isBusy=false,hist=[],idleTmr=null,idleI=0;
let mood='idle'; // idle|thinking|talking|excited
let gHue=0; // global hue offset (degrees/sec * dt)
let mouseX=9999,mouseY=9999; // screen space mouse
let t=0,dt=0,lastT=0;
let twTmr=null;
let hideTmr=null;

/* ─── MOOD PHYSICS PARAMS ─── */
const MOOD_P={
  idle:     {spring:.018,damp:.88,noise:.25,esc:.0008,hueSpd:40},
  thinking: {spring:.022,damp:.85,noise:.6, esc:.002, hueSpd:80},
  talking:  {spring:.016,damp:.84,noise:.8, esc:.003, hueSpd:120},
  excited:  {spring:.02, damp:.82,noise:1.2,esc:.006, hueSpd:200},
};

/* ─── BODY ANIMATION ─── */
let floatY=0,floatX=0,sway=0,breathe=1,armSwing=0;
let bodyY=0,bodyYv=0,bodyR=0,bodyRv=0;
const bodyTargets={y:0,r:0};

/* ─── TYPEWRITER ─── */
function tw(el,text,spd=22){
  clearTimeout(twTmr);
  el.innerHTML='';
  let i=0;
  const cur=document.createElement('span');
  cur.style.cssText='display:inline-block;width:2px;height:.85em;background:rgba(196,181,253,.7);vertical-align:text-bottom;margin-left:1px;animation:_cur .65s step-end infinite;';
  if(!document.getElementById('_cur_kf')){
    const ks=document.createElement('style');
    ks.id='_cur_kf';
    ks.textContent='@keyframes _cur{0%,100%{opacity:1}50%{opacity:0}}';
    document.head.appendChild(ks);
  }
  function tick(){
    if(i<text.length){el.textContent=text.slice(0,++i);el.appendChild(cur);twTmr=setTimeout(tick,spd+Math.random()*10);}
    else setTimeout(()=>cur.remove(),1500);
  }
  tick();
}

/* ─── BUBBLE ─── */
function showB(text,pills=[],keep=false){
  clearTimeout(hideTmr);
  bbp.innerHTML=pills.map(p=>`<div class="acp" onclick="window.__ag.qs('${p.replace(/'/g,"\\'")}');document.getElementById('_acB').classList.remove('s')">${p}</div>`).join('');
  tw(bbt,text);
  bbl.classList.add('s');
  nDot.style.display='none';
  if(!keep) hideTmr=setTimeout(()=>bbl.classList.remove('s'),8500);
}
function hideB(){clearTimeout(hideTmr);bbl.classList.remove('s');}
function thinkB(){bbt.innerHTML='<div class="acd"><span></span><span></span><span></span></div>';bbp.innerHTML='';bbl.classList.add('s');}

/* ─── IDLE CYCLE ─── */
function schedIdle(){
  clearTimeout(idleTmr);
  idleTmr=setTimeout(()=>{
    if(!isOpen){showB(IDLE[idleI++%IDLE.length]);schedIdle();}
  },9000+Math.random()*6000);
}

/* ─── PANEL ─── */
function openP(){
  isOpen=true;pnl.classList.add('o');hideB();nDot.style.display='none';
  clearTimeout(idleTmr);setMood('excited');
  setTimeout(()=>setMood('talking'),700);
  if(!msgs.children.length){
    setTimeout(()=>{addM(PG.g,'b');rqr(PG.q);setTimeout(()=>setMood('idle'),2500);},250);
  }
  setTimeout(()=>inp.focus(),320);
}
function closeP(){isOpen=false;pnl.classList.remove('o');setMood('idle');schedIdle();}

cv.addEventListener('click',()=>{
  if(isOpen){closeP();return;}
  if(bbl.classList.contains('s')){openP();return;}
  setMood('excited');showB(PG.g,PG.q.slice(0,3),true);
  setTimeout(()=>setMood('idle'),1000);
  nDot.style.display='none';
  setTimeout(()=>{if(!isOpen)bbl.classList.remove('s');},8000);
});

/* ─── MESSAGES ─── */
function addM(text,role){
  const d=document.createElement('div');
  d.className=`acm ${role==='b'?'b':'u'}`;
  d.innerHTML=`<div class="acmav">${role==='b'?'👁':'⚔'}</div><div class="acbb">${text}</div>`;
  msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;
}
function addThk(){
  const d=document.createElement('div');d.id='_acTK';d.className='acm b';
  d.innerHTML='<div class="acmav">👁</div><div class="acbb"><div class="acd"><span></span><span></span><span></span></div></div>';
  msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;
}
function rmThk(){document.getElementById('_acTK')?.remove();}
function rqr(arr){qrow.innerHTML=arr.map(q=>`<div class="acqr" onclick="window.__ag.qs('${q.replace(/'/g,"\\'")}');document.getElementById('_acQ').innerHTML=''">${q}</div>`).join('');}

/* ─── MOOD ─── */
function setMood(m){
  mood=m;
  if(m==='excited'){ bodyTargets.y=-12; bodyTargets.r=0; }
  else if(m==='thinking'){ bodyTargets.y=-4; bodyTargets.r=3; }
  else if(m==='talking'){ bodyTargets.y=-6; bodyTargets.r=0; }
  else { bodyTargets.y=0; bodyTargets.r=0; }
}

/* ─── SEND ─── */
async function send(text){
  const msg=(text||inp.value).trim();
  if(!msg||isBusy)return;
  inp.value='';inp.style.height='36px';qrow.innerHTML='';
  addM(msg,'u');hist.push({role:'user',content:msg});
  if(hist.length>20)hist=hist.slice(-20);
  isBusy=true;sbtn.classList.add('busy');setMood('thinking');addThk();
  if(!isOpen)thinkB();
  if(psub)psub.textContent=THINK[Math.floor(Math.random()*THINK.length)];
  try{
    const r=await fetch(`${API}/api/aegis/chat`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:msg,history:hist.slice(-8),context:'community',
        system:`You are AEGIS — spectral AI guardian of TheConclave Dominion. 5x crossplay ARK:SA, 10 maps: Island, Volcano, Extinction, Center, Lost Colony, Astraeos, Valguero, Scorched Earth, Aberration(PvP), Amissa(Patreon). Rates: 5x XP/Harvest/Taming/Breeding, 1M weight, no fall damage, max dino 350. Mods: Death Inv Keeper, ARKomatic, Awesome Spyglass, Teleporter. ClaveShard economy. CashApp $TheConclaveDominion. Patreon: patreon.com/theconclavedominion. Minecraft Bedrock: 134.255.214.44:10090. Discord: discord.gg/theconclave. Be warm, concise (2-3 sentences), subtly mystical.`}),
      signal:AbortSignal.timeout(15000)
    });
    rmThk();hideB();
    if(!r.ok)throw new Error(''+r.status);
    const d=await r.json();
    const rep=d.response||d.message||d.reply||"The archives are quiet. Try again shortly, Survivor.";
    addM(rep,'b');hist.push({role:'assistant',content:rep});
    setMood('talking');
    if(!isOpen)showB(rep.slice(0,110)+(rep.length>110?'...':''));
    rqr(gqr(msg));
    setTimeout(()=>setMood('idle'),2500);
    if(psub)psub.textContent='Community Guide';
  }catch(e){
    rmThk();hideB();
    addM(e.name==='TimeoutError'?"The void is slow tonight. Try once more, Survivor.":"Connection faltered. Try again shortly.",'b');
    setMood('idle');if(psub)psub.textContent='Community Guide';
  }
  isBusy=false;sbtn.classList.remove('busy');
}
function gqr(q){
  const l=q.toLowerCase();
  if(/join|connect|server|ip/.test(l))return['What are the IPs?','Is it crossplay?','Which map for beginners?'];
  if(/rate|xp|harvest|tame/.test(l))return['What mods do you run?','Is there PvP?','Tell me about Aberration'];
  if(/shard|wallet|economy/.test(l))return['How do I earn shards?','What can I buy?','Check my balance'];
  if(/patreon|amissa|donate/.test(l))return["What's in Patreon?",'Tell me about Amissa','Other ways to support?'];
  return['How do I join?','Tell me more','Discord link?'];
}
inp.addEventListener('input',function(){this.style.height='36px';this.style.height=Math.min(this.scrollHeight,78)+'px';});
inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});

/* ─── MOUSE TRACKING (screen→canvas→local) ─── */
document.addEventListener('mousemove',e=>{
  const rect=cv.getBoundingClientRect();
  mouseX=e.clientX-rect.left-BCX;
  mouseY=e.clientY-rect.top-BCY;
},{passive:true});

/* ─── NOISE (fast deterministic pseudo-random for velocity jitter) ─── */
const NB=512,NT=new Float32Array(NB);
for(let i=0;i<NB;i++)NT[i]=(Math.random()-.5)*2;
let ni=0;
function noise(){return NT[(ni++)&(NB-1)];}

/* ─── MAIN RAF LOOP ─── */
function loop(now){
  requestAnimationFrame(loop);
  dt=Math.min((now-lastT)*.001,.05);lastT=now;t+=dt;

  // Global hue
  const MP=MOOD_P[mood]||MOOD_P.idle;
  gHue=(gHue+MP.hueSpd*dt)%360;

  // Body physics
  bodyYv+=(bodyTargets.y-bodyY)*0.12;
  bodyYv*=0.78;
  bodyY+=bodyYv;
  bodyRv+=(bodyTargets.r-bodyR)*0.1;
  bodyRv*=0.8;
  bodyR+=bodyRv;

  // Float oscillation
  const fy=Math.sin(t*1.05)*8+bodyY;
  const fr=Math.sin(t*0.65)*1.5+bodyR;
  const breathX=1+Math.sin(t*1.4)*.013;

  // Clear
  cx.clearRect(0,0,CW,CH);

  // Draw aura glow ring behind character
  const ag=cx.createRadialGradient(BCX,BCY-100,20,BCX,BCY-100,70);
  ag.addColorStop(0,`hsla(${gHue},100%,60%,.04)`);
  ag.addColorStop(1,'transparent');
  cx.fillStyle=ag;
  cx.fillRect(0,0,CW,CH);

  // Apply body transform
  cx.save();
  cx.translate(BCX,BCY+fy);
  cx.rotate(fr*Math.PI/180);
  cx.scale(breathX,1);

  // Particle update + draw in two passes (glow pass then core pass)
  cx.globalCompositeOperation='lighter';

  // PASS 1: glow halos (larger, dim)
  for(let i=0;i<N;i++){
    const zi=PZI[i];
    const z=Z[zi];
    const isEye=z[5]===1;

    // Spring toward zone center
    const tx=z[0],ty=z[1];
    const dx=tx-PX[i],dy=ty-PY[i];
    VX[i]+=dx*MP.spring;
    VY[i]+=dy*MP.spring;

    // Noise jitter
    VX[i]+=noise()*MP.noise*dt*20;
    VY[i]+=noise()*MP.noise*dt*20;

    // Arm/leg mood bias
    if(mood==='talking'&&(zi>=4&&zi<=7)){
      VX[i]+=noise()*2*dt*20;
      VY[i]+=noise()*1*dt*20;
    }
    if(mood==='excited'){
      VY[i]-=.8*dt*20; // particles rise when excited
    }

    // Mouse repulsion (in body-local space)
    // Convert mouseX/Y from screen to local (approximate — ignore rotation)
    const mdx=PX[i]-mouseX,mdy=PY[i]-mouseY;
    const md2=mdx*mdx+mdy*mdy;
    if(md2<900&&md2>0){
      const mf=18/md2;
      VX[i]+=mdx*mf;
      VY[i]+=mdy*mf;
    }

    // Damping
    VX[i]*=MP.damp;
    VY[i]*=MP.damp;

    // Escape mechanic
    if(PESC[i]>0){
      PESC[i]+=dt*1.8;
      PX[i]+=VX[i]+(PX[i]-tx)*0.05;
      PY[i]+=VY[i]+(PY[i]-ty)*0.05;
      if(PESC[i]>=1){ initP(i,rz()); continue; }
    } else {
      PX[i]+=VX[i];
      PY[i]+=VY[i];
      if(Math.random()<MP.esc) PESC[i]=0.01;
    }

    // Color
    // Map zone y to body position 0 (feet) - 1 (head)
    const bodyPos=(ty+200)/200;
    const h=(gHue + bodyPos*240 + PHUE[i])%360;
    const baseAlpha=(isEye?0.9:PAL[i])*(PESC[i]>0?1-PESC[i]:1);
    const sz=PSZ[i];

    // Glow halo
    if(isEye){
      cx.fillStyle=`hsla(190,100%,85%,${baseAlpha*.3})`;
    } else {
      cx.fillStyle=`hsla(${h},100%,65%,${baseAlpha*.25})`;
    }
    cx.beginPath();
    cx.arc(PX[i],PY[i],sz*2.2,0,Math.PI*2);
    cx.fill();
  }

  // PASS 2: particle cores (bright, small)
  for(let i=0;i<N;i++){
    const zi=PZI[i];
    const z=Z[zi];
    const isEye=z[5]===1;
    const bodyPos=(z[1]+200)/200;
    const h=(gHue+bodyPos*240+PHUE[i])%360;
    const baseAlpha=(isEye?1:PAL[i])*(PESC[i]>0?1-PESC[i]:1);
    const sz=PSZ[i];
    const brightness=isEye?98:72;

    cx.fillStyle=`hsla(${isEye?190:h},${isEye?20:100}%,${brightness}%,${baseAlpha})`;
    cx.beginPath();
    cx.arc(PX[i],PY[i],sz*.85,0,Math.PI*2);
    cx.fill();
  }

  // Eye highlight sparkles (tiny white cores)
  cx.fillStyle='rgba(255,255,255,.95)';
  cx.globalCompositeOperation='lighter';
  for(const zi of [14,15]){
    const z=Z[zi];
    cx.beginPath();
    cx.arc(z[0]+Math.sin(t*3)*.5,z[1]+Math.cos(t*2)*.3,1.8,0,Math.PI*2);
    cx.fill();
  }

  cx.globalCompositeOperation='source-over';

  // Floor shadow/glow
  const sg=cx.createRadialGradient(0,0,0,0,0,22);
  sg.addColorStop(0,`hsla(${gHue},100%,50%,.18)`);
  sg.addColorStop(1,'transparent');
  cx.fillStyle=sg;
  const shadowScale=0.8+Math.sin(t*1.05)*0.12;
  cx.save();
  cx.scale(shadowScale,0.25);
  cx.beginPath();
  cx.arc(0,0,22,0,Math.PI*2);
  cx.fill();
  cx.restore();

  cx.restore(); // end body transform

  // Scan line sweep across full canvas (subtle UI element)
  const scanY=(t*60)%CH;
  const scanAlpha=0.015+Math.sin(t*4)*0.005;
  cx.fillStyle=`rgba(196,181,253,${scanAlpha})`;
  cx.fillRect(0,scanY,CW,1);
}

requestAnimationFrame(t=>{lastT=t;loop(t);});

/* ─── EXPOSE ─── */
window.__ag={open:openP,close:closeP,toggle:()=>isOpen?closeP():openP(),send,qs:(t)=>{inp.value=t;send(t);}};

/* ─── INIT ─── */
setTimeout(()=>{if(!isOpen)nDot.style.display='block';},5000);
setTimeout(()=>{
  if(!isOpen){setMood('excited');showB(PG.g,PG.q.slice(0,2));setTimeout(()=>setMood('idle'),1000);}
},4500);
schedIdle();

})();
