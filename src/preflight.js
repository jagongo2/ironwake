// The hangar owns its UI and transitions; combat stays in the original game module.
import {createLeverView} from './lever-view.js';
import {createLeverMotion} from './lever-motion.js';
export function createPreflight() {
  const root = document.createElement('section');
  root.id = 'preflight';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '출격 전 정비');
  root.innerHTML = `
    <p class="hangar-loading" role="status">격납고 차폐문 구동 중<span>HANGAR / STAND BY</span></p>
    <div class="hangar-shutter" aria-hidden="true"><div class="shutter-mark"><span>SECTOR 07</span><strong>STAND CLEAR</strong><small>격납고 차폐문 · H-04</small></div></div>
    <div class="service-console" hidden>
      <header class="service-heading"><h2>출격 전 정비</h2></header>
      <button class="hangar-return" type="button">ESC / 복귀</button>
      <div class="service-switches" aria-label="출격 전 계통 점검">
        <button class="system-switch" type="button" aria-pressed="false" data-system="engine"><span><small>01 / POWER</small><strong>기관 예열</strong></span><i class="switch-led"></i><span class="switch-rocker" aria-hidden="true"><i></i></span></button>
        <button class="system-switch" type="button" aria-pressed="false" data-system="hydraulics"><span><small>02 / HYDRAULICS</small><strong>유압 가압</strong></span><i class="switch-led"></i><span class="switch-rocker" aria-hidden="true"><i></i></span></button>
        <button class="system-switch" type="button" aria-pressed="false" data-system="weapons"><span><small>03 / ARMAMENT</small><strong>무장 점검</strong></span><i class="switch-led"></i><span class="switch-rocker" aria-hidden="true"><i></i></span></button>
      </div>
      <div class="service-interlock"><i></i><span>안전 잠금 / 계통 점검 0 / 3</span></div>
      <div class="launch-mechanism">
        <button class="launch-lever" type="button" aria-label="출격 레버: 아래로 당기거나 Enter로 출격" aria-describedby="lever-hint" disabled><canvas class="lever-canvas" aria-hidden="true"></canvas><span class="lever-grip-hit" aria-hidden="true"></span></button>
        <p id="lever-hint">세 계통을 점검한 뒤 레버를 아래로 당기세요. Enter로도 출격할 수 있습니다.</p>
      </div>
      <div class="service-crt">
        <div class="crt-readout"><div class="crt-topline"><span>K-17 / SYSTEM DIAGNOSTICS</span><span class="crt-signal">● LINK</span></div><h3>출격 승인 대기</h3><p class="crt-subtitle">PRE-FLIGHT SYSTEM CHECK</p>
          <div class="ship-diagnostic"><div class="diagnostic-grid"></div><img class="service-ship" draggable="false" alt="K-17 함선 측면"><span class="ship-callout callout-engine">THRUST / STANDBY</span><span class="ship-callout callout-hull">HULL INTEGRITY / 100%</span></div>
          <div class="crt-systems"><span data-readout="engine">기관 · 대기</span><span data-readout="hydraulics">유압 · 대기</span><span data-readout="weapons">무장 · 대기</span></div>
          <p class="service-log" role="status" aria-live="polite">좌측 스위치로 세 계통의 점검을 완료하십시오.</p><div class="crt-bottomline"><span>SECTOR 07 / 잿빛 회랑</span><span class="check-count">CHECK 00 / 03</span></div>
        </div><div class="crt-grain" aria-hidden="true"></div>
      </div>
      <div class="service-reserves"><div><small>FUEL RESERVE</small><strong>100<span>%</span></strong><i></i></div><div><small>57 mm / MAGAZINE</small><strong>READY</strong><i></i></div><div><small>180 mm / BREECH</small><strong>LOCKED</strong><i></i></div></div>
      <div class="hangar-serial">IW / K17<br><span>FLIGHT DECK 04</span></div>
    </div>`;
  document.getElementById('stage').appendChild(root);
  const shutter = root.querySelector('.hangar-shutter');
  const consolePanel = root.querySelector('.service-console');
  const lever = root.querySelector('.launch-lever');
  const switches = [...root.querySelectorAll('.system-switch')];
  const returnButton = root.querySelector('.hangar-return');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let phase = 'idle', callbacks, generation = 0, dragging = null;
  const animations = new Set(), restoredInert = new Map();
  const labels = {engine: '기관', hydraulics: '유압', weapons: '무장'};
  const messages = {engine: '기관 예열 완료. 추력 응답 정상.', hydraulics: '유압 가압 완료. 착륙장치와 조종 계통 정상.', weapons: '급탄·약실 점검 완료. 무장 안전 확인.'};

  // A tiny deterministic texture is uploaded once, never generated per frame.
  const noise = document.createElement('canvas');noise.width = noise.height = 96;
  const noiseContext = noise.getContext('2d'), pixels = noiseContext.createImageData(96, 96);
  let seed = 3741;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = seed >>> 24;
    pixels.data[i + 3] = 35;
  }
  noiseContext.putImageData(pixels, 0, 0);
  root.querySelector('.crt-grain').style.backgroundImage = `url(${noise.toDataURL()})`;

  const assets = ['shutter', 'console'].map(name => {
    const image = new Image();image.src = new URL(`../assets/hangar/${name}-v1.png`, import.meta.url).href;
    return image.decode().catch(() => {});
  });
  const setPhase = value => {phase = value;root.dataset.phase = value;};
  const sound = (kind,detail) => callbacks?.sound?.(kind,detail);
  const reduceMotion = () => motion.matches || callbacks?.motion === false;
  const gripHit = root.querySelector('.lever-grip-hit');
  const leverView = createLeverView(root.querySelector('.lever-canvas'),box=>{
    Object.assign(gripHit.style,{left:`${box.left*100}%`,top:`${box.top*100}%`,width:`${box.width*100}%`,height:`${box.height*100}%`});
  });
  const leverMotion = createLeverMotion({
    onUpdate:value=>leverView.render(value,!lever.disabled),
    onDetent:()=>sound('detent'),onStop:kind=>{panelRecoil(kind);sound(kind==='latch'?'lever':'lever-home');},reduced:reduceMotion
  });
  function panelRecoil(kind){
    if(reduceMotion()||root.hidden)return;
    const strength=kind==='latch'?1:.35;
    const animation=consolePanel.animate([
      {translate:'0 0',offset:0},{translate:`${strength}px ${strength*2.4}px`,offset:.09},
      {translate:`${-strength}px ${-strength*1.4}px`,offset:.28},{translate:`${strength*.5}px ${strength*.6}px`,offset:.58},{translate:'0 0',offset:1}
    ],{duration:210,easing:'cubic-bezier(.2,.7,.3,1)'});
    animations.add(animation);animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));
  }
  gripHit.addEventListener('pointerenter',()=>leverView.render(leverMotion.position,!lever.disabled,true));
  gripHit.addEventListener('pointerleave',()=>leverView.render(leverMotion.position,!lever.disabled,false));
  async function animate(element, keyframes, duration, easing = 'ease') {
    const animation = element.animate(keyframes, {duration: reduceMotion() ? Math.min(duration, 100) : duration, easing, fill: 'forwards'});
    animations.add(animation);
    try {await animation.finished;animation.commitStyles();} catch {} finally {animation.cancel();animations.delete(animation);}
  }
  function isolate(enabled) {
    if (enabled) {
      for (const id of ['game', 'overlay', 'settings', 'pauseMenu']) {
        const element = document.getElementById(id);
        restoredInert.set(element, element.inert);element.inert = true;
      }
    } else {
      for (const [element, previous] of restoredInert) element.inert = previous;
      restoredInert.clear();
    }
  }
  function updateChecks(changed) {
    const active = switches.filter(button => button.getAttribute('aria-pressed') === 'true');
    const ready = active.length === switches.length;
    consolePanel.classList.toggle('systems-ready', ready);
    lever.disabled = !ready;
    root.querySelector('.service-interlock span').textContent = ready ? '정상 / 발진 잠금 해제' : `안전 잠금 / 계통 점검 ${active.length} / 3`;
    root.querySelector('.check-count').textContent = `CHECK 0${active.length} / 03`;
    root.querySelector('.crt-readout h3').textContent = ready ? '전 계통 정상' : '출격 승인 대기';
    for (const button of switches) {
      const key = button.dataset.system, checked = button.getAttribute('aria-pressed') === 'true';
      const readout = root.querySelector(`[data-readout="${key}"]`);
      readout.textContent = `${labels[key]} · ${checked ? '정상' : '대기'}`;readout.classList.toggle('checked', checked);
    }
    root.querySelector('.callout-engine').textContent = `THRUST / ${active.some(button=>button.dataset.system==='engine') ? 'ONLINE' : 'STANDBY'}`;
    root.querySelector('.service-log').textContent = ready ? '출격 승인. 좌측 하단 발진 레버를 아래로 당기십시오.' : changed ? (changed.getAttribute('aria-pressed') === 'true' ? messages[changed.dataset.system] : `${labels[changed.dataset.system]} 계통이 대기 상태로 전환되었습니다.`) : '좌측 스위치로 세 계통의 점검을 완료하십시오.';
    if (!ready) {dragging=null;root.classList.remove('is-dragging');leverMotion.reset();}
    leverView.render(leverMotion.position,ready);
  }
  function finish() {
    root.hidden = true;consolePanel.hidden = true;root.classList.remove('is-dragging');
    leverMotion.reset();
    document.documentElement.classList.remove('in-preflight','preflight-covered');isolate(false);setPhase('idle');
  }
  async function open(nextCallbacks) {
    if (phase !== 'idle') return;
    callbacks = nextCallbacks;const current = ++generation;
    root.hidden = false;consolePanel.hidden = true;consolePanel.style.opacity = '1';consolePanel.style.transform = 'none';
    document.documentElement.classList.add('in-preflight');isolate(true);setPhase('closing');
    shutter.style.transform = 'translateY(-105%)';leverMotion.reset();
    for (const button of switches) button.setAttribute('aria-pressed', 'false');
    root.querySelector('.service-ship').src = callbacks.ship;
    updateChecks();
    // Start the mechanical motion immediately; decode can finish behind the closed door.
    sound('motor');
    await animate(shutter, [
      {transform:'translateY(-105%)',offset:0},
      {transform:'translateY(-63%)',offset:.42},
      {transform:'translateY(0)',offset:.86},
      {transform:reduceMotion()?'translateY(0)':'translateY(-1.1%)',offset:.93},
      {transform:'translateY(0)',offset:1}
    ], 760, 'cubic-bezier(.42,0,.8,.8)');
    if(current !== generation)return;sound('impact');document.documentElement.classList.add('preflight-covered');
    await Promise.all(assets);if(current !== generation)return;
    consolePanel.hidden = false;
    await animate(consolePanel, [{opacity:0,transform:'translate(-50%,calc(-50% + 12px))'},{opacity:1,transform:'translate(-50%,-50%)'}], 220);
    if(current !== generation)return;setPhase('service');switches[0].focus({preventScroll:true});
  }
  async function leave(launch) {
    if(phase==='closing'&&!launch){
      ++generation;setPhase('returning');
      const transform=getComputedStyle(shutter).transform;
      for(const animation of animations)animation.cancel();
      consolePanel.hidden=true;document.documentElement.classList.remove('preflight-covered');callbacks.cancel();isolate(false);
      await animate(shutter,[{transform},{transform:'translateY(-105%)'}],260);
      finish();document.getElementById('start').focus({preventScroll:true});return;
    }
    if(phase !== 'service')return;
    if(launch && lever.disabled)return;
    setPhase(launch?'latching':'returning');dragging=null;root.classList.remove('is-dragging');
    if(launch){await leverMotion.latch();setPhase('launching');}else leverMotion.reset();
    await animate(consolePanel, [{opacity:1},{opacity:0}], launch?260:140);
    consolePanel.hidden=true;
    // Combat starts only after the opaque shutter covers the entire scene.
    document.documentElement.classList.remove('preflight-covered');
    if(launch)callbacks.launch();else callbacks.cancel();
    isolate(false);sound('motor');setPhase('opening');
    await animate(shutter, [{transform:'translateY(0)'},{transform:'translateY(-105%)'}], 840, 'cubic-bezier(.5,0,.22,1)');
    finish();if(launch)document.getElementById('game').focus({preventScroll:true});else document.getElementById('start').focus({preventScroll:true});
  }
  switches.forEach(button=>button.addEventListener('click',()=>{
    if(phase !== 'service')return;
    button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed') !== 'true'));sound('switch',{on:button.getAttribute('aria-pressed')==='true',system:button.dataset.system});updateChecks(button);
  }));
  returnButton.addEventListener('click',()=>leave(false));
  lever.addEventListener('pointerdown',event=>{
    if(phase !== 'service'||lever.disabled||event.button!==0)return;
    if(!gripHit.contains(event.target))return;
    event.preventDefault();dragging={id:event.pointerId,start:event.clientY,position:leverMotion.begin()};lever.setPointerCapture(event.pointerId);root.classList.add('is-dragging');
  });
  lever.addEventListener('pointermove',event=>{
    if(!dragging||event.pointerId!==dragging.id)return;
    if(lever.disabled||phase!=='service'){dragging=null;leverMotion.returnHome();return;}
    leverMotion.pull(dragging.position+(event.clientY-dragging.start)/Math.max(70,lever.getBoundingClientRect().height*.55));
  });
  const release=event=>{
    if(!dragging||event.pointerId!==dragging.id)return;
    dragging=null;root.classList.remove('is-dragging');
    if(event.type==='pointerup'){if(leverMotion.release())leave(true);}else leverMotion.returnHome();
  };
  lever.addEventListener('pointerup',release);lever.addEventListener('pointercancel',release);lever.addEventListener('lostpointercapture',release);
  lever.addEventListener('click',event=>{if(event.detail===0)leave(true);});
  window.addEventListener('blur',()=>{dragging=null;root.classList.remove('is-dragging');if(phase==='service')leverMotion.returnHome();});
  window.addEventListener('keydown',event=>{
    if(phase==='idle')return;
    if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();leave(false);return;}
    if(event.code==='Tab'){
      const focusable=[...root.querySelectorAll('button:not(:disabled)')].filter(el=>el.getClientRects().length);
      if(!focusable.length){event.preventDefault();return;}
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){event.preventDefault();first.focus();}
    }
    if(document.activeElement===lever&&event.code==='ArrowDown'){event.preventDefault();leave(true);}
  });
  return {open, get phase(){return phase;}};
}
