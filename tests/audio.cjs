const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/audio-check'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><button>Audio check</button>');return;}
 if(name==='/favicon.ico'){res.writeHead(204).end();return;}
 if(name!=='/'&&!/^\/(src|assets)\//.test(name)){res.writeHead(404).end();return;}
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.ogg')?'audio/ogg':file.endsWith('.png')?'image/png':'text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/audio-check');
  const measurements=await page.evaluate(async()=>{
   const {createGameSound,SAMPLE_FILES}=await import('/src/sound.js');const result=[];
   for(const name of ['lightShot','heavyShot','explosion','metal','stress','fallback','smallExplosion','fuelExplosion','wreckExplosion','farHeavy']){
    const rate=24000,context=new OfflineAudioContext(2,rate*3,rate),s=createGameSound({context,loadSamples:name!=='fallback'});
    const random=Math.random;Math.random=()=>{throw Error('sound touched game PRNG');};
    try{s.setEnabled(true,1);await s.ready;
     if(name==='stress')for(let i=0;i<70;i++)s.play('heavyShot',{x:i*7,y:0,size:1.8});
     else s.play(name==='fallback'||name==='farHeavy'?'heavyShot':name.endsWith('Explosion')?'explosion':name,{size:name==='explosion'?1.8:name==='smallExplosion'?.3:1,x:name==='farHeavy'?-1200:-300,y:0,kind:name==='fuelExplosion'?'fuel':name==='wreckExplosion'?'wreck':'impact'});
    }finally{Math.random=random;}
    const before=s.diagnostics();if(name!=='fallback'&&before.loadedSamples!==SAMPLE_FILES.length)throw Error('sample decode '+JSON.stringify(before));
    const audio=await context.startRendering();let peak=0,total=0,tail=0,left=0,right=0;
    for(let c=0;c<audio.numberOfChannels;c++){
     const a=audio.getChannelData(c);for(let i=0;i<a.length;i++){const v=a[i];if(!Number.isFinite(v))throw Error('nonfinite PCM');peak=Math.max(peak,Math.abs(v));total+=v*v;if(i>rate*.4)tail+=v*v;if(c===0)left+=v*v;else right+=v*v;}
    }
    result.push({name,peak,energy:total,tail,left,right,voices:before.voices,samples:before.loadedSamples,cutoff:before.lastEvent.cutoff,sampledCombat:before.sampledCombat});s.destroy();
   }
   return result;
  });
  console.log('PCM',JSON.stringify(measurements));
  for(const m of measurements){assert.ok(m.energy>.0001,m.name+' audible');assert.ok(m.peak<=.971,m.name+' bounded output');assert.ok(m.voices<=28,'voice limit');if(m.name!=='stress')assert.ok(m.left>m.right*2,'left source panning');}
  assert.equal(measurements.find(m=>m.name==='stress').voices,28,'dense burst exercises voice stealing');
  assert.ok(measurements[1].tail>measurements[0].tail*3,'heavy cannon has a longer body/tail than light fire');
  assert.ok(measurements[2].tail>measurements[0].tail*3,'explosion tail differs from fire');
  assert.ok(measurements[2].energy>measurements.find(m=>m.name==='smallExplosion').energy*2,'explosion size changes more than pitch');
  assert.ok(measurements[1].sampledCombat,'weapon and blast recordings decoded');
  assert.equal(measurements.find(m=>m.name==='fallback').sampledCombat,false,'synthesized fallback is actually used');
  const far=measurements.find(m=>m.name==='farHeavy');assert.ok(far.cutoff<measurements[1].cutoff,'distant reports lose treble');assert.ok(far.energy<measurements[1].energy*.5,'distant reports attenuate');
  const fuel=measurements.find(m=>m.name==='fuelExplosion'),wreck=measurements.find(m=>m.name==='wreckExplosion');assert.ok(Math.abs(fuel.tail-wreck.tail)>.01,'fuel and wreck layers differ at equal size');
  const engines=await page.evaluate(async()=>{
   const {createGameSound}=await import('/src/sound.js'),results=[];
   for(const [name,throttle,integrity] of [['idle',.2,1],['full',1.8,1],['damaged',1.8,.25],['dead',1.8,0]]){
    const context=new OfflineAudioContext(1,32000,32000),s=createGameSound({context});s.setEnabled(true,1);await s.ready;
    s.update({mode:'playing',x:0,y:0,width:640,throttle,integrity,dead:integrity===0,fire:0});
    const d=s.diagnostics(),a=(await context.startRendering()).getChannelData(0);let energy=0;for(let i=16000;i<a.length;i++)energy+=a[i]*a[i];
    results.push({name,energy,air:d.engineAirLevel});s.destroy();
   }return results;
  });
  assert.ok(engines[1].energy>engines[0].energy*3,'full thrust grows beyond idle');assert.ok(engines[1].air>engines[0].air*5,'exhaust responds strongly to thrust');
  assert.ok(engines[1].energy>engines[2].energy*3,'engine loss lowers output');assert.ok(engines[3].energy<.000001,'destroyed engines fade to silence');console.log('ENGINE',JSON.stringify(engines));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.IRONWAKE?.snapshot().frames>3,null,{timeout:60000});
  await page.locator('#practice').click();await page.evaluate(()=>window.__ironwakeSound.ready);
  let s=await page.evaluate(()=>window.IRONWAKE.audio());const expected=await page.evaluate(async()=>(await import('/src/sound.js')).SAMPLE_FILES.length);assert.equal(s.loadedSamples,expected);assert.equal(s.failedSamples,0);assert.ok(s.sampledEngine);assert.ok(s.sampledCombat);assert.equal(s.revision,'combat-2');assert.ok(s.enabled);
  await page.mouse.move(1100,450);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
  await page.keyboard.down('Space');await page.waitForTimeout(250);await page.keyboard.up('Space');
  await page.keyboard.down('KeyQ');await page.waitForTimeout(200);await page.keyboard.up('KeyQ');await page.keyboard.press('KeyG');
  s=await page.evaluate(()=>window.IRONWAKE.audio());assert.ok(s.events.lightShot>0);assert.ok(s.events.heavyShot>0);assert.ok(s.events.rcs>0);assert.ok(s.events.gear>0);assert.ok(s.engineLevel>0);
  await page.keyboard.press('KeyM');await page.waitForTimeout(200);s=await page.evaluate(()=>window.IRONWAKE.audio());assert.equal(s.enabled,false);assert.equal(s.voices,0);assert.equal(s.state,'suspended');
  await page.keyboard.press('KeyM');await page.waitForTimeout(100);s=await page.evaluate(()=>window.IRONWAKE.audio());assert.ok(s.enabled);assert.equal(s.state,'running');
  await page.keyboard.press('Escape');await page.locator('#options').click();await page.locator('#volume').fill('21');await page.locator('#volume').dispatchEvent('input');assert.equal(await page.evaluate(()=>window.IRONWAKE.audio().volume),.21);
  await page.locator('#closeSettings').click();assert.deepEqual(errors,[]);
  console.log('PASS recording decode/fallback, isolated PRNG, finite limited PCM, weapon/fuel/wreck tails, distance filtering, engine load/damage, voice budget, live weapons/RCS/gear, mute/resume and volume');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
