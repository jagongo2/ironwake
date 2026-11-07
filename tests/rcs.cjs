const assert=require('node:assert/strict');
(async()=>{
 const {stepRCS,stepRCSSway,RCS_TUNING}=await import('../src/rcs.js');
 const body=()=>({angle:0,av:0,count:1000,initial:1000,inertiaRadius:800,engineRatio:1,grounded:false,resting:false,dead:false});
 const run=(s,command,seconds,dt=1/120)=>{const frames=[];for(let i=0;i<Math.round(seconds/dt);i++){stepRCS(s,command,dt);s.angle+=s.av*dt;frames.push({angle:s.angle,av:s.av,torque:s.rcs?.torque});}return frames;};
 const idle=body();assert.equal(stepRCS(idle,0,1/60),false);assert.equal(idle.rcs,undefined);
 const right=body(),left=body();const r=run(right,1,.7),l=run(left,-1,.7);
 for(let i=0;i<r.length;i++){assert.ok(Math.abs(r[i].angle+l[i].angle)<1e-10);assert.ok(Math.abs(r[i].av+l[i].av)<1e-10);}
 assert.ok(r[0].av>.6,'first-step impulse');assert.ok(r[1].av-r[0].av<.2,'impulse not repeated while held');
 const peak=Math.max(...r.map(f=>f.angle));assert.ok(peak>RCS_TUNING.bank&&peak<1,'bounded overshoot');
 const recovery=run(right,0,2.5);assert.ok(Math.abs(right.angle)<.006&&Math.abs(right.av)<.02,'settled level');
 assert.ok(recovery.some(f=>f.angle<0),'small return overshoot');assert.ok(Math.min(...recovery.map(f=>f.angle))>-.13,'controlled bounce');
 const reversal=body();run(reversal,1,.22);run(reversal,-1,.16);assert.ok(reversal.av<0,'opposite control brakes and reverses');
 const long=body();run(long,1,10);assert.ok(Math.abs(long.angle-RCS_TUNING.bank)<.003,'no unlimited spin');
 const spam=body();let maxRate=0;for(let i=0;i<3600;i++){stepRCS(spam,i%2,1/60);spam.angle+=spam.av/60;maxRate=Math.max(maxRate,Math.abs(spam.av));}assert.ok(maxRate<3,'repeated taps cannot pump unbounded angular velocity');
 const a=body(),b=body();run(a,1,.5,1/60);run(b,1,.5,1/240);assert.ok(Math.abs(a.angle-b.angle)<.035,'substep stability');
 const grounded=body();grounded.resting=true;stepRCS(grounded,1,1/60);assert.equal(grounded.av,0,'cannot wrench off landing supports');
 const dead=body();dead.dead=true;dead.av=.5;stepRCS(dead,1,1/60);assert.equal(dead.av,.5,'dead hull keeps collision momentum');
 const weak=body();weak.engineRatio=.25;stepRCS(weak,1,1/60);const intact=body();stepRCS(intact,1,1/60);assert.ok(weak.av<intact.av*.4,'damage reduces authority');
 const light=body(),heavy=body();stepRCS(light,1,1/60);stepRCS(heavy,1,1/60);light.count=650;stepRCS(light,1,1/60);stepRCS(heavy,1,1/60);assert.ok(light.av>heavy.av,'lower hull inertia responds faster to the same torque');
 for(let i=0;i<240;i++)stepRCSSway(long.rcs,1/60,true);assert.ok(Math.abs(long.rcs.cameraX)<1.6,'bounded sway');
 stepRCSSway(long.rcs,1/60,false);assert.equal(long.rcs.cameraX,0);assert.equal(long.rcs.cameraVelocity,0);
 console.log(JSON.stringify({peakDegrees:peak*180/Math.PI,returnOvershootDegrees:Math.min(...recovery.map(f=>f.angle))*180/Math.PI,settledDegrees:right.angle*180/Math.PI}));
 console.log('PASS RCS impulse, mirrored torque, counter-thrust, recovery, rate limits, substeps, landing, damage and motion preference');
})().catch(e=>{console.error(e);process.exitCode=1;});
