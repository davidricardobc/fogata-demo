const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const mobile = matchMedia('(max-width: 700px)').matches;
const capture = new URLSearchParams(location.search).has('capture');
const fontProbe=document.createElement('canvas').getContext('2d');
fontProbe.font='32px monospace';const fallbackWidth=fontProbe.measureText('FOGATA MMM 123').width;
fontProbe.font='32px Impact, monospace';
if(Math.abs(fontProbe.measureText('FOGATA MMM 123').width-fallbackWidth)<.01)document.documentElement.classList.add('system-display');
function fitSystemHeadings(){
  if(!document.documentElement.classList.contains('system-display'))return;
  document.querySelectorAll('.hero-copy h1,.pizza-copy h2,.drinks-copy h2').forEach(heading=>{
    heading.style.fontSize='';
    let size=parseFloat(getComputedStyle(heading).fontSize);
    const ratio=parseFloat(getComputedStyle(heading).lineHeight)/size;
    while(heading.getBoundingClientRect().height>size*ratio*2.1&&size>26){size-=1;heading.style.fontSize=`${size}px`;}
  });
}
fitSystemHeadings();
addEventListener('resize',fitSystemHeadings,{passive:true});
const hosts = [...document.querySelectorAll('[data-sc-scene]')];
const instances = new Map();
const visible = new Set();
let pending = 0, previousTime = 0;
let pointer = { x:0, y:0 }, easedPointer = { x:0, y:0 };
let staticMode = reduce.matches;
const phaseCopy = {
  burger:[[0,'Todo empieza con buenos ingredientes.'],[.2,'La parrilla pone el carácter.'],[.3,'Cheddar que abraza la carne.'],[.62,'Ahora sí. A dos manos.']],
  pizza:[[0,'Primero, la masa.'],[.1,'Se estira a mano, sin afán.'],[.25,'Una espiral de puro tomate.'],[.44,'Que no falte el queso.'],[.56,'Lo bueno cae por su propio peso.'],[.78,'Y entonces, se prende la fogata.']],
  drink:[[0,'Fresco desde el primer limón.'],[.18,'Cae, salpica y despierta.'],[.42,'Un remolino de puro limón.'],[.7,'Servida bien fría.']]
};
function setStatic(reason) {
  staticMode = true;
  document.documentElement.classList.add('static-mode');
  document.documentElement.classList.remove('motion-ready');
  document.documentElement.dataset.renderMode = reason;
  hosts.forEach(host=>{host.classList.remove('is-ready');host.dataset.scVerifyHold='true';host.dataset.scVerifyState=`poster:${host.dataset.scScene}`;});
  if(!document.documentElement.classList.contains('sc-ready')){
    document.querySelectorAll('.food-act').forEach(act=>{act.dataset.scAct='flow';act.removeAttribute('data-sc-span');});
    ScrollCraft.mount(document.body);
  }
  for(const [type, phrases] of Object.entries(phaseCopy)) document.querySelector(`[data-phase="${type}"]`).textContent=phrases.at(-1)[1];
  cancelAnimationFrame(pending);pending=0;
}
function frame(time) {
  pending=0;if(staticMode||document.hidden)return;
  const elapsed=Math.min(50,time-previousTime||16);previousTime=time;
  const smoothing=1-Math.exp(-elapsed/90);
  easedPointer.x+=(pointer.x-easedPointer.x)*smoothing;
  easedPointer.y+=(pointer.y-easedPointer.y)*smoothing;
  let unsettled=false;
  for(const host of visible){
    const rec=instances.get(host);if(!rec)continue;
    const target=parseFloat(getComputedStyle(rec.act).getPropertyValue('--sc-p'))||0;
    rec.progress+=(target-rec.progress)*(1-Math.exp(-elapsed/(mobile?48:65)));
    if(Math.abs(target-rec.progress)<.0002)rec.progress=target;
    const pointerChanged=Math.abs(rec.x-easedPointer.x)>.0005||Math.abs(rec.y-easedPointer.y)>.0005;
    if(Math.abs(rec.last-rec.progress)>.0001||pointerChanged||rec.dirty){
      const state=rec.scene.render(rec.progress,easedPointer.x,easedPointer.y);
      rec.last=rec.progress;rec.x=easedPointer.x;rec.y=easedPointer.y;rec.dirty=false;
      const phrases=phaseCopy[rec.type];
      if(phrases){
        const line=phrases.filter(([start])=>rec.progress>=start).at(-1)[1];
        document.querySelector(`[data-phase="${rec.type}"]`).textContent=line;
      }
      if(rec.type==='pizza'){
        rec.act.style.setProperty('--oven',state.heat);
        const current=state.step??0;
        rec.act.querySelectorAll('.pizza-process span').forEach((el,i)=>el.classList.toggle('is-current',i===current));
      }
      host.dataset.scVerifyHold=String((rec.type==='drink'?rec.progress>.86:rec.progress>.999)||staticMode);
    }
    if(rec.progress!==target)unsettled=true;
  }
  if(unsettled||Math.abs(pointer.x-easedPointer.x)>.001||Math.abs(pointer.y-easedPointer.y)>.001) wake();
}
function wake(){if(!pending&&!staticMode&&!document.hidden)pending=requestAnimationFrame(frame);}

async function initialize(){
  if(reduce.matches&&!capture){setStatic('reduced-motion');return;}
  let createScene;
  try { ({createScene}=await import('./photo-scenes.js')); }
  catch(error){setStatic('module-unavailable');console.warn('Fogata: versión estática disponible.',error.message);return;}
  document.documentElement.classList.add('motion-ready');
  document.documentElement.dataset.renderMode='photo';
  ScrollCraft.mount(document.body);
  const observer=new IntersectionObserver(entries=>{
    for(const e of entries){const rec=instances.get(e.target);if(!rec)continue;if(e.isIntersecting){visible.add(e.target);rec.dirty=true;}else visible.delete(e.target);}
    wake();
  },{threshold:0});
  const resizeObserver=new ResizeObserver(entries=>{for(const e of entries){const rec=instances.get(e.target);rec?.scene.resize();if(rec)rec.dirty=true;}wake();});
  // Cada escena descarga sus fotos cuando el visitante se acerca (1,5 pantallas
  // antes). Mientras tanto se ve su foto fija. Así la portada abre rápido en datos.
  function build(host){
    if(instances.has(host))return;
    const type=host.dataset.scScene;
    let scene;
    try{scene=createScene(host,type,{mobile,capture,base:'assets'});}catch(error){console.info('Fogata:',error.message);return;}
    const rec={scene,type,act:host.closest('[data-sc-act]'),progress:0,last:-1,x:0,y:0,dirty:true};
    instances.set(host,rec);
    if(capture)(window.fogataScenes??=[]).push(rec);
    observer.observe(host);resizeObserver.observe(host);
    scene.ready.then(()=>{host.classList.add('is-ready');rec.dirty=true;wake();}).catch(error=>{console.warn('Fogata: fotos sin cargar.',error.message);scene.dispose();instances.delete(host);visible.delete(host);});
  }
  const nearby=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){nearby.unobserve(e.target);build(e.target);}},{rootMargin:'150% 0px'});
  hosts.forEach(host=>capture?build(host):nearby.observe(host));
  addEventListener('scroll',()=>{wake();requestAnimationFrame(wake);},{passive:true});
  addEventListener('resize',wake,{passive:true});
  addEventListener('pointermove',e=>{if(!fine.matches)return;pointer.x=e.clientX/innerWidth*2-1;pointer.y=e.clientY/innerHeight*2-1;wake();},{passive:true});
  document.addEventListener('pointerleave',()=>{pointer={x:0,y:0};wake();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(pending);pending=0;}else{for(const rec of instances.values())rec.dirty=true;wake();}});
  window.dispatchEvent(new Event('fogata-ready'));wake();
}

reduce.addEventListener('change',()=>location.reload());
// Native smooth scrolling can leave a newly focused CTA several screens away.
document.addEventListener('focusin',event=>{
  const el=event.target;if(!(el instanceof HTMLElement)||el===document.body)return;
  const r=el.getBoundingClientRect();
  if(r.top<0||r.bottom>innerHeight)el.scrollIntoView({block:'center',behavior:'instant'});
});
const links=[...document.querySelectorAll('.mobile-nav a')];
const sectionObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting)links.forEach(a=>a.setAttribute('aria-current',String(a.hash===`#${e.target.id}`)));},{rootMargin:'-15% 0px -55% 0px'});
document.querySelectorAll('.menu-section,.closing').forEach(s=>sectionObserver.observe(s));
initialize();
