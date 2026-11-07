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
  for(const [name,options] of [['desktop',{viewport:{width:1600,height:900}}],['reduced',{viewport:{width:900,height:900},reducedMotion:'reduce'}],['portrait',{viewport:{width:390,height:844},reducedMotion:'reduce'}],['canvas',{viewport:{width:1280,height:720},reducedMotion:'reduce'}]]){
   const page=await browser.newPage(options),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const target=new URL(url);if(name==='canvas')target.searchParams.set('renderer','canvas');
   await page.goto(target.href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.IRONWAKE?.snapshot().frames>5);
   if(name==='desktop'){
    await page.locator('#start').click();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.getElementById('preflight').hidden);
    assert.equal(await page.evaluate(()=>window.IRONWAKE.snapshot().state),'briefing','cancel during shutter closing');
   }
   const open=async()=>{await page.locator('#start').click();await page.waitForFunction(()=>document.getElementById('preflight').dataset.phase==='service');assert.equal((await page.evaluate(()=>window.IRONWAKE.snapshot())).state,'preflight');};
   await open();assert.equal(await page.locator('.launch-lever').isDisabled(),true);
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
    const lever=await page.locator('.launch-lever').boundingBox(),x=lever.x+lever.width/2,y=lever.y+20;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+15,{steps:4});await page.mouse.up();
    assert.equal(await page.locator('#preflight').getAttribute('data-phase'),'service','short pull returns safely');
    await page.keyboard.press('Escape');await page.waitForFunction(()=>document.getElementById('preflight').hidden);
    assert.equal(await page.evaluate(()=>window.IRONWAKE.snapshot().state),'briefing');
    await open();assert.equal(await page.locator('.launch-lever').isDisabled(),true,'checks reset on reentry');
    for(const button of await page.locator('.system-switch').all())await button.click();
    const second=await page.locator('.launch-lever').boundingBox(),sx=second.x+second.width/2,sy=second.y+20;
    await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx,sy+Math.max(75,second.height*.5),{steps:10});await page.mouse.up();
   }else{await page.locator('.launch-lever').focus();await page.keyboard.press('Enter');}
   await page.waitForFunction(()=>document.getElementById('preflight').hidden&&window.IRONWAKE.snapshot().state==='playing');
   assert.equal(await page.locator('#game').evaluate(el=>el.inert),false);assert.equal(await page.locator('#game').evaluate(el=>getComputedStyle(el).filter),'none');
   assert.equal(await page.evaluate(()=>window.IRONWAKE.snapshot().rendering.type),name==='canvas'?'Canvas 2D':'PixiJS WebGL');
   assert.deepEqual(errors,[]);console.log('PASS preflight '+name+': interlocks, frozen combat, reentry/launch, focus and no browser errors');await page.close();
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
