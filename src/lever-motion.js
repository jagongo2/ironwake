// A spring-loaded mechanical throw with a stiff gate and a positive end latch.
export function createLeverMotion({onUpdate, onDetent=()=>{}, onStop=()=>{}, reduced=()=>false}) {
  let position=0,velocity=0,target=0,raw=0,held=false,latched=false,gate=false,stopped=false;
  let frame=0,last=0,waiters=[];
  const publish=()=>onUpdate(position);
  const finish=()=>{for(const resolve of waiters)resolve();waiters=[];};
  function tick(now){
    frame=0;const elapsed=last?Math.min((now-last)/1000,.04):1/60;last=now;
    const steps=Math.max(1,Math.ceil(elapsed/(1/180))),dt=elapsed/steps;let stop=null;
    for(let i=0;i<steps;i++){
      const spring=held?1050:latched?470:245,damping=held?56:latched?29:25;
      velocity+=((target-position)*spring-velocity*damping)*dt;position+=velocity*dt;
      if(position>1){position=1;velocity=-Math.abs(velocity)*.12;if(latched&&!stopped){stopped=true;stop='latch';}}
      if(position<0){position=0;velocity=Math.abs(velocity)*.12;if(!held&&!latched&&!stopped){stopped=true;stop='home';}}
    }
    publish();
    // The contact pose is submitted before sound and panel recoil share this event.
    if(stop){onStop(stop);if(stop==='latch')finish();}
    if(Math.abs(position-target)<.00035&&Math.abs(velocity)<.007){position=target;velocity=0;last=0;publish();if(latched&&!stopped){stopped=true;onStop('latch');}finish();}
    else frame=requestAnimationFrame(tick);
  }
  function wake(){
    if(reduced()){position=target;velocity=0;publish();if(latched&&!stopped){stopped=true;onStop('latch');}finish();return;}
    if(!frame)frame=requestAnimationFrame(tick);
  }
  return {
    begin(){held=true;latched=false;gate=false;stopped=false;raw=target=position;return position;},
    pull(value){
      if(latched){wake();return;}
      raw=Math.max(0,Math.min(1,value));
      if(raw>=.6&&!gate){gate=true;onDetent();}
      if(raw>=.86){held=false;latched=true;target=1;wake();return;}
      // The handle compresses against the gate before passing over its cam.
      target=Math.min(1,raw<.6?raw*.95:raw<.82?.57+(raw-.6)*.55:.691+(raw-.82)*1.7167);
      wake();
    },
    release(){held=false;target=latched?1:0;if(!latched)stopped=false;wake();return latched;},
    latch(){held=false;if(!latched)stopped=false;latched=true;target=1;const done=new Promise(resolve=>waiters.push(resolve));wake();return done;},
    returnHome(){held=latched=false;target=raw=0;stopped=false;wake();},
    reset(){if(frame)cancelAnimationFrame(frame);frame=last=0;position=velocity=target=raw=0;held=latched=gate=stopped=false;publish();finish();},
    get position(){return position;},get target(){return target;},get latched(){return latched;},get moving(){return !!frame;}
  };
}
