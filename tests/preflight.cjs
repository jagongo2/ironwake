// Browser-level checks for interlocks, cancellation, dragging and the combat boundary.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/favicon.ico'){res.writeHead(204).end();return;}
 if(name!=='/'&&name!=='/index.html'&&!/^\/(src|assets)\//.test(name)){res.writeHead(404).end();return;}
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.png')?'image/png':'text/javascript; charset=utf-8');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const url=process.argv[2]||'http://127.0.0.1:'+server.address().port+'/';
 try{
  for(const [name,options] of [['desktop',{viewport:{width:1600,height:900}}],['reduced',{viewport:{width:900,height:900},reducedMotion:'reduce'}],['portrait',{viewport:{width:390,height:844},reducedMotion:'reduce'}],['canvas',{viewport:{width:1280,height:720},reducedMotion:'reduce'}],['lever-fallback',{viewport:{width:1280,height:720},reducedMotion:'reduce'}]]){
   const page=await browser.newPage(options),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='warning'&&message.text().startsWith('3D lever'))console.log(message.text());});
   if(name==='lever-fallback')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(this.classList.contains('lever-canvas')&&type==='webgl')return null;return original.call(this,type,...args);};});
   const target=new URL(url);if(name==='canvas')target.searchParams.set('renderer','canvas');
   await page.goto(target.href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.IRONWAKE?.snapshot().frames>5);
   if(name==='desktop'){
    await page.locator('#start').click();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.getElementById('preflight').hidden);
    assert.equal(await page.evaluate(()=>window.IRONWAKE.snapshot().state),'briefing','cancel during shutter closing');
   }
   const open=async()=>{await page.locator('#start').click();await page.waitForFunction(()=>document.getElementById('preflight').dataset.phase==='service');assert.equal((await page.evaluate(()=>window.IRONWAKE.snapshot())).state,'preflight');};
   await open();assert.equal(await page.locator('.launch-lever').isDisabled(),true);
   await page.evaluate(()=>{const panel=document.querySelector('.service-console'),animate=panel.animate.bind(panel);window.__panelRecoil=0;window.__recoilPose=0;panel.animate=(frames,options)=>{if(Array.isArray(frames)&&frames.some(frame=>'translate' in frame)){window.__panelRecoil++;window.__recoilPose=Number(document.querySelector('.lever-canvas').dataset.position);}return animate(frames,options);};});
   assert.equal(await page.locator('.lever-canvas').getAttribute('data-renderer'),name==='lever-fallback'?'canvas3d':'webgl3d');
   assert.equal(await page.locator('.launch-lever img').count(),0,'lever uses geometry rather than a rotated image');
   const before=await page.evaluate(()=>window.IRONWAKE.snapshot().frames);await page.keyboard.press('r');await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>window.IRONWAKE.snapshot().frames),before,'combat rendering stopped in hangar');
   for(const button of await page.locator('.system-switch').all())await button.click();
   assert.equal(await page.locator('.launch-lever').isEnabled(),true);
   await page.locator('.launch-lever').focus();await page.keyboard.press('Tab');
   assert.equal(await page.locator('.hangar-return').evaluate(el=>el===document.activeElement),true,'focus stays inside hangar');
   await page.locator('.system-switch').first().click();assert.equal(await page.locator('.launch-lever').isDisabled(),true);await page.locator('.system-switch').first().click();
   await page.screenshot({path:path.join(root,'artifacts','preflight-'+name+'.png')});
   if(name==='desktop'){
    const rate=await page.evaluate(()=>new Promise(resolve=>{let first=0,count=0;const tick=now=>{if(!first)first=now;count++;if(now-first<1200)requestAnimationFrame(tick);else resolve(1000*(count-1)/(now-first));};requestAnimationFrame(tick);}));
    console.log('HANGAR FPS '+rate.toFixed(1)+' (test browser, not a cross-device guarantee)');
    const lever=await page.locator('.launch-lever').boundingBox(),grip=await page.locator('.lever-grip-hit').boundingBox(),x=grip.x+grip.width/2,y=grip.y+grip.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+15,{steps:4});await page.mouse.up();
    assert.equal(await page.locator('#preflight').getAttribute('data-phase'),'service','short pull returns safely');
    await page.waitForFunction(()=>Number(document.querySelector('.lever-canvas').dataset.position)<.002);
    const resting=await page.locator('.lever-grip-hit').boundingBox(),rx=resting.x+resting.width/2,ry=resting.y+resting.height/2;
    await page.mouse.move(rx,ry);await page.mouse.down();await page.mouse.move(rx,ry+lever.height*.55*.78,{steps:10});await page.waitForTimeout(160);
    const pulled=await page.locator('.lever-grip-hit').boundingBox();assert.ok(pulled.y>resting.y+10,'grip moves down through a 3D arc');assert.ok(pulled.width>resting.width,'grip grows as it approaches camera');
    assert.ok(Math.abs((pulled.x+pulled.width/2)-(resting.x+resting.width/2))<1,'grip stays on vertical centreline');
    await page.screenshot({path:path.join(root,'artifacts','lever-mid-pull.png')});await page.mouse.up();
    await page.keyboard.press('Escape');await page.waitForFunction(()=>document.getElementById('preflight').hidden);
    assert.equal(await page.evaluate(()=>window.IRONWAKE.snapshot().state),'briefing');
    await open();assert.equal(await page.locator('.launch-lever').isDisabled(),true,'checks reset on reentry');
    for(const button of await page.locator('.system-switch').all())await button.click();
    const second=await page.locator('.launch-lever').boundingBox(),handle=await page.locator('.lever-grip-hit').boundingBox(),sx=handle.x+handle.width/2,sy=handle.y+handle.height/2;
    await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx,sy+Math.max(75,second.height*.58),{steps:10});await page.mouse.up();
   }else if(name==='portrait'){
    const button=await page.locator('.launch-lever').boundingBox(),grip=await page.locator('.lever-grip-hit').boundingBox(),x=grip.x+grip.width/2,y=grip.y+grip.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+Math.max(75,button.height*.58),{steps:8});await page.screenshot({path:path.join(root,'artifacts','lever-portrait-full-pull.png')});await page.mouse.up();
   }else{await page.locator('.launch-lever').focus();await page.keyboard.press('Enter');}
   await page.waitForFunction(()=>document.getElementById('preflight').hidden&&window.IRONWAKE.snapshot().state==='playing');
   const recoil=await page.evaluate(()=>({count:window.__panelRecoil,pose:window.__recoilPose}));if(name==='desktop'){assert.ok(recoil.count>0,'panel recoils on mechanical contact');assert.ok(recoil.pose>.98);}else assert.equal(recoil.count,0,'motion preference disables panel shake');
   assert.equal(await page.locator('#game').evaluate(el=>el.inert),false);assert.equal(await page.locator('#game').evaluate(el=>getComputedStyle(el).filter),'none');
   assert.equal(await page.evaluate(()=>window.IRONWAKE.snapshot().rendering.type),name==='canvas'?'Canvas 2D':'PixiJS WebGL');
   assert.deepEqual(errors,[]);console.log('PASS preflight '+name+': interlocks, frozen combat, reentry/launch, focus and no browser errors');await page.close();
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
