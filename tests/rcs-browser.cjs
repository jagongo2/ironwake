const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const hook=`
window.__rcsTest={
 prepare(){window.__manualRCS=true;window.__seed=3817;options.shake=false;reset(true);player.x=760;player.y=230;ships=[player];cam={x:player.x-W*.5,y:60};keys.clear();},
 step(n){for(let i=0;i<n;i++)update(1/60);render();return {...window.IRONWAKE.attitude(),x:player.x,y:player.y,vx:player.vx,vy:player.vy,grounded:player.grounded,rcsParticles:particles.filter(p=>p.type==='rcs').length};},
 shake(value){options.shake=value;},
 ground(){player.gearTime=2.1;player.gearTarget=true;player.y=FLOOR-gearClearance(player);player.vy=0;player.grounded=player.resting=true;},
 fireAtPointer(){player.cool=0;player.heat=0;player.overheated=false;const vx=player.vx,vy=player.vy;fire(player);const b=bullets.at(-1),m=player.world(player.w/2,14);return {aim:player.aim,expected:Math.atan2(pointer.y+cam.y-m.y,pointer.x+cam.x-m.x),bulletDirection:Math.atan2(b.vy-vy*.35,b.vx-vx*.35)};}
};
`;
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/favicon.ico'){res.writeHead(204).end();return;}
 if(name!=='/'&&!/^\/(src|assets)\//.test(name)){res.writeHead(404).end();return;}
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.png')?'image/png':'text/javascript; charset=utf-8');
  if(name==='/src/game.js'){let source=fs.readFileSync(file,'utf8').replace('function loop(ts){','function loop(ts){if(window.__manualRCS)return;');source=source.replace(/\}\)\(\);\s*$/,hook+'\n})();');res.end(source);}else res.end(fs.readFileSync(file));
 }catch{res.writeHead(404).end();}
});
(async()=>{
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const results=[];
  for(const backend of ['canvas','webgl']){
   const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.__seed=3817;Math.random=()=>{window.__seed=(Math.imul(window.__seed,1664525)+1013904223)>>>0;return window.__seed/4294967296;};});
   await page.goto('http://127.0.0.1:'+server.address().port+'/?renderer='+backend);await page.waitForFunction(()=>window.__rcsTest&&window.IRONWAKE.snapshot().frames>5);
   await page.evaluate(()=>window.__rcsTest.prepare());
   await page.keyboard.down('e');const first=await page.evaluate(()=>window.__rcsTest.step(1));assert.ok(first.angularVelocity>.65);
   await page.keyboard.down('e');const turn=await page.evaluate(()=>window.__rcsTest.step(29));
   assert.ok(turn.angle>.55&&turn.angle<1.05);assert.ok(turn.vx>4,'tilted main thrust supplies lateral evasion');assert.ok(turn.rcsParticles>0,'RCS plumes visible');
   await page.mouse.move(1200,400);await page.evaluate(()=>window.__rcsTest.step(1));
   const shot=await page.evaluate(()=>window.__rcsTest.fireAtPointer());assert.ok(Math.abs(shot.aim-shot.expected)<.01);assert.ok(Math.abs(shot.bulletDirection-shot.aim)<1e-8,'turret stays world aimed');
   await page.screenshot({path:path.join(root,'artifacts','rcs-'+backend+'.png')});
   await page.keyboard.up('e');const recovered=await page.evaluate(()=>window.__rcsTest.step(150));assert.ok(Math.abs(recovered.angle)<.01);assert.ok(Math.abs(recovered.angularVelocity)<.025);
   await page.evaluate(()=>window.__rcsTest.prepare());await page.keyboard.down('q');const left=await page.evaluate(()=>window.__rcsTest.step(30));await page.keyboard.up('q');
   assert.ok(left.angle<-.55&&left.vx<-4,'left evasive bank');
   await page.keyboard.down('e');const reversal=await page.evaluate(()=>window.__rcsTest.step(12));assert.ok(reversal.angularVelocity>0,'counter-thrust reverses turn');await page.keyboard.up('e');
   await page.evaluate(()=>window.__rcsTest.prepare());await page.keyboard.down('q');await page.keyboard.down('e');const neutral=await page.evaluate(()=>window.__rcsTest.step(30));assert.equal(neutral.command,0);assert.equal(neutral.angle,0);await page.keyboard.up('q');await page.keyboard.up('e');
   await page.evaluate(()=>{window.__rcsTest.prepare();window.__rcsTest.ground();});await page.keyboard.down('e');const grounded=await page.evaluate(()=>window.__rcsTest.step(20));assert.ok(grounded.grounded);assert.ok(Math.abs(grounded.angle)<.02);await page.keyboard.up('e');
   await page.evaluate(()=>{window.__rcsTest.prepare();window.__rcsTest.shake(true);});await page.keyboard.down('e');const sway=await page.evaluate(()=>window.__rcsTest.step(8));assert.ok(Math.abs(sway.cameraSway)>0&&Math.abs(sway.cameraSway)<1.6);
   await page.evaluate(()=>window.__rcsTest.shake(false));const steady=await page.evaluate(()=>window.__rcsTest.step(1));assert.equal(steady.cameraSway,0);await page.keyboard.up('e');
   results.push({first,turn,left,recovered});assert.deepEqual(errors,[]);await page.close();
  }
  assert.deepEqual(results[0],results[1],'same RCS physics on both renderers');
  console.log('PASS real Q/E input, snap, drift, braking, opposite/simultaneous keys, plume rendering, landing, world aiming, motion preference and identical Canvas/WebGL physics');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
