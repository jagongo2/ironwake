// Isolated browser: compare the same 0.11 simulation and output on both backends.
const {chromium}=require('playwright'),http=require('node:http');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const hook=`
let manual=false,measure=false,lastSample=0,intervals=[],work=[],scenario='flight';
const originalUpdate=update;update=function(dt){if(scenario==='combat'){pointer.x=ships[1].x-cam.x;pointer.y=ships[1].y-cam.y;}return originalUpdate(dt);};
window.__test={
 resume(){manual=false;last=0;requestAnimationFrame(loop);},
 prepare(kind='flight'){manual=false;measure=false;scenario=kind;window.__seed=73917;reset(true);options.shake=false;pointer.down=kind==='combat';},
 still(kind){manual=true;scenario='flight';window.__seed=73917;reset(true);options.shake=false;pointer.down=false;player.aim=0;
  if(kind==='combat'){for(let i=0;i<120;i++){pointer.x=ships[1].x-cam.x;pointer.y=ships[1].y-cam.y;pointer.down=true;update(1/60);render();}}
  if(kind==='burst'){explosion(player.x+30,player.y,1.4);for(let i=0;i<8;i++){update(1/60);render();}}
  if(kind==='background'){ctx.begin?.();background();ctx.end?.();}else render();
  const snap=window.IRONWAKE.snapshot();for(const k of ['rendering','frames','maxParticles','maxChunks','maxFlames'])delete snap[k];
  let pixels;if(ctx.isGPU)pixels=ctx.app.renderer.extract.pixels({target:ctx.app.stage,frame:ctx.app.renderer.screen}).pixels;
  else pixels=ctx.getImageData(0,0,C.width,C.height).data;
  let str='';for(let i=0;i<pixels.length;i+=8192)str+=String.fromCharCode(...pixels.subarray(i,i+8192));
  return {state:snap,width:C.width,height:C.height,pixels:btoa(str)};
 },
 start(){measure=true;lastSample=0;intervals=[];work=[];},
 stop(){measure=false;const a=intervals.slice().sort((a,b)=>a-b),mean=a.reduce((a,b)=>a+b,0)/a.length;
  return {fps:1000/mean,meanFrameMs:mean,p95FrameMs:a[Math.floor(a.length*.95)],cpuMs:work.reduce((a,b)=>a+b,0)/work.length,over33ms:a.filter(x=>x>33.4).length,rendering:window.IRONWAKE.snapshot().rendering};},
 burst(){for(let i=0;i<10;i++)explosion(player.x+(i%5)*55-90,player.y+Math.floor(i/5)*55,1.4);}
};
`;
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/favicon.ico'){res.writeHead(204).end();return;}
 if(!(/^\/(src|assets)\//.test(name)||name==='/'||name==='/index.html')){res.writeHead(404).end();return;}
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{let s=fs.readFileSync(file,'utf8');
  if(name==='/src/game.js'){
   s=s.replace('function loop(ts){','function loop(ts){if(manual)return;const started=performance.now();if(measure&&lastSample)intervals.push(ts-lastSample);lastSample=ts;');
   s=s.replace('render();requestAnimationFrame(loop)','render();if(measure)work.push(performance.now()-started);requestAnimationFrame(loop)');
   s=s.replace(/\}\)\(\);\s*$/,hook+'\n})();');
  }
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');res.end(s);
 }catch{res.writeHead(404).end();}
});
(async()=>{
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const reports=[],images=new Map(),states=new Map();
 try{
  for(const backend of ['canvas','webgl']){
   const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
   await page.addInitScript(()=>{window.__seed=73917;Math.random=()=>{window.__seed=(Math.imul(window.__seed,1664525)+1013904223)>>>0;return window.__seed/4294967296;};});
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/?renderer='+backend,{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>window.__test&&window.IRONWAKE.snapshot().frames>5,null,{timeout:60000});
   const state=await page.evaluate(()=>window.IRONWAKE.snapshot());
   assert.equal(state.rendering.type,backend==='webgl'?'PixiJS WebGL':'Canvas 2D');
   assert.deepEqual(state.viewport,{width:640,height:360});
   for(const kind of ['background','flight','combat','burst']){
    const result=await page.evaluate(k=>window.__test.still(k),kind),pixels=Buffer.from(result.pixels,'base64');
    assert.equal(result.width,640);assert.equal(result.height,360);
    if(backend==='canvas'){images.set(kind,pixels);states.set(kind,result.state);}
    else{
     assert.deepEqual(result.state,states.get(kind),'same simulation '+kind);
     const expected=images.get(kind);let different=0,total=0;
     for(let i=0;i<pixels.length;i+=4){let max=0;for(let c=0;c<3;c++){const d=Math.abs(pixels[i+c]-expected[i+c]);total+=d;max=Math.max(max,d);}if(max>16)different++;}
     const comparison={kind,differentFraction:different/(640*360),meanChannelDifference:total/(640*360*3)};
     console.log('PIXELS',JSON.stringify(comparison));
     assert.ok(comparison.differentFraction<.02,'artwork regression '+kind);
    }
   }
   await page.screenshot({path:path.join(root,'artifacts',backend+'-classic.png')});
   // Resume the production animation loop after deterministic manual captures.
   await page.evaluate(()=>{window.__test.prepare();window.__test.resume();});
   await page.keyboard.press('Escape');await page.locator('#options').click();
   await page.locator('#fpsDisplay').uncheck();assert.equal(await page.locator('#fps-counter').isVisible(),false);
   await page.locator('#fpsDisplay').check();await page.locator('#closeSettings').click();
   await page.mouse.move(1100,450);await page.mouse.down();await page.waitForTimeout(500);await page.mouse.up();
   assert.ok((await page.evaluate(()=>window.IRONWAKE.snapshot())).shots>0);
   if(process.argv.includes('--bench'))for(const kind of ['flight','combat','stress']){
    await page.evaluate(k=>window.__test.prepare(k),kind);await page.waitForTimeout(2000);await page.evaluate(()=>window.__test.start());
    if(kind==='stress'){for(let i=0;i<4;i++){await page.evaluate(()=>window.__test.burst());await page.waitForTimeout(1000);}await page.waitForTimeout(4000);}
    else await page.waitForTimeout(8000);
    const result=await page.evaluate(()=>window.__test.stop());reports.push({backend,kind,...result});console.log('PERF',JSON.stringify(reports.at(-1)));
   }
   for(const viewport of [{width:900,height:900},{width:1920,height:922}]){
    await page.setViewportSize(viewport);await page.waitForTimeout(250);
    const s=await page.evaluate(()=>window.IRONWAKE.snapshot());
    if(backend==='webgl'){assert.equal(s.rendering.renderWidth,s.viewport.width);assert.equal(s.rendering.renderHeight,s.viewport.height);}
    assert.ok(await page.locator('#fps-counter').isVisible());
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  fs.writeFileSync(path.join(root,'artifacts','renderer-comparison.json'),JSON.stringify({viewport:'1600x900',output:'640x360',reports},null,2));
  console.log('PASS identical 0.11 simulation, classic art, dynamic effects, FPS toggle, resize, Canvas fallback and WebGL');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
