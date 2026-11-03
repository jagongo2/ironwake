// Pure CPU/pixel-buffer checks. No browser, GPU, DOM layout, or audio timing is measured.
// Run: node tests/optimization.cjs [baseline Git revision]
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const baseline = execFileSync('git', ['show', `${process.argv[2] || '0bd7796'}:index.html`], { maxBuffer: 16e6 }).toString();
const current = fs.readFileSync('index.html', 'utf8');

function load(html) {
  const elements = new Map();
  function element() {
    const e = { width: 640, height: 360, hidden: true, value: '50', style: {},
      classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {},
      setAttribute() {}, focus() {}, getBoundingClientRect: () => ({ width: 1280, height: 720 }),
      getContext() { return context; } };
    const context = new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      createRadialGradient: () => ({ addColorStop() {} }) }, {
      get: (target, name) => name in target ? target[name] : () => {},
    });
    return e;
  }
  const sandbox = { performance, document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, documentElement: element(), addEventListener() {} },
    matchMedia: () => ({ matches: false }), requestAnimationFrame() {},
    HTMLInputElement: class {}, addEventListener() {} };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext('let randomSeed=73917; Math.random=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;};', context);
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const expose = `
    window.test={FireFluid,Ship,fireFluid,billowSmoke,jetGas,jetImage:()=>jetImage,drawJetGas,
      gearRaster,breakGear,damage,explosion,update,render,updateShip,solveGround,collideShips,
      reset:()=>{reset(true);}, camera:(x,y)=>{cam.x=x;cam.y=y;},
      viewport:(width,height)=>{W=width;H=height;fireFluid.resize();billowSmoke.resize();},
      key:(key,down)=>down?keys.add(key):keys.delete(key),
      aim:(x,y,down)=>{pointer.x=x;pointer.y=y;pointer.down=down;},
      ships:()=>ships, state:()=>({snapshot:window.IRONWAKE.snapshot(),
        ships:ships.map(s=>({mat:Array.from(s.mat),hp:Array.from(s.hp),x:s.x,y:s.y,vx:s.vx,vy:s.vy,angle:s.angle,av:s.av})),
        particles,jetGas,pending:pending.map(p=>({x:p.x,y:p.y,t:p.t})),
        fluid:['t','f','s','u','v'].map(k=>Array.from(fireFluid[k]))})};
  `;
  // Cache the realm's built-ins locally: vm's global proxy lookup would otherwise
  // dominate hot pixel loops and distort CPU timings compared with normal JS.
  vm.runInContext(source.replace("(() => {", "(() => {\nconst Math=globalThis.Math;").replace(/\}\)\(\);\s*$/, expose + '\n})();'), context);
  return sandbox.test;
}
const hash = data => createHash('sha256').update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest('hex');
function samePixels(a, b, label) {
  assert.equal(hash(a.fireFluid.image.data), hash(b.fireFluid.image.data), label + ': fire');
  assert.equal(hash(a.fireFluid.smokeImage.data), hash(b.fireFluid.smokeImage.data), label + ': gas smoke');
  assert.equal(hash(a.billowSmoke.image.data), hash(b.billowSmoke.image.data), label + ': billow smoke');
  assert.equal(hash(a.jetImage().data), hash(b.jetImage().data), label + ': exhaust');
}

function runScenario(api, name) {
  const checkpoints=[];
  api.reset();
  const ships = api.ships();
  if (name === 'collision') {
    ships[0].x=500;ships[1].x=600;ships[0].y=ships[1].y=330;
    ships[0].vx=100;ships[1].vx=-80;
  }
  if (name === 'landing') { api.key('KeyG', false); ships[0].gearTarget=true; ships[0].y=540; ships[0].vy=35; }
  if (name === 'combat') { api.aim(460, 170, true); api.key('Space', true); api.explosion(610, 270, 1.6); }
  for(let frame=0;frame<180;frame++) {
    if(name==='landing' && frame===100) api.breakGear(ships[0],0,0);
    if(name==='landing' && frame===140) api.key('KeyW',true);
    if(name==='combat' && frame===60) api.damage(ships[1],ships[1].x,ships[1].y,14,6);
    api.update(1/60);
    // Match render-time PRNG consumption as well as simulation updates.
    api.render();
    if(frame%30===0) checkpoints.push([hash(api.fireFluid.image.data),hash(api.fireFluid.smokeImage.data),hash(api.billowSmoke.image.data),hash(api.jetImage().data)]);
  }
  return JSON.stringify({state:api.state(),checkpoints});
}
for(const name of ['flight','collision','landing','combat']) {
  const a=load(baseline),b=load(current);
  assert.equal(runScenario(a,name),runScenario(b,name),name+': deterministic simulation');
  samePixels(a,b,name);
  console.log('PASS',name,'simulation and effect buffers');
}

// Exercise interpolation across tile edges, negative camera positions, viewport
// resize, active-region retirement, overlapping smoke, and damaged gear obstacles.
{
  const a=load(baseline),b=load(current);
  for(const api of [a,b]) {
    api.reset(); api.viewport(853,479);
    for(const [x,y] of [[-30,-30],[0,0],[31,31],[64,64],[650,330],[1290,610]]) {
      api.fireFluid.inject(x,y,9,.8,2,2,-5);
      api.billowSmoke.emit(x,y,0,-8,14,4,1);
    }
    api.billowSmoke.update(.3);
  }
  for(const [x,y] of [[0,0],[-65,-127],[1,1],[31,31],[32,32],[620,160],[1200,300]]) {
    for(const api of [a,b]) { api.camera(x,y); api.fireFluid.raster();api.billowSmoke.frame+=2;api.billowSmoke.raster();api.drawJetGas(); }
    samePixels(a,b,`tile edges camera ${x},${y}`);
  }
  for(const api of [a,b]) { api.fireFluid.reset();api.billowSmoke.reset();api.fireFluid.raster();api.billowSmoke.raster(); }
  samePixels(a,b,'reset clears old pixels');
  console.log('PASS tile edges, camera, resize and reset');
}

{
  const a=load(baseline),b=load(current);
  for(const api of [a,b]) {
    api.reset();
    const ship=api.ships()[0];
    ship.angle=.37;ship.gearTime=2.1;api.breakGear(ship,1,2);
    api.fireFluid.obstacles();
    // Dense synthetic field includes tile boundaries and weak residual smoke.
    const f=api.fireFluid;f.live.fill(1);f.computed.fill(1);
    for(let i=0;i<f.n;i++){f.t[i]=(i%19)*.015;f.s[i]=(i%7)*.012;}
    api.camera(1,71);f.raster();
  }
  assert.equal(hash(a.fireFluid.solid),hash(b.fireFluid.solid),'rotated/damaged gear obstacle mask');
  samePixels(a,b,'dense fire and residual smoke');
  for(const api of [a,b]) {
    const f=api.fireFluid;f.live.fill(0);f.computed.fill(0);f.previous.fill(1);
    f.advance(1/30);f.raster();
  }
  samePixels(a,b,'retired tiles clear old pixels');
  console.log('PASS dense/residual/retired fields and rotated damaged gear');
}

// Median of repeated batches; isolate JS computation from browser canvas uploads.
function median(values) { return values.sort((a,b)=>a-b)[values.length>>1]; }
function measure(source, kind) {
  const api=load(source);api.reset();
  if(kind!=='empty fire') for(const [x,y] of [[280,260],[310,280],[550,300]]) api.fireFluid.inject(x,y,12,.8,2,2,-5);
  if(kind==='dense fire') { api.fireFluid.live.fill(1);api.fireFluid.computed.fill(1);api.fireFluid.t.fill(.5);api.fireFluid.s.fill(.1); }
  for(let i=0;i<35;i++) api.billowSmoke.emit(280+i*3,260+i%7,0,-8,16,5,1);
  api.billowSmoke.update(.5);
  const fn=kind==='obstacles'?()=>api.fireFluid.obstacles():kind==='smoke'?()=>{api.billowSmoke.frame+=2;api.billowSmoke.raster();}:()=>{api.fireFluid.frame++;api.fireFluid.raster();};
  for(let i=0;i<25;i++)fn();
  const times=[];
  for(let round=0;round<7;round++){const start=performance.now();for(let i=0;i<40;i++)fn();times.push((performance.now()-start)/40);}
  return median(times);
}
for(const kind of ['empty fire','localized fire','dense fire','smoke','obstacles']) {
  const before=measure(baseline,kind),after=measure(current,kind);
  console.log(`${kind}: ${before.toFixed(3)} -> ${after.toFixed(3)} ms/call (${(before/after).toFixed(2)}x CPU speedup)`);
}
