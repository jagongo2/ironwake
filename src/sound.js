// Local sample layers + reusable synthesized pressure/engine beds. Audio never
// consumes the simulation's PRNG, performs network I/O in a frame, or owns physics.
const RATE=32000,MAX_VOICES=28;
const COMBAT_FILES=['cannon-light.ogg','cannon-heavy.ogg','blast-impact.ogg','blast-wreck.ogg'];
export const SAMPLE_FILES=[
 'impactMetal_heavy_000.ogg','impactMetal_heavy_001.ogg',
 'impactPlate_heavy_000.ogg','impactPlate_heavy_001.ogg',
 'impactMetal_light_000.ogg','impactMetal_light_001.ogg',
 'switch_003.ogg','switch_004.ogg','scratch_004.ogg','diesel-loop.ogg',...COMBAT_FILES
];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

function waveforms(){
 const rand=random(0x19a7be),result={};
 const make=(name,seconds,fn,level=.7)=>{
  const a=new Float32Array(Math.round(seconds*RATE));let peak=0,previous=0,brown=0;
  for(let i=0;i<a.length;i++){
   const t=i/RATE,n=rand()*2-1;previous+=.12*(n-previous);brown=clamp(brown*.998+n*.018,-1,1);
   const v=fn(t,n,previous,brown)*Math.min(1,t/.002,(seconds-t)/.012);
   a[i]=Number.isFinite(v)?v:0;peak=Math.max(peak,Math.abs(a[i]));
  }
  if(peak)for(let i=0;i<a.length;i++)a[i]*=level/peak;
  result[name]=a;
 };
 make('shotLight',.24,(t,n,low)=>n*Math.exp(-t*105)*.6+low*Math.exp(-t*24)+Math.sin(2*Math.PI*(145*t-48*t*t))*Math.exp(-t*32)*.48);
 make('shotHeavy',.82,(t,n,low,brown)=>n*Math.exp(-t*75)*.45+low*Math.exp(-t*8)*.7+brown*Math.exp(-t*5)+Math.sin(2*Math.PI*(88*t-22*t*t))*Math.exp(-t*10)*.5);
 make('blast',1.3,(t,n,low,brown)=>(low*.9+brown*.7+n*.1)*Math.exp(-t*4.7)*(1+.18*Math.sin(t*63))+n*Math.exp(-t*70)*.4);
 make('pressure',1.0,t=>(Math.sin(2*Math.PI*(66*t-17*t*t))+.4*Math.sin(2*Math.PI*113*t))*Math.exp(-t*8));
 make('tail',1.8,(t,n,low,brown)=>(low*.55+brown*.8)*Math.exp(-t*3)*(1-Math.exp(-t*24)));
 make('metal',.36,(t,n)=>n*Math.exp(-t*85)*.35+(Math.sin(t*2*Math.PI*283)+.5*Math.sin(t*2*Math.PI*719)+.24*Math.sin(t*2*Math.PI*1181))*Math.exp(-t*18)*.25);
 make('switch',.095,(t,n)=>n*Math.exp(-t*100)+Math.sin(t*2*Math.PI*370)*Math.exp(-t*75)*.3);
 make('air',.18,(t,n,low)=>(n-low)*Math.sin(Math.PI*Math.min(1,t/.18))*Math.exp(-t*12));
 make('servo',.7,(t,n,low)=>(low*.3+Math.sin(t*2*Math.PI*92)*.3+Math.sin(t*2*Math.PI*181)*.1)*(1-Math.exp(-t*35))*Math.exp(-t*3));
 // Seamless periodic engine cycles; no live noise generation or oscillator fleet.
 const loop=(name,fn)=>{
  const a=new Float32Array(RATE*4);for(let i=0;i<a.length;i++)a[i]=fn(i/RATE);result[name]=a;
 };
 loop('engineLow',t=>(Math.sin(2*Math.PI*42*t)*.46+Math.sin(2*Math.PI*84*t)*.18+Math.sin(2*Math.PI*126*t)*.09)*(1+.11*Math.sin(2*Math.PI*7*t)));
 loop('engineRattle',t=>{const p=.5+.5*Math.sin(2*Math.PI*19*t+.18*Math.sin(2*Math.PI*3*t));return (Math.sin(2*Math.PI*157*t)*.17+Math.sin(2*Math.PI*241*t)*.1+Math.sin(2*Math.PI*397*t)*.04)*p*p;});
 // Crossfaded broadband beds avoid a click at the loop join.
 for(const name of ['engineAir','fireBed']){
  const a=new Float32Array(RATE*4);let low=0,brown=0;
  for(let i=0;i<a.length;i++){const n=rand()*2-1;low+=.13*(n-low);brown=brown*.997+n*.014;
   const pulse=1+.16*Math.sin(2*Math.PI*23*i/RATE)+.08*Math.sin(2*Math.PI*41*i/RATE);
   a[i]=name==='engineAir'?(low*.9+(n-low)*.08+brown*.3)*pulse:low*.65+brown*.3+(rand()>.998?n*.4:0);
  }
  const fade=3200;for(let i=0;i<fade;i++){const k=i/(fade-1),j=a.length-fade+i;a[j]=a[j]*(1-k)+a[i]*k;}
  result[name]=a.slice(fade);
 }
 return result;
}
let pcm;

export function createGameSound({context=null,loadSamples=true}={}){
 pcm||=waveforms();
 const rng=random(0xf17c09),buffers=new Map(),voices=[],loops=[],limits=new Map(),counts={};
 let ctx=context,output,bedBus,enabled=false,volume=.45,ready=Promise.resolve(),loaded=0,failed=0,muteTimer=0;
 let engineLoad=0,engineAirLevel=0,duckUntil=0,duckDepth=0;
 let lastUpdate=-1,lastMode='',engineLevel=0,loopGain=[],loopSource=[],disposed=false,lastEvent=null,serial=0;
 const listener={x:265,y:300,width:640};
 const target=(param,value,t,speed=.06)=>param.setTargetAtTime(value,t,speed);
 function createBuffer(a){const b=ctx.createBuffer(1,a.length,RATE);b.copyToChannel(a,0);return b;}
 function initialize(){
  if(output||disposed)return;
  if(!ctx){const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)return;try{ctx=new AC({latencyHint:'interactive'});}catch{return;}}
  for(const [name,a] of Object.entries(pcm))buffers.set(name,createBuffer(a));
  const highpass=ctx.createBiquadFilter(),compressor=ctx.createDynamicsCompressor(),ceiling=ctx.createWaveShaper();
  highpass.type='highpass';highpass.frequency.value=27;highpass.Q.value=.5;
  compressor.threshold.value=-12;compressor.knee.value=12;compressor.ratio.value=5;compressor.attack.value=.003;compressor.release.value=.2;
  const curve=new Float32Array(2049);for(let i=0;i<curve.length;i++)curve[i]=.97*Math.tanh((i/1024-1)*1.25)/Math.tanh(1.25);
  ceiling.curve=curve;ceiling.oversample='none';output=ctx.createGain();output.gain.value=0;
  // Only the continuous beds duck. A cannon must not turn down the next cannon.
  bedBus=ctx.createGain();bedBus.connect(output);
  output.connect(highpass);highpass.connect(compressor);compressor.connect(ceiling);ceiling.connect(ctx.destination);
  for(const name of ['engineLow','engineRattle','engineAir','fireBed']){
   const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buffers.get(name);s.loop=true;g.gain.value=0;
   s.connect(g);g.connect(bedBus);s.start();loops.push({s,g});loopSource.push(s);loopGain.push(g);
  }
  if(loadSamples)ready=Promise.all(SAMPLE_FILES.map(async name=>{
   try{
    const folder=COMBAT_FILES.includes(name)?'combat/':name==='diesel-loop.ogg'?'field/':'kenney/';
    const r=await fetch(new URL('../assets/audio/'+folder+name,import.meta.url));if(!r.ok)throw Error('HTTP '+r.status);
    const source=await ctx.decodeAudioData(await r.arrayBuffer());
    // Copy to mono once. Source tails and attack are retained with tiny edge fades.
    const a=new Float32Array(source.length);let peak=0;
    for(let c=0;c<source.numberOfChannels;c++){const channel=source.getChannelData(c);for(let i=0;i<a.length;i++)a[i]+=channel[i]/source.numberOfChannels;}
    for(const value of a)peak=Math.max(peak,Math.abs(value));
    if(peak<.00001)throw Error('empty sample');
    const b=ctx.createBuffer(1,a.length,source.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<a.length;i++)d[i]=a[i]*(.65/peak)*Math.min(1,i/24,(a.length-1-i)/48);
    if(name==='diesel-loop.ogg'){
     // End-to-start overlap once at decode, with no live DSP or loop seam click.
     const fade=Math.min(Math.round(source.sampleRate*.2),Math.floor(d.length/4));
     for(let i=0;i<fade;i++){const k=i/(fade-1),j=d.length-fade+i;d[j]=d[j]*(1-k)+d[i]*k;}
     const loop=ctx.createBuffer(1,d.length-fade,source.sampleRate);loop.copyToChannel(d.subarray(fade),0);
     buffers.set(name,loop);
     const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=loop;s.loop=true;g.gain.value=0;
     s.connect(g);g.connect(bedBus);s.start();loops.push({s,g});loopSource[4]=s;loopGain[4]=g;
    }else buffers.set(name,b);
    loaded++;
   }catch{failed++;} // Procedural material layers remain usable offline/unsupported.
  }));
 }
 function release(v){if(v.done)return;v.done=true;const i=voices.indexOf(v);if(i>=0)voices.splice(i,1);for(const s of v.sources)s.disconnect();v.gain.disconnect();v.tone.disconnect();v.pan.disconnect();}
 function stop(v){if(v.done)return;const t=ctx.currentTime;v.gain.gain.cancelScheduledValues(t);target(v.gain.gain,0,t,.002);for(const s of v.sources)try{s.stop(t+.008);}catch{} }
 function choose(prefix,fallback){const names=SAMPLE_FILES.filter(n=>n.startsWith(prefix));return names.length?names[Math.floor(rng()*names.length)]:fallback;}
 const sample=(name,fallback)=>buffers.has(name)?name:fallback;
 function layers(name,size,options){
  const force=Math.pow(size,.65);
  const metal=sample(choose('impactMetal_heavy','metal'),'metal'),plate=sample(choose('impactPlate_heavy','metal'),'metal');
  const light=sample(choose('impactMetal_light','metal'),'metal'),sw=sample(options.on===false?'switch_004.ogg':'switch_003.ogg','switch');
  const scrape=sample('scratch_004.ogg','air');
  switch(name){
   case 'lightShot':return [[sample('cannon-light.ogg','shotLight'),.72,1],['pressure',.12,1.5],[metal,.16,1.3,.035],['air',.06,1.1,.065]];
   case 'heavyShot':return [[sample('cannon-heavy.ogg','shotHeavy'),.82,1],['pressure',.26,.82],[plate,.19,.7,.065],['tail',.09,.85,.09]];
   case 'explosion':{
    // An impact snaps, fuel vents, and a wreck leaves a longer debris trail.
    // These are audio descriptions of existing events, not extra detonations.
    const wreck=options.kind==='wreck',fuel=options.kind==='fuel',large=wreck||fuel||size>1;
    const body=sample(large?'blast-wreck.ogg':'blast-impact.ogg','blast');
    const rate=wreck?clamp(.97-size*.07,.79,.95):fuel?1.12:large?clamp(1.13-size*.10,.88,1.1):clamp(1.28-size*.28,1,1.25);
    return [[body,(large?.62:.48)*force,rate],['pressure',(fuel?.28:.2)*force,large?.78:1.15],
     [wreck?plate:metal,(wreck?.23:.12)*Math.sqrt(size),wreck?.65:.9,large?.16:.055],
     [fuel?'air':'tail',(fuel?.24:.07)*force,fuel?.46:1,large?.09:.035]];
   }
   case 'metal':return [[metal,.25+.15*size,.9],[plate,.12,.8,.015],['metal',.09,1.25,.018]];
   case 'hit':return [[light,.37,.95],[plate,.11,.9,.01]];
   case 'rcs':return [['air',.16,1.1]];
   case 'gear':return [['servo',.16,.8],[sw,.24,.9],[scrape,.06,.75,.035],[plate,.08,.9,.15]];
   case 'gearLatch':return [[sw,.17,1],[light,.11,1.05,.005]];
   case 'motor':return [['servo',.3,.7],[plate,.1,.65],[scrape,.08,.65,.04],['tail',.08,1.2]];
   case 'impact':return [[plate,.53,.65],['pressure',.28,1.5],[metal,.14,.82,.03]];
   case 'lever':return [[plate,.47,.6],[sw,.2,.7],['pressure',.18,1.45]];
   case 'lever-home':return [[plate,.19,.95],[sw,.1,.85]];
   case 'detent':return [[sw,.22,1.1],[light,.09,1.2]];
   case 'switch':return [[sw,.29,options.on===false?.87:1],[light,.06,1.4,.008]];
   case 'ui':return [[sw,.19,1.1],[light,.035,1.5],['air',.02,.85,.012]];
   default:return [];
  }
 }
 function play(name,options={}){
  if(!output||!enabled||volume<=0||disposed||ctx.state==='closed')return false;
  const size=clamp(options.size??1,.15,2.5),now=ctx.currentTime;
  const ui=options.ui||['ui','switch','motor','impact','lever','lever-home','detent'].includes(name);
  const x=options.x??listener.x,y=options.y??listener.y,distance=Math.hypot(x-listener.x,y-listener.y);
  const attenuation=ui?1:1/(1+Math.pow(distance/460,1.45));if(attenuation<.025)return false;
  const pan=ui?0:clamp((x-listener.x)/Math.max(240,listener.width*.7),-.85,.85);
  const key=name+':'+(ui?'ui':Math.floor(x/64)+','+Math.floor(y/64));
  const spacing=name==='metal'||name==='hit'?.045:name==='explosion'?.035:name==='ui'?.04:0;
  if(now-(limits.get(key)??-10)<spacing)return false;
  if(limits.size>256)limits.clear();limits.set(key,now);
  const priority=ui?4:name==='heavyShot'?4:name==='explosion'?3:name==='lightShot'?2:1;
  if(voices.length>=MAX_VOICES){
   let oldest=voices[0];for(const v of voices)if(v.priority<oldest.priority||(v.priority===oldest.priority&&v.id<oldest.id))oldest=v;
   if(oldest.priority>priority)return false;
   // Retire the slot now, but let its 8ms fade end before disconnecting nodes.
   stop(oldest);voices.splice(voices.indexOf(oldest),1);
  }
  const gain=ctx.createGain(),panner=ctx.createStereoPanner?ctx.createStereoPanner():ctx.createGain();
  // One inexpensive filter per event softens distant reports without a reverb
  // processor, propagation delay or an unbounded graph of effect nodes.
  const tone=ctx.createBiquadFilter();tone.type='lowpass';tone.frequency.value=ui?18000:1800+11500*attenuation;tone.Q.value=.5;
  if(panner.pan)panner.pan.value=pan;gain.gain.value=attenuation*(options.gain??1)*(.8+.2*Math.sqrt(size));gain.connect(tone);tone.connect(panner);panner.connect(output);
  const v={id:++serial,priority,gain,pan:panner,tone,sources:[],done:false};voices.push(v);
  const t=Math.max(now,options.when??now),variation=.97+rng()*.06;let pending=0;
  for(const [buffer,level,rate=1,delay=0] of layers(name,size,options)){
   const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buffers.get(buffer);if(!s.buffer)continue;
   s.playbackRate.value=rate*variation;g.gain.value=level;s.connect(g);g.connect(gain);v.sources.push(s);pending++;
   s.onended=()=>{g.disconnect();if(--pending===0)release(v);};s.start(t+delay);
  }
  if(!pending){release(v);return false;}
  if(!ui&&(name==='heavyShot'||name==='explosion'&&size>=1)){
   const strength=attenuation*clamp(size,.4,1.8),end=t+(name==='heavyShot'?.16:.26);
   const p=bedBus.gain;if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(t);else p.cancelScheduledValues(t);
   duckDepth=Math.max(t<duckUntil?duckDepth:0,clamp(strength*.32,0,.55));
   target(p,1-duckDepth,t,.008);duckUntil=Math.max(duckUntil,end);target(p,1,duckUntil,.16);
  }
  counts[name]=(counts[name]||0)+1;lastEvent={name,kind:options.kind||null,pan,attenuation,cutoff:tone.frequency.value};return true;
 }
 function update(frame){
  listener.x=frame.x;listener.y=frame.y;listener.width=frame.width;
  if(!output||disposed)return;const t=ctx.currentTime;
  if(frame.mode===lastMode&&t-lastUpdate<1/30)return;lastUpdate=t;lastMode=frame.mode;
  const flying=frame.mode==='playing',hangar=frame.mode==='preflight';
  const strength=frame.dead?0:clamp(frame.integrity??1,0,1),throttle=clamp(frame.throttle??1,0,2);
  // Rotor speed changes slowly; exhaust follows thrust more promptly. Damage
  // reduces total output while leaving a relatively rougher mechanical bed.
  engineLoad=throttle;engineLevel=flying?.13*strength*(.3+.7*Math.sqrt(throttle)):hangar?.012:.003;
  engineAirLevel=flying?.105*strength*Math.pow(throttle,1.35):0;
  target(loopGain[0].gain,engineLevel*.72,t,.2);target(loopGain[1].gain,engineLevel*(loopGain[4]?.2:.5)*(1+(1-strength)*.7),t,.14);
  target(loopGain[2].gain,engineAirLevel,t,.09);
  target(loopGain[3].gain,flying?clamp(frame.fire||0,0,1)*.035:0,t,.18);
  target(loopSource[0].playbackRate,.76+throttle*.16,t,.24);target(loopSource[1].playbackRate,.72+throttle*.2,t,.2);
  target(loopSource[2].playbackRate,.78+throttle*.16,t,.16);
  if(loopGain[4]){target(loopGain[4].gain,engineLevel,t,.2);target(loopSource[4].playbackRate,.78+throttle*.16,t,.28);}
 }
 function setEnabled(on,value=volume){
  initialize();enabled=!!on;volume=clamp(Number(value)||0,0,1);
  if(!output)return;target(output.gain,enabled?volume*.68:0,ctx.currentTime,.025);
  clearTimeout(muteTimer);
  if(enabled&&ctx.state==='suspended'&&ctx.resume)ctx.resume().catch(()=>{});
  if(!enabled){for(const v of [...voices])stop(v);if(!ctx.startRendering)muteTimer=setTimeout(()=>{if(!enabled&&ctx.state==='running')ctx.suspend().catch(()=>{});},110);}
 }
 const uiClick=event=>{
  const element=event.target.closest?.('button,input[type="checkbox"]');if(!element||element.disabled)return;
  if(element.closest('.launch-lever')||element.classList.contains('system-switch'))return;
  play(element.matches('input')?'switch':'ui',{ui:true,on:element.checked});
 };
 globalThis.document?.addEventListener('click',uiClick);
 const visibility=()=>{
  if(!output||ctx.startRendering)return;
  if(document.hidden){for(const v of [...voices])stop(v);ctx.suspend().catch(()=>{});}
  else if(enabled){lastUpdate=-1;ctx.resume().catch(()=>{});}
 };
 globalThis.document?.addEventListener('visibilitychange',visibility);
 function destroy(){disposed=true;clearTimeout(muteTimer);globalThis.document?.removeEventListener('click',uiClick);globalThis.document?.removeEventListener('visibilitychange',visibility);for(const v of [...voices]){stop(v);release(v);}for(const {s,g} of loops){try{s.stop();}catch{}s.disconnect();g.disconnect();}bedBus?.disconnect();if(ctx&&ctx.close)ctx.close().catch(()=>{});}
 return {
  unlock(){initialize();if(ctx?.state==='suspended'&&ctx.resume)ctx.resume().catch(()=>{});return ctx;},
  setEnabled,play,update,destroy,
  get context(){return ctx;},get ready(){return ready;},
  diagnostics(){return {revision:'combat-2',enabled,volume,state:ctx?.state||'unavailable',loadedSamples:loaded,failedSamples:failed,sampledEngine:!!loopSource[4],sampledCombat:COMBAT_FILES.every(name=>buffers.has(name)),voices:voices.length,maxVoices:MAX_VOICES,engineLevel,engineLoad,engineAirLevel,events:{...counts},lastEvent};}
 };
}
