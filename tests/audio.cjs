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
   for(const name of ['lightShot','heavyShot','explosion','metal','stress','fallback','smallExplosion']){
    const rate=24000,context=new OfflineAudioContext(2,rate*3,rate),s=createGameSound({context,loadSamples:name!=='fallback'});
    const random=Math.random;Math.random=()=>{throw Error('sound touched game PRNG');};
    try{s.setEnabled(true,1);await s.ready;
     if(name==='stress')for(let i=0;i<70;i++)s.play('heavyShot',{x:i*7,y:0,size:1.8});
     else s.play(name==='fallback'?'heavyShot':name==='smallExplosion'?'explosion':name,{size:name==='explosion'?1.8:name==='smallExplosion'?.3:1,x:-300,y:0});
    }finally{Math.random=random;}
    const before=s.diagnostics();if(name!=='fallback'&&before.loadedSamples!==SAMPLE_FILES.length)throw Error('sample decode '+JSON.stringify(before));
    const audio=await context.startRendering();let peak=0,total=0,tail=0,left=0,right=0;
    for(let c=0;c<audio.numberOfChannels;c++){
     const a=audio.getChannelData(c);for(let i=0;i<a.length;i++){const v=a[i];if(!Number.isFinite(v))throw Error('nonfinite PCM');peak=Math.max(peak,Math.abs(v));total+=v*v;if(i>rate*.4)tail+=v*v;if(c===0)left+=v*v;else right+=v*v;}
    }
    result.push({name,peak,energy:total,tail,left,right,voices:before.voices,samples:before.loadedSamples});s.destroy();
   }
   return result;
  });
  for(const m of measurements){assert.ok(m.energy>.0001,m.name+' audible');assert.ok(m.peak<=.971,m.name+' bounded output');assert.ok(m.voices<=28,'voice limit');if(m.name!=='stress')assert.ok(m.left>m.right*2,'left source panning');}
  assert.equal(measurements.find(m=>m.name==='stress').voices,28,'dense burst exercises voice stealing');
  assert.ok(measurements[1].tail>measurements[0].tail*3,'heavy cannon has a longer body/tail than light fire');
  assert.ok(measurements[2].tail>measurements[0].tail*3,'explosion tail differs from fire');
  assert.ok(measurements[2].energy>measurements.find(m=>m.name==='smallExplosion').energy*2,'explosion size changes more than pitch');
  console.log('PCM',JSON.stringify(measurements));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.IRONWAKE?.snapshot().frames>3,null,{timeout:60000});
  await page.locator('#practice').click();await page.evaluate(()=>window.__ironwakeSound.ready);
  let s=await page.evaluate(()=>window.IRONWAKE.audio());assert.equal(s.loadedSamples,10);assert.equal(s.failedSamples,0);assert.ok(s.sampledEngine);assert.ok(s.enabled);
  await page.mouse.move(1100,450);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
  await page.keyboard.down('Space');await page.waitForTimeout(250);await page.keyboard.up('Space');
  await page.keyboard.down('KeyQ');await page.waitForTimeout(200);await page.keyboard.up('KeyQ');await page.keyboard.press('KeyG');
  s=await page.evaluate(()=>window.IRONWAKE.audio());assert.ok(s.events.lightShot>0);assert.ok(s.events.heavyShot>0);assert.ok(s.events.rcs>0);assert.ok(s.events.gear>0);assert.ok(s.engineLevel>0);
  await page.keyboard.press('KeyM');await page.waitForTimeout(200);s=await page.evaluate(()=>window.IRONWAKE.audio());assert.equal(s.enabled,false);assert.equal(s.voices,0);assert.equal(s.state,'suspended');
  await page.keyboard.press('KeyM');await page.waitForTimeout(100);s=await page.evaluate(()=>window.IRONWAKE.audio());assert.ok(s.enabled);assert.equal(s.state,'running');
  await page.keyboard.press('Escape');await page.locator('#options').click();await page.locator('#volume').fill('21');await page.locator('#volume').dispatchEvent('input');assert.equal(await page.evaluate(()=>window.IRONWAKE.audio().volume),.21);
  await page.locator('#closeSettings').click();assert.deepEqual(errors,[]);
  console.log('PASS sample decode, isolated PRNG, finite limited PCM, distinct tails, panning, voice budget, live weapons/RCS/gear, mute/resume and volume');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
