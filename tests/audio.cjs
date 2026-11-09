const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const measureAudio=require('./audio-metrics.cjs');
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
  await page.addScriptTag({content:'window.measureAudio='+measureAudio.toString()});
  const measurements=await page.evaluate(async()=>{
   const {createGameSound,SAMPLE_FILES}=await import('/src/sound.js');const result=[];
   for(const name of ['lightShot','heavyShot','explosion','metal','stress','fallback','smallExplosion','fuelExplosion','wreckExplosion','farHeavy','nearHeavy','nearLight','nearExplosion','dryHeavy','warmHeavy']){
    const rate=24000,context=new OfflineAudioContext(2,rate*3,rate),s=createGameSound({context,loadSamples:name!=='fallback',bodySaturation:name==='dryHeavy'?0:1});
    const random=Math.random;Math.random=()=>{throw Error('sound touched game PRNG');};
    try{s.setEnabled(true,1);await s.ready;
     if(name==='stress')for(let i=0;i<70;i++)s.play('heavyShot',{x:i*7,y:0,size:1.8});
     else s.play(['fallback','farHeavy','nearHeavy','dryHeavy','warmHeavy'].includes(name)?'heavyShot':name==='nearLight'?'lightShot':name.endsWith('Explosion')?'explosion':name,{size:name==='explosion'?1.8:name==='smallExplosion'?.3:1,x:name.startsWith('near')?265:name==='farHeavy'?-1200:-300,y:name.startsWith('near')?300:0,kind:name==='fuelExplosion'?'fuel':name==='wreckExplosion'?'wreck':'impact'});
    }finally{Math.random=random;}
    const before=s.diagnostics();if(name!=='fallback'&&before.loadedSamples!==SAMPLE_FILES.length)throw Error('sample decode '+JSON.stringify(before));
    const audio=await context.startRendering();
    result.push({name,...window.measureAudio(audio),voices:before.voices,samples:before.loadedSamples,cutoff:before.lastEvent.cutoff,pitch:before.lastEvent.pitch,sampledCombat:before.sampledCombat});s.destroy();
   }
   return result;
  });
  console.log('PCM',JSON.stringify(measurements));
  for(const m of measurements){assert.ok(m.energy>.0001,m.name+' audible');assert.ok(m.peak<=.76,m.name+' conservative output ceiling');assert.ok(m.voices<=28,'voice limit');if(m.name!=='stress'&&!m.name.startsWith('near'))assert.ok(m.left>m.right*2,'left source panning');}
  assert.equal(measurements.find(m=>m.name==='stress').voices,28,'dense burst exercises voice stealing');
  assert.ok(measurements[1].tail>measurements[0].tail*3,'heavy cannon has a longer body/tail than light fire');
  assert.ok(measurements[2].tail>measurements[0].tail*3,'explosion tail differs from fire');
  assert.ok(measurements[2].energy>measurements.find(m=>m.name==='smallExplosion').energy*2,'explosion size changes more than pitch');
  assert.ok(measurements[1].sampledCombat,'weapon and blast recordings decoded');
  for(const m of measurements.filter(m=>['lightShot','heavyShot','explosion','fallback'].includes(m.name)||m.name.startsWith('near'))){assert.ok(m.harshFraction<.08,m.name+' bounded upper-mid content');assert.ok(m.lowFraction>.15,m.name+' low-frequency body');}
  const near=measurements.find(m=>m.name==='nearHeavy');assert.ok(near.midFraction>.15&&near.harshFraction>.001,'near cannon retains mechanical mids and a clear attack');
  const dry=measurements.find(m=>m.name==='dryHeavy'),warm=measurements.find(m=>m.name==='warmHeavy');assert.ok(warm.midFraction>dry.midFraction*1.04,'parallel driven body adds measurable mid harmonics');
  assert.ok(measurements[1].attack>measurements[0].attack*1.4,'heavy steel strike is stronger than light fire');
  assert.equal(measurements.find(m=>m.name==='fallback').sampledCombat,false,'synthesized fallback is actually used');
  const far=measurements.find(m=>m.name==='farHeavy');assert.ok(far.cutoff<measurements[1].cutoff,'distant reports lose treble');assert.ok(far.energy<measurements[1].energy*.5,'distant reports attenuate');
  const fuel=measurements.find(m=>m.name==='fuelExplosion'),wreck=measurements.find(m=>m.name==='wreckExplosion');assert.ok(Math.abs(fuel.tail-wreck.tail)>.01,'fuel and wreck layers differ at equal size');
  const behavior=await page.evaluate(async()=>{
   const {createGameSound}=await import('/src/sound.js'),rate=24000;
   const variants=createGameSound({context:new OfflineAudioContext(2,rate,rate)});variants.setEnabled(true,1);await variants.ready;
   const pitches=[],levels=[];for(let i=0;i<12;i++){variants.play('heavyShot');const d=variants.diagnostics().lastEvent;pitches.push(d.pitch);levels.push(d.volumeVariation);}variants.destroy();
   const renderMoving=async moving=>{
    const context=new OfflineAudioContext(2,rate*3,rate),s=createGameSound({context});s.setEnabled(true,1);await s.ready;
    const frame={mode:'paused',x:0,y:0,width:640,throttle:0,integrity:1,dead:false,fire:0};s.update(frame);s.play('heavyShot',{x:0,y:0});
    const paused=context.suspend(.2);const rendered=context.startRendering();await paused;if(moving){frame.x=1200;s.update(frame);}await context.resume();
    const audio=await rendered,channels=[audio.getChannelData(0),audio.getChannelData(1)],early=[0,0],late=[0,0];
    for(let c=0;c<2;c++)for(let i=0;i<audio.length;i++){const e=channels[c][i]**2;if(i<rate*.12)early[c]+=e;if(i>rate*.4)late[c]+=e;}
    const slice=channels.map(a=>a.subarray(rate*.4)),tail=window.measureAudio({sampleRate:rate,numberOfChannels:2,length:slice[0].length,getChannelData:c=>slice[c]});s.destroy();return {early,late,tail};
   };
   const stationary=await renderMoving(false),moving=await renderMoving(true),damage=[];
   for(const hurt of [false,true]){
    const context=new OfflineAudioContext(1,rate*3,rate),s=createGameSound({context});s.setEnabled(true,1);await s.ready;
    s.update({mode:'playing',x:0,y:0,width:640,throttle:0,integrity:1,dead:false,fire:0,damage:hurt?.85:0});s.play('heavyShot',{x:0,y:0});
    const severity=s.diagnostics().damageSeverity,audio=await context.startRendering();damage.push({severity,metrics:window.measureAudio(audio),pcm:audio.getChannelData(0).slice()});s.destroy();
   }
   let difference=0;for(let i=0;i<damage[0].pcm.length;i++)difference+=(damage[0].pcm[i]-damage[1].pcm[i])**2;
   const relativeDifference=difference/damage[0].metrics.energy;for(const row of damage)delete row.pcm;
   return {pitches,levels,stationary,moving,damage,relativeDifference};
  });
  assert.ok(behavior.pitches.every(p=>p>=.95&&p<=1.05)&&new Set(behavior.pitches.map(p=>p.toFixed(3))).size>4,'bounded pitch variation between shots');
  assert.ok(behavior.levels.every(v=>v>=.96&&v<=1.04),'bounded volume variation');
  assert.ok(Math.abs(behavior.moving.early[0]/behavior.moving.early[1]-1)<.01,'centered attack before listener moves');
  assert.ok(behavior.moving.late[0]>behavior.moving.late[1]*2,'listener motion updates stereo placement');
  assert.ok(behavior.moving.tail.energy<behavior.stationary.tail.energy*.3,'listener motion updates distance attenuation');
  assert.ok(behavior.moving.tail.harshFraction<behavior.stationary.tail.harshFraction*.3,'listener motion darkens distant tail');
  assert.equal(behavior.damage[0].severity,0,'healthy mix has no damage effect');assert.ok(behavior.damage[1].severity>.5,'critical hull activates damage effect');
  assert.ok(behavior.relativeDifference>.0001&&behavior.relativeDifference<.25,'damage adds bounded texture without replacing the mix');
  assert.ok(behavior.damage.every(d=>d.metrics.peak<.76),'damage output headroom');
  console.log('BEHAVIOR',JSON.stringify({pitchRange:[Math.min(...behavior.pitches),Math.max(...behavior.pitches)],moving:behavior.moving.tail,damage:behavior.damage.map(d=>({severity:d.severity,peak:d.metrics.peak})),damageDifference:behavior.relativeDifference}));
  const engines=await page.evaluate(async()=>{
   const {createGameSound}=await import('/src/sound.js'),results=[];
   for(const [name,throttle,integrity] of [['idle',.2,1],['full',1.8,1],['damaged',1.8,.25],['dead',1.8,0]]){
    const context=new OfflineAudioContext(1,32000,32000),s=createGameSound({context});s.setEnabled(true,1);await s.ready;
    s.update({mode:'playing',x:0,y:0,width:640,throttle,integrity,dead:integrity===0,fire:0});
    const d=s.diagnostics(),audio=await context.startRendering();
    results.push({name,air:d.engineAirLevel,...window.measureAudio(audio)});s.destroy();
   }return results;
  });
  assert.ok(engines[1].energy>engines[0].energy*3,'full thrust grows beyond idle');assert.ok(engines[1].air>engines[0].air*5,'exhaust responds strongly to thrust');
  assert.ok(engines[1].energy>engines[2].energy*3,'engine loss lowers output');assert.ok(engines[3].energy<.000001,'destroyed engines fade to silence');console.log('ENGINE',JSON.stringify(engines));
  assert.ok(engines[1].harshFraction<.01&&engines[1].lowFraction>.7,'full thrust keeps a low hum with audible machinery');
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.IRONWAKE?.snapshot().frames>3,null,{timeout:60000});
  await page.locator('#practice').click();await page.evaluate(()=>window.__ironwakeSound.ready);
  let s=await page.evaluate(()=>window.IRONWAKE.audio());const expected=await page.evaluate(async()=>(await import('/src/sound.js')).SAMPLE_FILES.length);assert.equal(s.loadedSamples,expected);assert.equal(s.failedSamples,0);assert.ok(s.sampledEngine);assert.ok(s.sampledCombat);assert.equal(s.revision,'combat-4-presence');assert.ok(s.enabled);
  await page.mouse.move(1100,450);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
  await page.keyboard.down('Space');await page.waitForTimeout(250);await page.keyboard.up('Space');
  await page.keyboard.down('KeyQ');await page.waitForTimeout(200);await page.keyboard.up('KeyQ');await page.keyboard.press('KeyG');
  s=await page.evaluate(()=>window.IRONWAKE.audio());assert.ok(s.events.lightShot>0);assert.ok(s.events.heavyShot>0);assert.ok(s.events.rcs>0);assert.ok(s.events.gear>0);assert.ok(s.engineLevel>0);
  await page.keyboard.press('KeyM');await page.waitForTimeout(200);s=await page.evaluate(()=>window.IRONWAKE.audio());assert.equal(s.enabled,false);assert.equal(s.voices,0);assert.equal(s.state,'suspended');
  await page.keyboard.press('KeyM');await page.waitForTimeout(100);s=await page.evaluate(()=>window.IRONWAKE.audio());assert.ok(s.enabled);assert.equal(s.state,'running');
  await page.keyboard.press('Escape');await page.locator('#options').click();await page.locator('#volume').fill('21');await page.locator('#volume').dispatchEvent('input');assert.equal(await page.evaluate(()=>window.IRONWAKE.audio().volume),.21);
  await page.locator('#closeSettings').click();assert.deepEqual(errors,[]);
  console.log('PASS decode/fallback, private PRNG, clear near attacks, driven body, moving listener, pitch/level variation, bounded critical-damage texture, engine response, voice budget, live controls and mute');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
