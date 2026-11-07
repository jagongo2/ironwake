const assert=require('node:assert/strict');
(async()=>{
 let time=0,next=0;const frames=new Map();global.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};global.cancelAnimationFrame=id=>frames.delete(id);
 const step=(count=1)=>{for(let i=0;i<count;i++){time+=1000/60;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));}};
 const {createLeverMotion}=await import('../src/lever-motion.js');const positions=[],stops=[];let gates=0;
 const lever=createLeverMotion({onUpdate:p=>positions.push(p),onStop:s=>{assert.ok(s==='latch'?positions.at(-1)>.98:positions.at(-1)<.02,'contact pose published before sound/recoil event');stops.push(s);},onDetent:()=>gates++});
 lever.begin();lever.pull(.45);assert.equal(lever.position,0,'input sets force target rather than teleporting pose');step(8);assert.ok(lever.position>.2&&lever.position<.45);
 assert.equal(lever.release(),false);step(90);assert.equal(lever.position,0);assert.equal(frames.size,0,'idle mechanism schedules no frames');
 lever.reset();lever.begin();lever.pull(.7);assert.ok(lever.target<.7*.95,'cam gate adds resistance');lever.pull(.75);assert.equal(gates,1);assert.equal(lever.release(),false);step(90);
 lever.begin();lever.pull(1);step(5);assert.equal(lever.release(),true);const locked=lever.latch();step(90);await locked;
 assert.equal(lever.position,1);assert.equal(stops.filter(s=>s==='latch').length,1,'single physical end-stop contact');assert.ok(positions.every(p=>p>=0&&p<=1));
 lever.reset();assert.equal(lever.position,0);assert.equal(lever.latched,false);
 const reducedStops=[];const reduced=createLeverMotion({onUpdate:()=>{},onStop:s=>reducedStops.push(s),reduced:()=>true});reduced.begin();reduced.pull(1);reduced.release();await reduced.latch();assert.equal(reduced.position,1);assert.deepEqual(reducedStops,['latch']);assert.equal(frames.size,0);
 console.log('PASS lever inertia, cam resistance, partial-pull return, positive latch, single end stop, idle suspension and reduced motion');
})().catch(e=>{console.error(e);process.exitCode=1;});
