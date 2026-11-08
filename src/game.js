
'use strict';
(() => {
const C=document.getElementById('game'),ctx=window.__ironwakeGraphics||C.getContext('2d',{alpha:false});
let W=640,H=360,viewScale=2;
const G=57,FLOOR=640,WORLD=1900,STEP=1/60;
// A source pixel is a material cell; a compact engineering ramp shades armor and metal edges.
const PAL=['#111914','#202b25','#344138','#4f5c4b','#75816a','#a4ac83','#d4d3a4','#eee5bc','#4b3730','#78503b','#a7633c','#d58b42','#efb85c','#f7d88a','#bd4f36','#7e9a90','#151b18','#242b23','#394031','#515440','#68664b','#878265','#aaa07a','#c2b58c','#d5cba4','#e0d7b3','#a0baa0','#b27c42'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,rand=(a,b)=>a+Math.random()*(b-a);
const $=id=>document.getElementById(id);const keys=new Set();
const options={shake:!matchMedia('(prefers-reduced-motion: reduce)').matches,flash:true,scan:true};$('shake').checked=options.shake;
const pointer={x:490,y:150,down:false,inside:false};
let state='briefing',practice=false,ships=[],player,bullets=[],particles=[],chunks=[],blasts=[],pending=[],flames=[],cam={x:0,y:0},time=0,kills=0,shots=0,hits=0,shake=0,flash=0,slow=0,endTimer=0,result=null,msgTimer=0,hudTimer=0,last=0,acc=0,frames=0;
const MAX_PARTICLES=3200,MAX_FLAMES=14;
let rcsCameraOffset=0;
const stats={maxParticles:0,maxChunks:0,maxFlames:0,frames:0};
// Sample-based mechanical layers and continuous beds live in the sound module.
let audio=null,soundOn=false;
function initAudio(){if(!audio)audio=window.__ironwakeSound?.unlock()||null;}
function setSound(on){initAudio();soundOn=on;window.__ironwakeSound?.setEnabled(on,Number($('volume').value)/100);$('sound').textContent=on?'소리 ON':'소리 OFF';$('sound').setAttribute('aria-label',on?'소리 끄기':'소리 켜기');$('titleSoundState').textContent=on?'켜짐':'꺼짐';$('titleSound').setAttribute('aria-label',on?'소리 끄기':'소리 켜기');}
function playSound(name,options){if(soundOn)return window.__ironwakeSound?.play(name,options);}
function boom(size=1,metal=false,x=player?.x,y=player?.y,kind='impact'){playSound(metal?'metal':'explosion',{size,x,y,kind});}
const soundFrame={mode:'briefing',x:0,y:0,width:640,throttle:1,integrity:1,dead:false,fire:0};
function syncAudio(){if(!audio||!soundOn||!player)return;soundFrame.mode=state;soundFrame.x=player.x;soundFrame.y=player.y;soundFrame.width=W;soundFrame.throttle=player.throttle;soundFrame.integrity=player.engineRatio;soundFrame.dead=player.dead;soundFrame.fire=0;for(const f of flames)if(f.owner===player&&f.kind==='fuel')soundFrame.fire+=f.strength*.3;window.__ironwakeSound?.update(soundFrame);}
function notice(s,duration=3){$('message').textContent=s;msgTimer=duration;}
function makeCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
// Fuel, heat, smoke and velocity share a world-space flow simulation at 30 Hz.
const fireRamp=[[71,29,16],[119,37,12],[179,53,8],[230,84,8],[255,137,16],[255,190,34],[255,224,85],[255,247,180]];
const fireNoise=new Float32Array(2048);for(let i=0;i<fireNoise.length;i++)fireNoise[i]=Math.random();
// One world-space gas field: sources supply fuel, but never own a flame silhouette.
class FireFluid{
 constructor(){
  this.cell=2;this.ox=-64;this.oy=-128;this.w=Math.ceil((WORLD+128)/2);this.h=Math.ceil((FLOOR+256)/2);this.n=this.w*this.h;this.tile=16;this.tw=Math.ceil(this.w/16);this.th=Math.ceil(this.h/16);
  for(const name of ['t','f','s','u','v','nt','nf','ns','nu','nv','p','q','div','curl'])this[name]=new Float32Array(this.n);
  this.fields=['t','f','s','u','v','nt','nf','ns','nu','nv','p','q','div','curl'];this.solid=new Uint8Array(this.n);this.solidCells=[];
  this.live=new Uint8Array(this.tw*this.th);this.computed=new Uint8Array(this.live.length);this.previous=new Uint8Array(this.live.length);this.lightEnergy=new Float32Array(this.live.length);this.rasterLeft=new Int32Array(H);this.rasterRight=new Int32Array(H);this.cells=new Int32Array(this.n);this.count=0;this.acc=0;this.frame=0;this.wind=0;this.windTarget=0;this.windTime=0;this.lights=[];this.burning=0;
  this.skin=makeCanvas(W,H);this.smokeSkin=makeCanvas(W,H);this.cx=this.skin.getContext('2d');this.sx=this.smokeSkin.getContext('2d');this.image=this.cx.createImageData(W,H);this.smokeImage=this.sx.createImageData(W,H);this.rasterFrame=-1;this.rasterX=NaN;this.rasterY=NaN;
 }
 resize(){this.skin.width=this.smokeSkin.width=W;this.skin.height=this.smokeSkin.height=H;this.image=this.cx.createImageData(W,H);this.smokeImage=this.sx.createImageData(W,H);this.rasterLeft=new Int32Array(H);this.rasterRight=new Int32Array(H);this.rasterFrame=-1;}
 reset(){for(const name of this.fields)this[name].fill(0);this.live.fill(0);this.computed.fill(0);this.previous.fill(0);this.solid.fill(0);this.solidCells=[];this.count=0;this.acc=0;this.frame++;this.burning=0;this.lights=[];this.image.data.fill(0);this.smokeImage.data.fill(0);this.cx.putImageData(this.image,0,0);this.sx.putImageData(this.smokeImage,0,0);this.skin._revision=(this.skin._revision||0)+1;this.smokeSkin._revision=(this.smokeSkin._revision||0)+1;this.rasterFrame=-1;}
 index(wx,wy){return clamp(Math.floor((wx-this.ox)/2),1,this.w-2)+clamp(Math.floor((wy-this.oy)/2),1,this.h-2)*this.w}
 mark(i){const x=i%this.w,y=Math.floor(i/this.w);this.live[(x>>4)+(y>>4)*this.tw]=1}
 sample(a,x,y){x=clamp(x,1,this.w-2.001);y=clamp(y,1,this.h-2.001);const ix=x|0,iy=y|0,fx=x-ix,fy=y-iy,i=ix+iy*this.w;return (a[i]*(1-fx)+a[i+1]*fx)*(1-fy)+(a[i+this.w]*(1-fx)+a[i+this.w+1]*fx)*fy}
 flow(wx,wy){const i=this.index(wx,wy);return {u:this.u[i]*2,v:this.v[i]*2,t:this.t[i]}}
 obstacles(){for(const i of this.solidCells)this.solid[i]=0;this.solidCells.length=0;this.solid.fill(255,Math.floor((FLOOR-this.oy)/2)*this.w);
  for(let si=0;si<ships.length;si++){const ship=ships[si];if(ship.count<10)continue;const r=ship.w*.58,minx=clamp(Math.floor((ship.x-r-this.ox)/2),1,this.w-2),maxx=clamp(Math.ceil((ship.x+r-this.ox)/2),1,this.w-2),miny=clamp(Math.floor((ship.y-r-this.oy)/2),1,this.h-2),maxy=clamp(Math.ceil((ship.y+r-this.oy)/2),1,this.h-2);
   // Pose and gear stay fixed during this scan. Reuse them instead of rebuilding
   // the same lookup context for every gas cell; material/gear damage stays live.
   const cs=Math.cos(ship.angle),sn=Math.sin(ship.angle),left=gearRaster(ship,0)?.map,right=gearRaster(ship,1)?.map;
   for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){const i=x+y*this.w,dx=this.ox+x*2+1-ship.x,dy=this.oy+y*2+1-ship.y,lx=dx*cs+dy*sn+ship.w/2,ly=-dx*sn+dy*cs+ship.h/2,ix=Math.floor(lx),iy=Math.floor(ly),key=(Math.floor(lx-ship.w/2)+128)+(Math.floor(ly-ship.h/2)+64)*256;if((ix>=0&&iy>=0&&ix<ship.w&&iy<ship.h&&ship.mat[ix+iy*ship.w]!==0)||left?.has(key)||right?.has(key)){this.solid[i]=si+1;this.solidCells.push(i)}}
  }
 }
 inject(wx,wy,radius,fuel,heat,jx=0,jy=-3){
  let cx=(wx-this.ox)/2,cy=(wy-this.oy)/2;const center=this.index(wx,wy);if(this.solid[center]){for(let k=1;k<=14;k++)if(!this.solid[center-k*this.w]){cy-=k;break}}
  const r=Math.max(1,radius/2);for(let y=Math.max(1,Math.floor(cy-r));y<=Math.min(this.h-2,Math.ceil(cy+r));y++)for(let x=Math.max(1,Math.floor(cx-r));x<=Math.min(this.w-2,Math.ceil(cx+r));x++){const i=x+y*this.w;if(this.solid[i])continue;const d=((x-cx)**2+(y-cy)**2)/(r*r);if(d>=1)continue;const k=(1-d)*rand(.75,1.2);this.f[i]=Math.min(3.5,this.f[i]+fuel*k);this.t[i]=Math.min(3.5,Math.max(this.t[i],heat*k));this.u[i]+=jx*k;this.v[i]+=jy*k;this.mark(i)}
 }
 burst(wx,wy,strength){const cx=(wx-this.ox)/2,cy=(wy-this.oy)/2,r=3+strength*4;for(let y=Math.max(1,Math.floor(cy-r));y<Math.min(this.h-1,cy+r);y++)for(let x=Math.max(1,Math.floor(cx-r));x<Math.min(this.w-1,cx+r);x++){const dx=x-cx,dy=y-cy,d=(dx*dx+dy*dy)/(r*r),i=x+y*this.w;if(d>=1)continue;const k=(1-d)*rand(.5,1.3);this.f[i]+=k*.65;this.t[i]+=k*1.8;this.u[i]+=dx/(r+.1)*strength*19*k;this.v[i]+=dy/(r+.1)*strength*19*k;this.mark(i)}}
 buildCells(){const flags=this.computed;flags.fill(0);for(let ty=0;ty<this.th;ty++)for(let tx=0;tx<this.tw;tx++){if(!this.live[tx+ty*this.tw])continue;for(let yy=Math.max(0,ty-1);yy<=Math.min(this.th-1,ty+1);yy++)for(let xx=Math.max(0,tx-1);xx<=Math.min(this.tw-1,tx+1);xx++)flags[xx+yy*this.tw]=1}
  this.count=0;for(let ty=0;ty<this.th;ty++)for(let tx=0;tx<this.tw;tx++){const ti=tx+ty*this.tw;if(!flags[ti]&&!this.previous[ti])continue;for(let y=Math.max(1,ty*16);y<Math.min(this.h-1,(ty+1)*16);y++)for(let x=Math.max(1,tx*16);x<Math.min(this.w-1,(tx+1)*16);x++){const i=x+y*this.w;if(flags[ti])this.cells[this.count++]=i;else for(const name of this.fields)this[name][i]=0}}this.previous.set(flags);
 }
 step(dt){this.acc+=dt;while(this.acc>=1/30){this.acc-=1/30;this.obstacles();for(let i=flames.length-1;i>=0;i--){flames[i].step(1/30);if(flames[i].life<=0)flames.splice(i,1)}this.advance(1/30)}}
 advance(dt){this.buildCells();this.frame++;const w=this.w,cells=this.cells,n=this.count;if(!n){this.burning=0;this.lights=[];return}
  this.windTime-=dt;if(this.windTime<=0){this.windTarget=rand(-2,2);this.windTime=rand(.5,1.8)}this.wind=lerp(this.wind,this.windTarget,dt*.7);
  const t=this.t,f=this.f,s=this.s,u=this.u,v=this.v,nu=this.nu,nv=this.nv,nt=this.nt,nf=this.nf,ns=this.ns,solid=this.solid;
  // Buoyancy and drag create velocity differences; confinement restores the small eddies
  // lost by semi-Lagrangian advection. No periodic flame path is imposed.
  for(let k=0;k<n;k++){const i=cells[k];if(solid[i]){const ship=ships[solid[i]-1];u[i]=ship?ship.vx*.5:0;v[i]=ship?ship.vy*.5:0;continue}u[i]=(u[i]+this.wind*dt*.6*Math.min(1,t[i]+s[i]))*.97;v[i]=(v[i]+(-t[i]*17+s[i]*.22)*dt)*.97}
  for(let k=0;k<n;k++){const i=cells[k];this.curl[i]=((v[i+1]-v[i-1])-(u[i+w]-u[i-w]))*.5}
  for(let k=0;k<n;k++){const i=cells[k];if(solid[i])continue;let gx=Math.abs(this.curl[i+1])-Math.abs(this.curl[i-1]),gy=Math.abs(this.curl[i+w])-Math.abs(this.curl[i-w]),len=Math.hypot(gx,gy)+.0001,omega=this.curl[i]*clamp(t[i]+s[i]*.2,0,1);u[i]=clamp(u[i]+gy/len*omega*dt*5,-65,65);v[i]=clamp(v[i]-gx/len*omega*dt*5,-75,65)}
  for(let k=0;k<n;k++){const i=cells[k],x=i%w,y=(i/w)|0;if(solid[i]){nu[i]=u[i];nv[i]=v[i];continue}const bx=x-u[i]*dt,by=y-v[i]*dt;nu[i]=this.sample(u,bx,by);nv[i]=this.sample(v,bx,by)}
  for(let k=0;k<n;k++){const i=cells[k];this.p[i]=0;this.q[i]=0;this.div[i]=solid[i]?0:((nu[i+1]-nu[i-1])+(nv[i+w]-nv[i-w]))*.5}
  // A local pressure solve couples nearby flames and routes gas around hull material.
  let p=this.p,q=this.q;for(let iter=0;iter<6;iter++){for(let k=0;k<n;k++){const i=cells[k];if(solid[i]){q[i]=0;continue}const c=p[i];q[i]=((solid[i-1]?c:p[i-1])+(solid[i+1]?c:p[i+1])+(solid[i-w]?c:p[i-w])+(solid[i+w]?c:p[i+w])-this.div[i])*.25}const swap=p;p=q;q=swap}this.p=p;this.q=q;
  for(let k=0;k<n;k++){const i=cells[k];if(solid[i])continue;nu[i]-=(p[i+1]-p[i-1])*.5;nv[i]-=(p[i+w]-p[i-w])*.5;if(solid[i-1]||solid[i+1])nu[i]*=.2;if(solid[i-w]||solid[i+w])nv[i]*=.2}
  this.live.fill(0);this.burning=0;const lightEnergy=this.lightEnergy;lightEnergy.fill(0);
  for(let k=0;k<n;k++){const i=cells[k],x=i%w,y=(i/w)|0;if(solid[i]){nt[i]=nf[i]=ns[i]=0;continue}let bx=x-nu[i]*dt,by=y-nv[i]*dt;const bi=clamp(Math.round(bx),1,w-2)+clamp(Math.round(by),1,this.h-2)*w;if(solid[bi]){bx=x;by=y}
   let heat=this.sample(t,bx,by),fuel=this.sample(f,bx,by),smoke=this.sample(s,bx,by);
   const oxygen=1/(1+fuel*.45+smoke*.12),rate=heat>.19?Math.min(fuel,fuel*(1.5+heat*1.2)*oxygen*dt):0;
   fuel=Math.max(0,fuel-rate-.009*dt);heat=clamp(heat+rate*3.6-dt*(heat*.61+.035),0,3.2);smoke=clamp(smoke+rate*.42-dt*(.13+smoke*.15),0,3);
   nt[i]=heat;nf[i]=fuel;ns[i]=smoke;
   const ti=(x>>4)+(y>>4)*this.tw;if(heat>.018||fuel>.008||smoke>.025||Math.abs(nu[i])+Math.abs(nv[i])>.7)this.live[ti]=1;
   if(heat>.18){this.burning++;lightEnergy[ti]+=heat}
   if(rate>.008&&Math.random()<rate*.75){addParticle(this.ox+x*2+rand(0,2),this.oy+y*2+rand(0,2),nu[i]*2+rand(-8,8),nv[i]*2-rand(4,15),rand(.45,1.4),1,'ember',13)}
  }
  this.t=nt;this.nt=t;this.f=nf;this.nf=f;this.s=ns;this.ns=s;this.u=nu;this.nu=u;this.v=nv;this.nv=v;
  this.lights=[];for(let ti=0;ti<lightEnergy.length;ti++)if(lightEnergy[ti]>5)this.lights.push({x:this.ox+((ti%this.tw)*16+8)*2,y:this.oy+(((ti/this.tw)|0)*16+8)*2,energy:lightEnergy[ti]});
 }
 raster(){const cx=Math.round(cam.x),cy=Math.round(cam.y);if(this.rasterFrame===this.frame&&cx===this.rasterX&&cy===this.rasterY)return;this.rasterFrame=this.frame;this.rasterX=cx;this.rasterY=cy;const data=this.image.data,smoke=this.smokeImage.data;data.fill(0);smoke.fill(0);const w=this.w,t=this.t,s=this.s,left=this.rasterLeft,right=this.rasterRight;left.fill(W);right.fill(0);
  // Include both freshly injected and last-computed tiles. One cell of padding
  // preserves the original bilinear interpolation at every tile boundary.
  for(let ti=0;ti<this.live.length;ti++){if(!this.live[ti]&&!this.computed[ti])continue;const tx=ti%this.tw,ty=(ti/this.tw)|0,x0=Math.max(0,this.ox+(tx*16-1)*2-cx),x1=Math.min(W,this.ox+(tx+1)*32-cx),y0=Math.max(0,this.oy+(ty*16-1)*2-cy),y1=Math.min(H,this.oy+(ty+1)*32-cy);if(x0>=x1||y0>=y1)continue;for(let y=y0;y<y1;y++){if(x0<left[y])left[y]=x0;if(x1>right[y])right[y]=x1}}
  for(let y=0;y<H;y++){const gy=(cy+y-this.oy)/2,iy=Math.floor(gy),fy=gy-iy;if(iy<1||iy>=this.h-2)continue;for(let x=left[y];x<right[y];x++){const gx=(cx+x-this.ox)/2,ix=Math.floor(gx),fx=gx-ix;if(ix<1||ix>=w-2)continue;const i=ix+iy*w;if(t[i]+t[i+1]+t[i+w]+t[i+w+1]+s[i]+s[i+1]+s[i+w]+s[i+w+1]<.06)continue;const temp=(t[i]*(1-fx)+t[i+1]*fx)*(1-fy)+(t[i+w]*(1-fx)+t[i+w+1]*fx)*fy,density=(s[i]*(1-fx)+s[i+1]*fx)*(1-fy)+(s[i+w]*(1-fx)+s[i+w+1]*fx)*fy,pi=(x+y*W)*4;
    if(density>.035){smoke[pi]=27;smoke[pi+1]=34;smoke[pi+2]=28;smoke[pi+3]=Math.min(145,density*100)}
    if(temp<.16)continue;const noise=fireNoise[((x+cx)*17+(y+cy)*131+this.frame*11)&2047],value=temp+(noise-.5)*.065,ci=clamp(Math.floor((value-.18)*4.3),0,7),c=fireRamp[ci];data[pi]=c[0];data[pi+1]=c[1];data[pi+2]=c[2];data[pi+3]=clamp((temp-.14)*1.65,0,1)*245;
   }}this.cx.putImageData(this.image,0,0);this.sx.putImageData(this.smokeImage,0,0);this.skin._revision=(this.skin._revision||0)+1;this.smokeSkin._revision=(this.smokeSkin._revision||0)+1;
 }
}
const fireFluid=new FireFluid();
class Flame{
 constructor(x,y,strength,life,owner,lx,ly,kind){this.x=x;this.y=y;this.strength=strength;this.life=life;this.max=life;this.owner=owner;this.lx=lx;this.ly=ly;this.kind=kind;this.smokeAcc=0;this.age=0;this.reserve=life*strength;this.feed=rand(.5,1.2);this.feedTarget=this.feed;this.change=rand(.08,.35);this.patches=[];this.energy=0;
  const count=kind==='fuel'?Math.floor(rand(3,7)):2;for(let k=0;k<count;k++)this.patches.push({x:rand(-8,8)*strength,y:rand(-4,4),radius:rand(2,4.5),rate:rand(.4,1.4),jet:rand(-7,7)});if(kind==='burst')fireFluid.burst(x,y,strength);
 }
 step(dt){this.age+=dt;this.life-=dt;if(this.owner){const p=this.owner.world(this.lx,this.ly);this.x=p.x;this.y=p.y}if(this.life<=0||this.reserve<=0)return;this.change-=dt;if(this.change<=0){this.feedTarget=rand(.18,1.6);this.change=rand(.08,.42);const p=this.patches[Math.random()*this.patches.length|0];p.rate=rand(.05,1.6);p.jet=rand(-9,9)}this.feed=lerp(this.feed,this.feedTarget,dt*6);
  const fade=clamp(this.life/.7,0,1),release=this.kind==='burst'?clamp(1-this.age/.18,0,1):1,rate=this.feed*fade*release;this.reserve-=rate*dt;this.energy=rate;this.smokeAcc-=dt;if(this.kind==='fuel'&&this.smokeAcc<=0&&rate>.08){this.smokeAcc=rand(.09,.2);billowSmoke.emit(this.x,this.y-4,(this.owner?this.owner.vx*.35:0)+rand(-6,6),-rand(14,26),rand(4,7)*Math.sqrt(this.strength),rand(4,7),1.1)}
  for(const p of this.patches){let x=this.x+p.x,y=this.y+p.y;if(this.owner){const q=this.owner.world(this.lx+p.x,this.ly+p.y);x=q.x;y=q.y}fireFluid.inject(x,y,p.radius,this.strength*p.rate*rate*dt*2.8,.32+rate*.32,(p.jet+(this.owner?this.owner.vx*.18:0))*dt*rate,(-4+(this.owner?this.owner.vy*.12:0))*dt*rate)}
 }
}
function ignite(x,y,strength=1,life=.7,owner=null,lx=0,ly=0,kind='burst'){
 const existing=flames.find(f=>f.owner===owner&&f.kind===kind&&Math.hypot((owner?f.lx:f.x)-(owner?lx:x),(owner?f.ly:f.y)-(owner?ly:y))<9&&f.life>0);
 if(existing){existing.life=Math.max(existing.life,life);existing.reserve=Math.max(existing.reserve,life*strength);existing.strength=Math.max(existing.strength,strength);if(kind==='burst')fireFluid.burst(x,y,strength);return existing}
 if(flames.length>=MAX_FLAMES){const i=flames.findIndex(f=>f.kind==='burst'&&f.life<.45);if(i<0){fireFluid.burst(x,y,strength*.5);return null}flames.splice(i,1)}const f=new Flame(x,y,strength,life,owner,lx,ly,kind);flames.push(f);return f;
}

// World-space combustion parcels. Each plume keeps its momentum after emission;
// the nozzle never owns a repeating flame image or animation sheet.
const jetGas=[];
const smokeColors=[[14,17,15],[22,25,21],[32,35,29],[44,46,37],[61,61,48]];
class BillowSmoke{
 constructor(){this.puffs=[];this.resize();this.frame=0;this.renderFrame=-1;}
 resize(){this.rw=Math.ceil(W/2);this.rh=Math.ceil(H/2);this.canvas=makeCanvas(this.rw,this.rh);this.ctx=this.canvas.getContext('2d');this.image=this.ctx.createImageData(this.rw,this.rh);this.density=new Float32Array(this.rw*this.rh);this.glow=new Float32Array(this.rw*this.rh);this.renderFrame=-1;}
 reset(){this.puffs.length=0;this.frame++;this.renderFrame=-1;}
 emit(x,y,vx,vy,r=6,life=4,soot=1){
  if(this.puffs.length>=110)this.puffs.shift();
  const lobes=[];for(let j=0;j<5;j++){const a=rand(0,6.28),d=rand(.1,.65);lobes.push({x:Math.cos(a)*d,y:Math.sin(a)*d,r:rand(.5,.85),drift:rand(-.3,.3)})}
  this.puffs.push({x,y,vx,vy,r,life,max:life,soot,lobes,spin:rand(-.65,.65),rot:rand(0,6.28),wind:rand(-5,5),seed:Math.random()*65535|0});
 }
 update(dt){this.frame++;for(let i=this.puffs.length-1;i>=0;i--){const p=this.puffs[i];p.life-=dt;if(p.life<=0){this.puffs.splice(i,1);continue}
  const gas=fireFluid.flow(p.x,p.y),age=p.max-p.life;
  p.vx+=(gas.u*.25+fireFluid.wind*3+p.wind-p.vx)*dt*.45;
  p.vy+=(gas.v*.2-12-p.soot*3-p.vy)*dt*.4;
  p.x+=p.vx*dt;p.y+=p.vy*dt;p.r+=dt*(2.5+Math.max(0,2-age));p.rot+=p.spin*dt;
  if(p.y+p.r>FLOOR){p.y=Math.min(p.y,FLOOR-p.r*.35);p.vx+=p.wind*dt*3}
 }}
 raster(){const cx=Math.round(cam.x),cy=Math.round(cam.y);if(this.renderFrame>=0&&this.frame-this.renderFrame<2)return;this.cx=cx;this.cy=cy;this.renderFrame=this.frame;
  const W=this.rw,H=this.rh,density=this.density,glow=this.glow,out=this.image.data;density.fill(0);glow.fill(0);out.fill(0);let minX=W,maxX=0,minY=H,maxY=0;
  for(const p of this.puffs){const age=p.max-p.life,fade=Math.min(1,age/.14)*Math.min(1,p.life/1.6),cs=Math.cos(p.rot),sn=Math.sin(p.rot);
   if((p.x-cx+p.r*2)*.5<0||(p.x-cx-p.r*2)*.5>W||(p.y-cy+p.r*2)*.5<0||(p.y-cy-p.r*2)*.5>H)continue;
   for(const l of p.lobes){const r=p.r*l.r*.5,lx=(p.x-cx+(l.x*cs-l.y*sn)*p.r)*.5,ly=(p.y-cy+(l.x*sn+l.y*cs)*p.r)*.5;
    const y0=Math.max(0,Math.floor(ly-r)),y1=Math.min(H-1,Math.ceil(ly+r));
    minX=Math.min(minX,Math.max(1,Math.floor(lx-r)));maxX=Math.max(maxX,Math.min(W-2,Math.ceil(lx+r)));minY=Math.min(minY,Math.max(1,y0));maxY=Math.max(maxY,Math.min(H-2,y1));
    for(let y=y0;y<=y1;y++){const dy=(y-ly)/r;const span=Math.sqrt(Math.max(0,1-dy*dy))*r;
     for(let x=Math.max(0,Math.floor(lx-span));x<=Math.min(W-1,Math.ceil(lx+span));x++){
      const dx=(x-lx)/r,k=1-dx*dx-dy*dy;if(k<=0)continue;
      // Grain belongs to world cells, so camera motion does not boil the texture.
      const noise=fireNoise[((x+(cx>>1))*37+(y+(cy>>1))*71+p.seed)&2047];
      const d=k*k*fade*p.soot*(.55+noise*.28),i=x+y*W;density[i]+=d;glow[i]+=d*Math.max(0,1-age/1.2);
     }
    }
   }
  }
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const i=x+y*W,d=density[i];if(d<.025)continue;
   const edge=clamp((density[i+W]-density[i-W]+density[i+1]-density[i-1])*.8,-.28,.32);
   const shade=clamp(Math.floor((.18+edge+1/(1+d)*.26)*7),0,4),warm=Math.min(1,glow[i]*.7),pi=i*4;
   const c=smokeColors[shade];
   out[pi]=c[0]+warm*20;out[pi+1]=c[1]+warm*9;out[pi+2]=c[2];out[pi+3]=Math.min(238,(1-Math.exp(-d*2))*246);
  }
  this.ctx.putImageData(this.image,0,0);this.canvas._revision=(this.canvas._revision||0)+1;
 }
}
const billowSmoke=new BillowSmoke();
function emitEngine(s,e,dt){
 e.emitAcc=(e.emitAcc||0)+dt*(75+30*s.throttle);
 const cs=Math.cos(s.angle),sn=Math.sin(s.angle),p=s.world(e.x,e.y+1);
 while(e.emitAcc>=1){e.emitAcc--;if(jetGas.length>=1400)break;
  const speed=rand(100,145)*( .55+s.throttle*.65),life=rand(.26,.42)*(.7+s.throttle*.3);
  jetGas.push({x:p.x+rand(-2,2)*cs,y:p.y+rand(-2,2)*sn,vx:s.vx-sn*speed+rand(-8,8),vy:s.vy+cs*speed,life,max:life,r:rand(1.7,3.5),seed:Math.random()*2048|0,turn:rand(-1,1),hit:false});
 }
 // Exhaust kicks ground dust sideways rather than stopping at a flat clip line.
 e.dust=(e.dust||0)-dt;const gap=FLOOR-p.y;
 if(gap<65&&gap>0&&e.dust<=0){e.dust=rand(.13,.3);billowSmoke.emit(p.x+rand(-6,6),FLOOR-3,rand(-28,28),rand(-9,-3),rand(2,4),rand(1,2),.28)}
}
function rcsHiss(){playSound('rcs',{x:player.x,y:player.y});}
function emitRCS(s,dt){const r=s.rcs;if(!r)return;if(r.kicked)rcsHiss();const power=Math.max(r.effort,r.flare>0?.65:0);if(power<.025){r.emit=0;return;}
 r.emit+=dt*(18+28*power);const direction=r.jetDirection||Math.sign(r.torque)||r.command||1,cs=Math.cos(s.angle),sn=Math.sin(s.angle);
 while(r.emit>=1){r.emit--;for(let side=0;side<2;side++){const exhaust=side?-direction:direction;if(!window.__ironwakeRCS?.nozzleAlive(s,side,exhaust))continue;const p=s.world(side?s.w-11:10,exhaust>0?34:16),speed=70+power*55;addParticle(p.x,p.y,s.vx-sn*exhaust*speed+rand(-6,6),s.vy+cs*exhaust*speed+rand(-6,6),rand(.07,.13),1,'rcs',7);}}
}
function drawRCS(s){const r=s.rcs;if(!r||s.dead)return;const power=Math.max(r.effort,r.flare>0?.65:0);if(power<.025)return;const direction=r.jetDirection||Math.sign(r.torque)||r.command||1,length=3+power*10+(Math.sin(r.clock*91)+1)*.7;
 for(let side=0;side<2;side++){const exhaust=side?-direction:direction;if(!window.__ironwakeRCS?.nozzleAlive(s,side,exhaust))continue;const x=(side?s.w-11:10)-s.w/2,y=(exhaust>0?34:16)-s.h/2;rect(x-2,y-1,4,2,17);rect(x-1,y,2,exhaust>0?3:1,'#efffff');for(let j=0;j<length;j+=2){const width=j<3?3:j<7?2:1;rect(x-width/2,y+exhaust*(j+2),width,2,j<3?'#eefbff':j<7?'#aad9e3':'#668f9b');}}
}
function updateJetGas(dt){for(let i=jetGas.length-1;i>=0;i--){const p=jetGas[i];p.life-=dt;if(p.life<=0){jetGas[i]=jetGas[jetGas.length-1];jetGas.pop();continue}
 const age=p.max-p.life,n=fireNoise[(p.seed+(age*90|0)*17)&2047]-.5;
 p.vx+=(n*95+p.turn*12-p.vx*.24)*dt;p.vy*=Math.exp(-dt*.7);p.x+=p.vx*dt;p.y+=p.vy*dt;
 if(p.y>FLOOR-2){p.y=FLOOR-2;p.vx+=rand(-65,65);p.vy=-Math.abs(p.vy)*.12;p.life=Math.min(.12,p.life);p.hit=true}
}}
const jetSurface=makeCanvas(W,H),jetContext=jetSurface.getContext('2d');let jetImage=jetContext.createImageData(W,H),jetWidth=W,jetHeight=H;
const jetColors=[[255,248,213],[255,233,154],[255,208,71],[239,150,35],[172,73,27]];
function drawJetGas(){if(!jetGas.length)return;if(jetWidth!==W||jetHeight!==H){jetWidth=W;jetHeight=H;jetSurface.width=W;jetSurface.height=H;jetImage=jetContext.createImageData(W,H)}const pixels=jetImage.data;pixels.fill(0);
 for(const p of jetGas){const x=Math.round(p.x-cam.x),y=Math.round(p.y-cam.y),age=p.max-p.life,t=p.life/p.max;if(x<-12||x>W+12||y<-12||y>H+12)continue;
  const r=p.r*(.7+age*1.8),ry=r*(p.hit?.6:1.8),n=(age*60|0);
  for(let yy=-Math.ceil(ry);yy<=ry;yy++)for(let xx=-Math.ceil(r);xx<=r;xx++){
   const px=x+xx,py=y+yy;if(px<0||py<0||px>=W||py>=H)continue;
   const d=xx*xx/(r*r)+yy*yy/(ry*ry),noise=fireNoise[(p.seed+xx*23+yy*41+n*17)&2047];if(d>.7+noise*.4||t<.3&&noise>.4+t)continue;
   const heat=t*.84+(1-d)*.32+noise*.12,c=jetColors[heat>.94?0:heat>.74?1:heat>.55?2:heat>.35?3:4],i=(px+py*W)*4;pixels[i]=c[0];pixels[i+1]=c[1];pixels[i+2]=c[2];pixels[i+3]=255;
  }
 }
 jetContext.putImageData(jetImage,0,0);jetSurface._revision=(jetSurface._revision||0)+1;ctx.drawImage(jetSurface,0,0);
}
// Gear has reversible sequential motion: door, shoulder, telescoping ram, sole.
const GEAR_DURATION=2.1;
const phase=(x,a,b)=>clamp((x-a)/(b-a),0,1);
function gearPose(s,side){const t=clamp(s.gearTime-side*.24,0,1.8),sign=side?1:-1;
 const swing=phase(t,.2,.85),ram=phase(t,.85,1.4),foot=phase(t,1.4,1.8),door=phase(t,0,.2);
 const root={x:sign*(s.w/2-10),y:9},knee={x:sign*(s.w/2-9+swing*7),y:9+swing*12};
 const tip={x:knee.x+sign*ram*5,y:knee.y+ram*17-(s.gearCompression||0)};
 return {root,knee,tip,swing,ram,foot,door,sign,t};
}
function toggleGear(){if(state!=='playing'||player.dead)return;player.gearTarget=!player.gearTarget;notice(player.gearTarget?'착륙장치 · 잠금 해제 / 전개':'착륙장치 · 유압 회수',2);playSound('gear',{x:player.x,y:player.y,on:player.gearTarget});updateHUD();}
function updateGear(s,dt){
 const before=s.gearTime;s.gearTime=clamp(before+(s.gearTarget?dt:-dt),0,GEAR_DURATION);s.gearCompression=Math.max(0,s.gearCompression-dt*5);
 for(const k of [.2,.85,1.4,1.8,2.1])if((before<k&&s.gearTime>=k)||(before>k&&s.gearTime<=k)){if(s===player)playSound('gearLatch',{size:k===2.1?1:.45,x:s.x,y:s.y})}
}
// Every ground support comes from a surviving rendered cell. There is no
// fixed hull-height or invisible landing-gear rectangle in this solver.
function convexPoints(points){
 const a=points.sort((p,q)=>p.x-q.x||p.y-q.y),unique=[];
 for(const p of a)if(!unique.length||p.x!==unique[unique.length-1].x||p.y!==unique[unique.length-1].y)unique.push(p);
 if(unique.length<3)return unique;
 const cross=(o,p,q)=>(p.x-o.x)*(q.y-o.y)-(p.y-o.y)*(q.x-o.x),lo=[],hi=[];
 for(const p of unique){while(lo.length>1&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)}
 for(let i=unique.length-1;i>=0;i--){const p=unique[i];while(hi.length>1&&cross(hi[hi.length-2],hi[hi.length-1],p)<=0)hi.pop();hi.push(p)}
 lo.pop();hi.pop();return lo.concat(hi);
}
function rebuildBodyMass(s){
 let m=0,mx=0,my=0,mr=0;const pts=[];
 for(let x=0;x<s.w;x++){let top=s.h,bottom=-1;
  for(let y=0;y<s.h;y++){const mat=s.mat[x+y*s.w];if(!mat)continue;const weight=mat===2?1.3:mat===3?.7:1,px=x+.5-s.w/2,py=y+.5-s.h/2;
   m+=weight;mx+=px*weight;my+=py*weight;mr+=(px*px+py*py)*weight;top=Math.min(top,y);bottom=y;
  }
  if(bottom>=0)for(const px of [x-s.w/2,x+1-s.w/2]){pts.push({x:px,y:top-s.h/2});pts.push({x:px,y:bottom+1-s.h/2})}
 }
 s.bodyWeight=m;s.com={x:m?mx/m:0,y:m?my/m:0};s.inertiaRadius=Math.max(80,m?mr/m-s.com.x*s.com.x-s.com.y*s.com.y:80);
 s.hullVertices=convexPoints(pts);rebuildCollisionShape(s);
}
function gearAnchorAlive(s,side){const p=gearPose(s,side).root,x=Math.round(p.x+s.w/2),y=Math.round(p.y+s.h/2);let count=0;
 for(let yy=y-2;yy<=y+2;yy++)for(let xx=x-2;xx<=x+2;xx++)if(xx>=0&&xx<s.w&&yy>=0&&yy<s.h&&s.mat[xx+yy*s.w])count++;
 return count>=6;
}
function gearAttached(s,side){return !!s.legs&&s.legs[side].cut>0&&gearAnchorAlive(s,side);}
function gearRaster(s,side,ignoreAnchor=false){
 const leg=s.legs?.[side];if(!leg||leg.cut===0||!ignoreAnchor&&!gearAnchorAlive(s,side))return null;
 const key=s.gearTime.toFixed(5)+'/'+(s.gearCompression||0).toFixed(3)+'/'+leg.cut;
 if(leg.cache?.key===key)return leg.cache;
 const map=new Map(),pose=gearPose(s,side),{root,knee,tip}=pose;
 const box=(x,y,w,h,c,part)=>{if(part>=leg.cut)return;x=Math.round(x);y=Math.round(y);w=Math.ceil(w);h=Math.ceil(h);for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)map.set((xx+128)+(yy+64)*256,{x:xx,y:yy,c,part})};
 const rod=(x,y,xx,yy,width,dark,light,part)=>{const n=Math.max(1,Math.ceil(Math.hypot(xx-x,yy-y)));for(let j=0;j<=n;j++){const t=j/n,px=Math.round(lerp(x,xx,t)),py=Math.round(lerp(y,yy,t));box(px-width/2,py,width,width,dark,part);box(px-width/2,py,1,width,light,part)}};
 box(root.x-5,root.y-3,10,5,17,0);box(root.x-4,root.y-3,8,1,23,0);
 if(pose.door>.05){rod(root.x,root.y,root.x+pose.sign*6*pose.door,root.y+3*pose.door,3,18,21,0);
  if(pose.swing>0){rod(root.x,root.y,knee.x,knee.y,5,18,22,1);rod(root.x-pose.sign*3,root.y+1,knee.x-pose.sign*2,knee.y-2,2,16,24,1);box(knee.x-3,knee.y-2,6,5,17,1);box(knee.x-1,knee.y-1,2,2,25,1)}
  if(pose.ram>0){rod(knee.x,knee.y,tip.x,tip.y,3,19,25,2);rod(knee.x-pose.sign*3,knee.y+1,tip.x-pose.sign*2,tip.y-3,1,16,22,2);const fw=3+pose.foot*10;box(tip.x-fw/2,tip.y,fw,3,17,3);box(tip.x-fw/2,tip.y,fw,1,24,3);for(let j=0;j<fw;j+=3)box(tip.x-fw/2+j,tip.y+3,1,1,16,3)}
 }
 const cells=Array.from(map.values()),pts=[];for(const p of cells)for(const dx of [0,1])for(const dy of [0,1])pts.push({x:p.x+dx,y:p.y+dy});
 leg.cache={key,map,cells,vertices:convexPoints(pts)};return leg.cache;
}
function gearContains(s,local){const x=Math.floor(local.x-s.w/2),y=Math.floor(local.y-s.h/2),key=(x+128)+(y+64)*256;
 for(let k=0;k<2;k++)if(gearRaster(s,k)?.map.has(key))return true;return false;
}
function drawGear(s){for(let k=0;k<2;k++){const data=gearRaster(s,k);if(!data)continue;for(const p of data.cells)rect(p.x,p.y,1,1,p.c);
 if(s.gearTime>=2.05&&s.legs[k].cut===4){const p=gearPose(s,k).root;rect(p.x-1,p.y-2,2,1,'#a3f8bc')}
}}
function breakGear(s,side,part){const leg=s.legs[side];if(part>=leg.cut)return false;
 const data=gearRaster(s,side,true),cells=(data?.cells||[]).filter(c=>c.part>=part);leg.cut=part;for(let k=part;k<4;k++)leg.hp[k]=0;leg.cache=null;
 if(cells.length&&chunks.length<70){let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  for(const p of cells){minx=Math.min(minx,p.x);miny=Math.min(miny,p.y);maxx=Math.max(maxx,p.x);maxy=Math.max(maxy,p.y)}
  const w=maxx-minx+1,h=maxy-miny+1,im=makeCanvas(w,h),ic=im.getContext('2d');for(const p of cells){ic.fillStyle=PAL[p.c];ic.fillRect(p.x-minx,p.y-miny,1,1)}
  const p=s.world(minx+w/2+s.w/2,miny+h/2+s.h/2),rx=p.x-s.x,ry=p.y-s.y;
  chunks.push({x:p.x,y:p.y,vx:s.vx-s.av*ry+rand(-5,5),vy:s.vy+s.av*rx+rand(1,5),a:s.angle,av:s.av+rand(-.6,.6),im,w,h,life:12,gear:true});
  for(let i=0;i<8;i++)addParticle(p.x,p.y,rand(-18,18),rand(-22,4),rand(.2,.7),1,'spark',24);
 }
 if(s===player){notice((side?'우현':'좌현')+' 착륙장치 파손',3);boom(.18,true)}return true;
}
function syncGearAttachments(s){if(!s.legs)return;for(let k=0;k<2;k++)if(s.legs[k].cut>0&&!gearAnchorAlive(s,k))breakGear(s,k,0);}
function damageGear(s,wx,wy,radius,power){const q=s.local(wx,wy),x=q.x-s.w/2,y=q.y-s.h/2;let hits=0;
 for(let k=0;k<2;k++){const data=gearRaster(s,k);if(!data)continue;const leg=s.legs[k],dist=[Infinity,Infinity,Infinity,Infinity];
  for(const p of data.cells){const d=Math.hypot(p.x+.5-x,p.y+.5-y);dist[p.part]=Math.min(dist[p.part],d)}
  let cut=4;for(let j=0;j<leg.cut;j++)if(dist[j]<radius){leg.hp[j]-=power*1.8*(1-dist[j]/radius);hits++;if(leg.hp[j]<=0)cut=Math.min(cut,j)}
  if(cut<leg.cut)breakGear(s,k,cut);
 }return hits;
}
function bodySupportShapes(s){const shapes=[{kind:'hull',side:-1,vertices:s.hullVertices||[]}];for(let side=0;side<2;side++){const a=gearRaster(s,side);if(a)shapes.push({kind:'gear',side,vertices:a.vertices})}return shapes;}
function gearClearance(s){const cs=Math.cos(s.angle),sn=Math.sin(s.angle);let max=-Infinity;for(const shape of bodySupportShapes(s))for(const p of shape.vertices)max=Math.max(max,p.x*sn+p.y*cs);return Number.isFinite(max)?max:0;}
function rotateBody(s,delta){const old=s.angle,cs=Math.cos(old),sn=Math.sin(old),c=s.com||{x:0,y:0},wx=s.x+c.x*cs-c.y*sn,wy=s.y+c.x*sn+c.y*cs;
 s.angle+=delta;const nc=Math.cos(s.angle),ns=Math.sin(s.angle);s.x=wx-c.x*nc+c.y*ns;s.y=wy-c.x*ns-c.y*nc;
}
function solveGround(s,dt){
 const shapes=bodySupportShapes(s),cs=Math.cos(s.angle),sn=Math.sin(s.angle),mass=clamp(s.count/s.initial,.18,1),invM=1/mass,invI=1/(mass*s.inertiaRadius),com=s.com||{x:0,y:0};
 const comX=com.x*cs-com.y*sn,comY=com.x*sn+com.y*cs,candidates=[];let penetration=-Infinity;
 for(const shape of shapes)for(const p of shape.vertices){const x=p.x*cs-p.y*sn,y=p.x*sn+p.y*cs;
  candidates.push({x,y,rx:x-comX,ry:y-comY,kind:shape.kind,side:shape.side});penetration=Math.max(penetration,s.y+y-FLOOR);
 }
 const wasGrounded=!!s.grounded;s.grounded=false;s.contacts=[];s.groundLoad=0;
 if(penetration<-.35)return;
 if(penetration>0)s.y-=penetration;
 // End points from each surviving shape form a small support manifold.
 const active=candidates.filter(p=>s.y+p.y>=FLOOR-.45);
 if(!active.length)return;const impact=Math.max(...active.map(p=>s.vy+s.av*p.rx));
 if(impact<-.8&&penetration<=0)return;
 let normalSum=0;
 for(let iteration=0;iteration<10;iteration++)for(const p of active){
  const vy=s.vy+s.av*p.rx;if(vy<=0)continue;
  const j=vy/(invM+p.rx*p.rx*invI);s.vy-=j*invM;s.av-=p.rx*j*invI;normalSum+=j;
  const vx=s.vx-s.av*p.ry,jt=clamp(-vx/(invM+p.ry*p.ry*invI),-j*.75,j*.75);
  s.vx+=jt*invM;s.av-=p.ry*jt*invI;
 }
 s.grounded=true;s.contacts=active.map(p=>({x:s.x+p.x,y:FLOOR,kind:p.kind,side:p.side}));s.groundLoad=normalSum/dt;
 s.av*=Math.exp(-dt*.5);if(Math.abs(s.av)<.0003)s.av=0;
 if(!wasGrounded&&impact>8){for(const p of active.filter((p,i,a)=>a.findIndex(q=>q.side===p.side&&q.kind===p.kind)===i))billowSmoke.emit(s.x+p.x,FLOOR-2,rand(-12,12),-6,3,1.8,.3)}
 if(!wasGrounded){const safe=active.every(p=>p.kind==='gear'&&s.legs[p.side].cut===4)&&s.gearTime>=2.05?65:28;
  if(impact>safe){const p=active.reduce((a,b)=>a.y>b.y?a:b);damage(s,s.x+p.x,FLOOR-1,impact>100?10:6,impact>100?6:3);boom(Math.min(.8,impact/160),true,s.x,FLOOR)}
 }
}


function specificHullShade(s,j){return s.team?(s.variant===1?19:20):j%2?21:20}
const lightCanvas=makeCanvas(160,90),lightCtx=lightCanvas.getContext('2d'),lightStamp=makeCanvas(64,64),lightStampCtx=lightStamp.getContext('2d');
const lightGradient=lightStampCtx.createRadialGradient(32,32,0,32,32,32);lightGradient.addColorStop(0,'rgba(255,145,25,.62)');lightGradient.addColorStop(.22,'rgba(255,101,10,.29)');lightGradient.addColorStop(.55,'rgba(226,62,0,.08)');lightGradient.addColorStop(1,'rgba(150,35,0,0)');lightStampCtx.fillStyle=lightGradient;lightStampCtx.fillRect(0,0,64,64);
class Ship{
 constructor(x,y,team,variant=0){this.x=x;this.y=y;this.vx=0;this.vy=0;this.angle=0;this.av=0;this.team=team;this.w=team?88:104;this.h=48;this.n=this.w*this.h;this.mat=new Uint8Array(this.n);this.hp=new Uint8Array(this.n);this.col=new Uint8Array(this.n);this.skin=makeCanvas(this.w,this.h);this.dirty=true;this.dead=false;this.throttle=1;this.tx=0;this.ty=0;this.heat=0;this.overheated=false;this.cool=0;this.heavy=0;this.aiTimer=rand(1.8,3.3);this.phase=rand(0,6);this.variant=variant;this.flash=0;this.fuels=[];this.engines=[];this.make();this.initial=this.count;this.initialEngine=this.engineCount;this.initialCore=this.coreCount;initHazards(this);this.collisionFx=0;this.aim=0;this.deathTime=0;this.gearTime=0;this.gearTarget=false;this.gearCompression=0;this.smokeAcc=0;this.legs=[0,1].map(()=>({hp:[12,11,9,8],cut:4,cache:null}));this.grounded=false;this.resting=false;this.liftPower=1;this.contacts=[];}
 make(){const w=this.w,h=this.h;
  const put=(x,y,m,c,hp=2)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=w||y>=h)return;const i=x+y*w;this.mat[i]=m;this.col[i]=c;this.hp[i]=hp;};
  const box=(x,y,rw,rh,m,c,hp=2)=>{for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++)put(xx,yy,m,c,hp)};
  const stroke=(x,y,xx,yy,c,width=1,m=1)=>{const n=Math.max(1,Math.ceil(Math.hypot(xx-x,yy-y)));for(let i=0;i<=n;i++)box(Math.round(lerp(x,xx,i/n)),Math.round(lerp(y,yy,i/n)),width,width,m,c)};
  const panel=(x,y,pw,ph,base=20)=>{box(x,y,pw,ph,1,17,3);box(x+1,y+1,pw-2,ph-2,1,base,3);box(x+2,y+1,pw-4,1,1,23,3);box(x+1,y+2,1,ph-4,1,22,3);box(x+2,y+ph-2,pw-3,1,1,18,3);for(const bx of [x+2,x+pw-3])for(const by of [y+2,y+ph-3]){put(bx,by,1,25,3);put(bx+1,by+1,1,18,3)}};
  // Original shallow, stepped gun-deck silhouette with an offset command tower.
  // The side panels are riveted armor cassettes rather than copied tank shapes.
  for(let y=17;y<=35;y++)for(let x=4;x<w-3;x++){
   const taper=Math.max(0,Math.abs(y-26)-5);if(x<4+taper||x>w-4-taper)continue;
   put(x,y,1,y<20?22:y<29?19:17,y<20?3:2);
  }
  box(9,14,w-19,5,1,20,3);box(12,13,w-25,1,1,24,3);
  // Spine rails, undercut belly, anchor straps and dark service recesses.
  stroke(7,20,w-7,20,16);stroke(12,34,w-12,34,16,2);stroke(16,36,w-17,36,19,2);
  for(let x=11;x<w-10;x+=8){box(x,35,4,4,1,17);put(x,35,1,23);put(x+1,38,1,21)}
  const panels=Math.floor((w-22)/18),span=(w-24)/panels;
  for(let j=0;j<panels;j++){
   const x=Math.round(12+j*span),pw=Math.floor(span)-2;
   panel(x,21,pw,12,specificHullShade(this,j));
   box(x+4,24,Math.max(3,pw-8),3,1,19);stroke(x+4,24,x+pw-5,24,22);
   for(let k=0;k<3;k++){put(x+5+k*2,29,1,17);put(x+5+k*2,30,1,21)}
  }
  // Asymmetric turret riser, bridge optics and roof-mounted communications mast.
  panel(29,7,26,10,20);box(33,4,17,3,1,21,3);stroke(34,4,47,4,24);
  box(33,8,16,5,4,17,3);for(let x=35;x<49;x+=4){box(x,9,2,2,4,15,3);put(x,9,4,26,3);put(x,12,4,20,3)}
  box(26,12,4,5,1,18);stroke(26,12,28,12,23);box(56,11,16,5,1,19);stroke(57,11,69,11,23);
  for(let x=58;x<70;x+=3)box(x,12,1,3,1,16);
  stroke(21,2,21,14,24);stroke(17,3,25,3,22);put(21,1,1,26);stroke(w-18,8,w-18,15,21);box(w-21,7,7,2,1,22);
  // Outer curved shoulders, pipe elbows and cable combs.
  for(const right of [false,true]){const x=right?w-10:5,sg=right?-1:1;
   box(x,23,5,8,1,18);stroke(x,23,x+3,23,22);for(let y=25;y<31;y+=2)stroke(x+1,y,x+3,y,16);
   stroke(x+sg*5,17,x+sg*5,28,23);stroke(x+sg*5,28,x+sg*9,30,21);
   box(right?w-13:10,18,2,2,1,this.team?14:6,3);
  }
  // Four independent engines: compressor fins, rounded casing and bell lip.
  for(let j=0;j<4;j++){
   const x=14+j*Math.floor((w-31)/3);
   box(x-1,31,12,3,1,17,3);stroke(x,31,x+9,31,24);
   for(let y=32;y<44;y++)for(let xx=0;xx<10;xx++){
    const edge=xx===0||xx===9,c=edge?17:xx<3?23:xx<7?20:18;put(x+xx,y,2,c,2);
   }
   for(let y=33;y<39;y+=2){stroke(x+2,y,x+7,y,16,1,2);put(x+2,y,2,24)}
   box(x+3,33,2,5,2,25);box(x-1,39,12,3,2,17);stroke(x,39,x+9,39,21,1,2);
   box(x+1,42,8,2,2,16);stroke(x+2,42,x+7,42,27,1,2);put(x,41,2,24);put(x+9,41,2,21);
   const ids=[];for(let yy=32;yy<44;yy++)for(let xx=x;xx<x+10;xx++)ids.push(xx+yy*w);
   this.engines.push({x:x+5,y:43,ids,alive:true,emitAcc:0});
  }
  // Recessed fuel access hatches retain real fuel material under the armor frame.
  for(let j=0;j<2;j++){
   const x=j?w-34:23,y=23;box(x-1,y-1,13,10,1,17,2);
   box(x,y,11,8,3,19,1);stroke(x+1,y,x+9,y,23,1,3);stroke(x,y+1,x,y+5,21,1,3);
   box(x+3,y+2,5,4,3,18,1);stroke(x+4,y+2,x+6,y+2,22,1,3);put(x+8,y+5,3,27,1);
   const ids=[];for(let yy=y;yy<y+8;yy++)for(let xx=x;xx<x+11;xx++)ids.push(xx+yy*w);
   this.fuels.push({x:x+5,y:y+4,triggered:false,ids});
  }
  // Wear follows exposed edges and fasteners, never random decorative pixel soup.
  for(let i=0;i<this.n;i++)if(this.mat[i]===1){const x=i%w,y=Math.floor(i/w),hash=(x*73856093^y*19349663^this.variant*83492791)>>>0;
   if(y>16&&y<33&&this.col[i]>=19&&hash%43===0)this.col[i]=18;
   if(y===16&&x%5===0)this.col[i]=25;
  }
  for(let j=0;j<3;j++){put(w-23+j*2,17,1,26);put(w-23+j*2,18,1,17)}
  this.recount();
 }
 recount(){this.count=0;this.engineCount=0;this.coreCount=0;for(let i=0;i<this.n;i++){if(this.mat[i])this.count++;if(this.mat[i]===2)this.engineCount++;if(this.mat[i]===4)this.coreCount++}for(const e of this.engines)e.alive=e.ids.reduce((n,i)=>n+(this.mat[i]===2),0)>20;this.engineRatio=this.engines.filter(e=>e.alive).length/4;rebuildBodyMass(this);}
 local(wx,wy){let dx=wx-this.x,dy=wy-this.y,c=Math.cos(this.angle),s=Math.sin(this.angle);return{x:dx*c+dy*s+this.w/2,y:-dx*s+dy*c+this.h/2}}
 world(lx,ly){let x=lx-this.w/2,y=ly-this.h/2,c=Math.cos(this.angle),s=Math.sin(this.angle);return{x:this.x+x*c-y*s,y:this.y+x*s+y*c}}
 contains(x,y){let p=this.local(x,y),ix=Math.floor(p.x),iy=Math.floor(p.y);return (ix>=0&&iy>=0&&ix<this.w&&iy<this.h&&this.mat[ix+iy*this.w]!==0)||gearContains(this,p);}
 rebuild(){const c=this.skin.getContext('2d');c.clearRect(0,0,this.w,this.h);for(let i=0;i<this.n;i++)if(this.mat[i]){c.fillStyle=PAL[this.col[i]];c.fillRect(i%this.w,Math.floor(i/this.w),1,1)}this.skin._revision=(this.skin._revision||0)+1;this.dirty=false;}
}
function addParticle(x,y,vx,vy,life,size,type,color){if(type==='smoke'){billowSmoke.emit(x,y,vx,vy,size*.55,Math.max(3,life*2),.9);return}if(particles.length>=MAX_PARTICLES)return;particles.push({x,y,px:x,py:y,vx,vy,life,max:life,size,type,color,phase:rand(0,6.28),seed:Math.random()*65536|0,hot:type==='debris'?rand(0,.8):1,settled:false});}
function explosion(x,y,size=1,kind='impact'){blasts.push({x,y,age:0,size,seed:Math.random()*4096|0});if(blasts.length>40)blasts.shift();ignite(x,y,size,Math.min(1.7,.35+size*.55));
 for(let i=0;i<Math.floor(85*size);i++){const a=rand(-Math.PI,Math.PI),s=rand(12,105)*Math.sqrt(size);addParticle(x+rand(-5,5)*size,y+rand(-4,4)*size,Math.cos(a)*s,Math.sin(a)*s-20,rand(.35,1.7)*Math.sqrt(size),1,'ember',13)}
 for(let i=0;i<Math.floor(30*size);i++){const a=rand(-Math.PI,Math.PI),s=rand(45,175)*size;addParticle(x,y,Math.cos(a)*s,Math.sin(a)*s,rand(.25,1.3),1,'spark',13)}
 for(let i=0;i<Math.floor(6*size);i++)addParticle(x+rand(-8,8),y+rand(-6,6),rand(-22,22),rand(-26,-8),rand(.8,2.3),rand(7,14)*Math.sqrt(size),'smoke',2);
 shake=Math.min(7,shake+size*2.4);flash=Math.min(.18,flash+.035*size);boom(size,false,x,y,kind);
}
function detach(s){
 // Connectivity is evaluated only after damage, never once per frame.
 const seen=new Uint8Array(s.n),queue=new Int32Array(s.n),groups=[];let largest=null;
 for(let i=0;i<s.n;i++){if(!s.mat[i]||seen[i])continue;let head=0,tail=1;queue[0]=i;seen[i]=1;const group=[];while(head<tail){let k=queue[head++];group.push(k);let x=k%s.w,y=Math.floor(k/s.w);for(const j of [x>0?k-1:-1,x<s.w-1?k+1:-1,y>0?k-s.w:-1,y<s.h-1?k+s.w:-1])if(j>=0&&s.mat[j]&&!seen[j]){seen[j]=1;queue[tail++]=j}}groups.push(group);if(!largest||group.length>largest.length)largest=group}
 for(const g of groups){if(g===largest)continue;let minx=s.w,miny=s.h,maxx=0,maxy=0;for(const i of g){let x=i%s.w,y=Math.floor(i/s.w);minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y)}const w=maxx-minx+1,h=maxy-miny+1,im=makeCanvas(w,h),ic=im.getContext('2d');for(const i of g){ic.fillStyle=PAL[s.col[i]];ic.fillRect(i%s.w-minx,Math.floor(i/s.w)-miny,1,1);s.mat[i]=0;s.hp[i]=0}let p=s.world(minx+w/2,miny+h/2);if(g.length>=4&&chunks.length<70)chunks.push({x:p.x,y:p.y,vx:s.vx+rand(-35,35),vy:s.vy+rand(-30,10),a:s.angle,av:rand(-2,2),im,w,h,life:8});else addParticle(p.x,p.y,rand(-50,50),rand(-60,0),1.4,2,'debris',4)}
}
// Narrow phase uses occupied material cells, including ragged holes and gear.
// Bounding boxes only reject distant pairs; they never push vessels apart.
const collisionStats={contacts:0,crushed:0,detonations:0};
function rebuildCollisionShape(s){
 s.bodyCells=[];s.depth=s.depth||new Float32Array(s.n);s.crushFatigue=s.crushFatigue||new Float32Array(s.n);
 const d=s.depth,w=s.w,h=s.h;
 for(let i=0;i<s.n;i++){d[i]=s.mat[i]?1000:0;if(s.mat[i])s.bodyCells.push({x:i%w+.5-w/2,y:Math.floor(i/w)+.5-h/2,index:i})}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=x+y*w;if(!s.mat[i])continue;d[i]=Math.min(d[i],x?d[i-1]+1:1,y?d[i-w]+1:1,x&&y?d[i-w-1]+1.414:1000)}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=x+y*w;if(!s.mat[i])continue;d[i]=Math.min(d[i],x<w-1?d[i+1]+1:1,y<h-1?d[i+w]+1:1,x<w-1&&y<h-1?d[i+w+1]+1.414:1000)}
}
function worldCOM(s){const c=Math.cos(s.angle),n=Math.sin(s.angle);return {x:s.x+s.com.x*c-s.com.y*n,y:s.y+s.com.x*n+s.com.y*c};}
function shipBounds(s){const c=Math.cos(s.angle),n=Math.sin(s.angle);let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;
 for(const shape of bodySupportShapes(s))for(const p of shape.vertices){const x=s.x+p.x*c-p.y*n,y=s.y+p.x*n+p.y*c;l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}return {l,r,t,b};
}
function materialAt(s,x,y){const p=s.local(x,y),ix=Math.floor(p.x),iy=Math.floor(p.y);
 if(ix>=0&&iy>=0&&ix<s.w&&iy<s.h){const index=ix+iy*s.w;if(s.mat[index])return {index,depth:s.depth[index]}}
 const key=(Math.floor(p.x-s.w/2)+128)+(Math.floor(p.y-s.h/2)+64)*256;
 for(let side=0;side<2;side++){const cell=gearRaster(s,side)?.map.get(key);if(cell)return {index:-1,side,part:cell.part,depth:1}}
 return null;
}
function depthGradient(s,i){if(i<0)return {x:0,y:0};const x=i%s.w,y=Math.floor(i/s.w),d=s.depth;
 const gx=(x<s.w-1?d[i+1]:0)-(x?d[i-1]:0),gy=(y<s.h-1?d[i+s.w]:0)-(y?d[i-s.w]:0),c=Math.cos(s.angle),n=Math.sin(s.angle);
 return {x:gx*c-gy*n,y:gx*n+gy*c};
}
function shipOverlap(a,b){
 const aa=shipBounds(a),bb=shipBounds(b);if(aa.r<bb.l||bb.r<aa.l||aa.b<bb.t||bb.b<aa.t)return null;
 const samples=[],seen=new Set();let gx=0,gy=0,depth=0;
 const scan=(s,other,reverse)=>{const c=Math.cos(s.angle),n=Math.sin(s.angle),bounds=reverse?aa:bb;
  const visit=(p)=>{const x=s.x+p.x*c-p.y*n,y=s.y+p.x*n+p.y*c;if(x<bounds.l||x>bounds.r||y<bounds.t||y>bounds.b)return;
   const q=materialAt(other,x,y);if(!q)return;const ia=reverse?q.index:p.index,ib=reverse?p.index:q.index,key=(x*2|0)+','+(y*2|0);if(seen.has(key))return;seen.add(key);
   const ga=depthGradient(a,ia),gb=depthGradient(b,ib);gx+=gb.x-ga.x;gy+=gb.y-ga.y;
   const d=Math.min(5,Math.max(q.depth,p.index>=0?s.depth[p.index]:1));depth=Math.max(depth,d);
   samples.push({x,y,ia,ib,gearA:reverse?q.side:p.side,gearB:reverse?p.side:q.side});
  };
  for(const p of s.bodyCells)visit(p);
  for(let side=0;side<2;side++){const g=gearRaster(s,side);if(g)for(const p of g.cells)visit({x:p.x+.5,y:p.y+.5,index:-1,side})}
 };
 scan(a,b,false);scan(b,a,true);if(!samples.length)return null;
 const ac=worldCOM(a),bc=worldCOM(b),dx=bc.x-ac.x,dy=bc.y-ac.y;
 let len=Math.hypot(gx,gy);if(len<.01){gx=dx||(!dy?1:0);gy=dy;len=Math.hypot(gx,gy)||1}let nx=gx/len,ny=gy/len;if(nx*dx+ny*dy<0){nx=-nx;ny=-ny}
 samples.sort((p,q)=>(p.x*-ny+p.y*nx)-(q.x*-ny+q.y*nx));
 const points=[];for(const k of [0,1/3,2/3,1]){const p=samples[Math.round((samples.length-1)*k)];if(!points.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<3))points.push(p)}
 return {samples,points,nx,ny,depth};
}
function bendArmor(s,i,nx,ny){const x=i%s.w,y=Math.floor(i/s.w),c=Math.cos(s.angle),n=Math.sin(s.angle),dx=Math.round(-nx*c-ny*n),dy=Math.round(nx*n-ny*c);
 for(const [tx,ty] of [[dx,dy],[dx-dy,dy+dx],[dx+dy,dy-dx]]){const xx=x+tx,yy=y+ty;if(xx<1||yy<1||xx>=s.w-1||yy>=s.h-1)continue;const j=xx+yy*s.w;
  if(!s.mat[j]&&[j-1,j+1,j-s.w,j+s.w].filter(k=>s.mat[k]).length>=2){s.mat[j]=1;s.hp[j]=1;s.col[j]=21;return true}
 }return false;
}
function crushContact(s,samples,field,nx,ny,stress,shock,dt){if(stress<=0)return 0;
 const ids=new Set(samples.map(p=>p[field]).filter(i=>i>=0)),budget=Math.min(70,Math.ceil(3+stress*5));let removed=0,touched=false;
 for(const i of ids){if(!s.mat[i])continue;const old=s.hp[i];s.crushFatigue[i]+=stress*dt*7*(.7+((i*37)%13)/20);let loss=Math.min(old,Math.floor(s.crushFatigue[i]));if(!loss)continue;
  s.crushFatigue[i]-=loss;s.hp[i]-=loss;registerHazardHit(s,i,loss,shock/Math.max(1,ids.size));touched=true;
  if(s.mat[i]===1)s.col[i]=s.hp[i]>1?18:17;
  if(!s.hp[i]){const mat=s.mat[i],color=s.col[i],p=s.world(i%s.w+.5,Math.floor(i/s.w)+.5);s.mat[i]=0;removed++;
   if(mat===1&&(i%5===0))bendArmor(s,i,nx,ny);
   if(removed%2===0)addParticle(p.x,p.y,s.vx*.5-nx*rand(4,24)-ny*rand(-12,12),s.vy*.5-ny*rand(4,24)+nx*rand(-12,12),rand(.6,1.7),rand(1,2),'debris',color);
   if(removed>=budget)break;
  }
 }
 if(touched){if(removed)detach(s);s.recount();syncGearAttachments(s);s.dirty=true;processHazards(s);if(!s.dead&&(s.count<s.initial*.27||s.coreCount<s.initialCore*.2))killShip(s)}
 return removed;
}
function collideShips(a,b,dt){if(a.count<10||b.count<10)return false;const c=shipOverlap(a,b);if(!c)return false;collisionStats.contacts++;
 const ma=Math.max(.08,a.bodyWeight/3000),mb=Math.max(.08,b.bodyWeight/3000),ia=1/ma,ib=1/mb,iia=ia/a.inertiaRadius,iib=ib/b.inertiaRadius,ac=worldCOM(a),bc=worldCOM(b),nx=c.nx,ny=c.ny;
 const area=Math.max(1,Math.min(new Set(c.samples.map(p=>p.ia)).size,new Set(c.samples.map(p=>p.ib)).size));
 const yieldImpulse=area*180*dt*Math.sqrt(Math.max(1,c.depth));let impulse=0,closing=0,slip=0;
 for(let iteration=0;iteration<7;iteration++)for(const p of c.points){const ax=p.x-ac.x,ay=p.y-ac.y,bx=p.x-bc.x,by=p.y-bc.y;
  const vx=a.vx-a.av*ay-b.vx+b.av*by,vy=a.vy+a.av*ax-b.vy-b.av*bx,vn=vx*nx+vy*ny;closing=Math.max(closing,vn);slip=Math.max(slip,Math.abs(-vx*ny+vy*nx));if(vn<=0)continue;
  const ra=ax*ny-ay*nx,rb=bx*ny-by*nx,j=Math.min(vn/(ia+ib+ra*ra*iia+rb*rb*iib),Math.max(0,yieldImpulse-impulse));
  a.vx-=nx*j*ia;a.vy-=ny*j*ia;a.av-=ra*j*iia;b.vx+=nx*j*ib;b.vy+=ny*j*ib;b.av+=rb*j*iib;impulse+=j;
  const tx=-ny,ty=nx,rta=ax*ty-ay*tx,rtb=bx*ty-by*tx,vt=(a.vx-a.av*ay-b.vx+b.av*by)*tx+(a.vy+a.av*ax-b.vy-b.av*bx)*ty;
  const jt=clamp(vt/(ia+ib+rta*rta*iia+rtb*rtb*iib),-j*.8,j*.8);
  a.vx-=tx*jt*ia;a.vy-=ty*jt*ia;a.av-=rta*jt*iia;b.vx+=tx*jt*ib;b.vy+=ty*jt*ib;b.av+=rtb*jt*iib;
 }
 // Leave a small tooth-scale contact tolerance. Only the surviving occupied
 // cells constrain motion; opposite plates can enter the newly formed cuts.
 const correction=Math.min(.8,Math.max(0,c.depth-.65)*.22),sum=ia+ib;
 a.x-=nx*correction*ia/sum;a.y-=ny*correction*ia/sum;b.x+=nx*correction*ib/sum;b.y+=ny*correction*ib/sum;
 const stress=Math.max(0,closing-9)*.17+Math.max(0,impulse/dt-55)*.006,energy=impulse*closing;
 const ca=crushContact(a,c.samples,'ia',nx,ny,stress,energy*.12,dt),cb=crushContact(b,c.samples,'ib',-nx,-ny,stress,energy*.12,dt);collisionStats.crushed+=ca+cb;
 if(stress>1){for(const p of c.points){if(p.ia<0)damageGear(a,p.x,p.y,2,stress*dt*5);if(p.ib<0)damageGear(b,p.x,p.y,2,stress*dt*5)}}
 if((impulse>1||ca+cb>0||slip>12)&&a.collisionFx<=0&&b.collisionFx<=0){const p=c.points[c.points.length>>1];a.collisionFx=b.collisionFx=.055;
  for(let k=0;k<Math.min(24,4+Math.ceil(closing*.12+slip*.06));k++){const along=rand(-1,1)*(12+slip*.3),speed=rand(4,24);addParticle(p.x+rand(-2,2),p.y+rand(-2,2),-ny*along+nx*speed,nx*along+ny*speed,rand(.12,.55),1,'spark',24)}
  if(ca+cb>3)billowSmoke.emit(p.x,p.y,(a.vx+b.vx)*.2,-rand(3,9),rand(2,4),rand(.5,1.3),.22);
  if(slip>35&&closing>50)for(let k=0;k<3;k++)addParticle(p.x,p.y,rand(-12,12),rand(-14,5),.3,1,'ember',11);
  if(closing>18)boom(Math.min(.35,.08+closing*.0015),true,p.x,p.y);shake=Math.min(3,shake+Math.min(1.4,impulse*.025));
 }
 if(a.y+gearClearance(a)>FLOOR)solveGround(a,dt);if(b.y+gearClearance(b)>FLOOR)solveGround(b,dt);
 return true;
}
function resolveShipCollisions(dt){for(let i=0;i<ships.length;i++)for(let j=i+1;j<ships.length;j++)collideShips(ships[i],ships[j],dt);}

// Components keep their actual damage ledger. Merely being detached as an
// intact fragment, or losing the bridge, is not a reason for detonation.
function initHazards(s){s.hazardMap=new Int16Array(s.n);s.hazardMap.fill(-1);s.hazards=[];
 for(const [kind,list] of [['fuel',s.fuels],['engine',s.engines]])for(const component of list){const id=s.hazards.length;let initialHP=0;for(const i of component.ids){s.hazardMap[i]=id;initialHP+=s.hp[i]}
  s.hazards.push({kind,component,initialHP:Math.max(1,initialHP),damage:0,shock:0,triggered:false,leaking:false});
 }
}
function registerHazardHit(s,i,loss,shock=0){const id=s.hazardMap?.[i];if(id===undefined||id<0)return;const h=s.hazards[id];h.damage+=loss;h.shock+=shock;}
function processHazards(s){for(const h of s.hazards){if(h.triggered)continue;const frac=h.damage/h.initialHP,c=h.component;
  if(h.kind==='fuel'&&frac>.08&&!h.leaking){h.leaking=true;const p=s.world(c.x,c.y);ignite(p.x,p.y,.22,2,s,c.x,c.y,'leak')}
  const threshold=h.kind==='fuel'?.28:.68,shockThreshold=h.kind==='fuel'?140:280;
  if(frac<threshold&&h.shock<shockThreshold)continue;
  h.triggered=true;c.triggered=true;const p=s.world(c.x,c.y),delay=h.kind==='fuel'?rand(.16,.35):rand(.1,.24);
  pending.push({ship:s,x:c.x,y:c.y,t:delay,delay,radius:h.kind==='fuel'?13:8,hazard:h,wx:p.x,wy:p.y,vx:s.vx-s.av*(p.y-s.y),vy:s.vy+s.av*(p.x-s.x)});
 }}
function pendingPosition(p){if(!p.hazard)return p.ship.world(p.x,p.y);const h=p.hazard,remaining=h.component.ids.reduce((n,i)=>n+(p.ship.mat[i]=== (h.kind==='fuel'?3:2)),0);
 if(remaining>h.component.ids.length*.5)return p.ship.world(p.x,p.y);
 const t=p.delay-p.t;return {x:p.wx+p.vx*t,y:p.wy+p.vy*t+G*t*t*.5};
}

function damage(s,wx,wy,radius,power=3){if(s.dead&&s.count<10)return;const gearHits=damageGear(s,wx,wy,radius,power),p=s.local(wx,wy),rr=radius*radius;let removed=0;for(let y=Math.max(0,Math.floor(p.y-radius));y<Math.min(s.h,Math.ceil(p.y+radius));y++)for(let x=Math.max(0,Math.floor(p.x-radius));x<Math.min(s.w,Math.ceil(p.x+radius));x++){let d=(x-p.x)**2+(y-p.y)**2,i=x+y*s.w;if(d>rr||!s.mat[i])continue;let hit=Math.max(1,Math.ceil(power*(1-Math.sqrt(d)/radius)));const before=s.hp[i];s.hp[i]=Math.max(0,s.hp[i]-hit);registerHazardHit(s,i,before-s.hp[i]);if(!s.hp[i]){if(removed%5===0){let q=s.world(x,y);addParticle(q.x,q.y,s.vx+(x-p.x)*rand(5,13),s.vy+(y-p.y)*rand(5,13),rand(.4,1.8),rand(1,2),'debris',s.col[i])}s.mat[i]=0;removed++}else if(s.mat[i]===1)s.col[i]=2;}
 if(removed){detach(s);s.recount();syncGearAttachments(s);s.dirty=true;if(!s.dead&&(s.count<s.initial*.27||s.coreCount<s.initialCore*.2))killShip(s)}processHazards(s);s.flash=.07;playSound('hit',{x:wx,y:wy,size:Math.min(1.5,power/4)});return removed+gearHits;}
function killShip(s){if(s.dead)return;s.dead=true;s.deathTime=0;explosion(s.x,s.y,2,'wreck');for(let i=0;i<4;i++)pending.push({ship:s,x:rand(8,s.w-8),y:rand(16,35),t:.15+i*.17,radius:rand(9,16),wreckCascade:true});for(let i=0;i<2;i++){const x=s.w*(.3+i*.4),y=23,q=s.world(x,y);ignite(q.x,q.y,1.3,rand(5,8),s,x,y,'fuel')}if(s.team){kills++;notice('적 함선 격침 · '+kills+' / 3',4);slow=.1;if(kills===3&&!practice){result='victory';endTimer=2.2}}else{result='defeat';endTimer=2;notice('기함 손실 · 비상 탈출',5)}}
function fire(s,heavy=false){if(s.dead||s.cool>0||(!heavy&&s.overheated)||(heavy&&s.heavy>0))return false;let a=s.aim;const muzzle=s.world(s.w/2,14);let x=muzzle.x+Math.cos(a)*17,y=muzzle.y+Math.sin(a)*17;const speed=heavy?280:s.team?215:370;bullets.push({x,y,px:x,py:y,vx:Math.cos(a)*speed+s.vx*.35,vy:Math.sin(a)*speed+s.vy*.35,team:s.team,owner:s,heavy,life:4});s.cool=heavy?.38:s.team?.95:.18;if(heavy)s.heavy=5.5;else s.heat=Math.min(1,s.heat+.105);if(s.heat>=1){s.overheated=true;if(!s.team)notice('포신 과열 · 냉각 중',2)}s.vx-=Math.cos(a)*(heavy?14:2.2);s.vy-=Math.sin(a)*(heavy?10:1.2);for(let i=0;i<7;i++)addParticle(x,y,Math.cos(a)*rand(30,80)+rand(-10,10),Math.sin(a)*rand(30,80)+rand(-10,10),rand(.04,.12),heavy?5:3,'fire',13);playSound(heavy?'heavyShot':'lightShot',{x,y,size:heavy?1.5:.8});if(!s.team){shots++;shake=Math.min(4,shake+(heavy?2:.45))}return true;}
function hangarSound(kind,detail={}){playSound(kind,{...detail,ui:true});}
function beginOperation(){
 if(state!=='briefing'&&state!=='result')return;
 if(!window.__ironwakePreflight){reset(false);return;}
 const previous=state;setSound(audio?soundOn:true);state='preflight';keys.clear();pointer.down=false;
 window.__ironwakePreflight.open({ship:player.skin.toDataURL(),motion:options.shake,sound:hangarSound,launch:()=>reset(false),cancel:()=>{state=previous;}});
}
function reset(isPractice=false){rcsCameraOffset=0;collisionStats.contacts=collisionStats.crushed=collisionStats.detonations=0;practice=isPractice;ships=[new Ship(265,300,0),new Ship(640,280,1),new Ship(1020,220,1,1),new Ship(1440,350,1,2)];player=ships[0];bullets=[];particles=[];chunks=[];blasts=[];pending=[];flames=[];jetGas.length=0;billowSmoke.reset();fireFluid.reset();time=0;kills=0;shots=0;hits=0;shake=0;flash=0;slow=0;endTimer=0;result=null;keys.clear();pointer.down=false;cam={x:clamp(player.x-W*.38,0,Math.max(0,WORLD-W)),y:clamp(player.y-H*.47,0,Math.max(0,FLOOR-H+45))};document.documentElement.classList.toggle('in-briefing',false);state='playing';$('overlay').classList.add('hidden');$('settings').hidden=true;$('pauseMenu').hidden=true;$('pause').textContent='계속하기';$('resultStats').hidden=true;notice(isPractice?'사격 시험 · 적 무장 정지':'적 호위함 3척 · 교전 허가',4);C.focus();setSound(audio?soundOn:true);updateHUD();}
function showResult(){state='result';$('overlay').classList.remove('hidden');$('eyebrow').textContent=result==='victory'?'SECTOR 07 / ALL CLEAR':'SECTOR 07 / SIGNAL LOST';$('title').innerHTML=result==='victory'?'항로<br>확보':'기함<br>손실';$('title').setAttribute('aria-label',result==='victory'?'항로 확보':'기함 손실');$('subtitle').textContent=result==='victory'?'봉쇄 해제':'교신 두절';$('description').textContent=result==='victory'?'적 호위함 세 척이 무력화되었습니다.':'기관과 함교를 보호하십시오. 고도를 바꾸면 적 포화를 피할 수 있습니다.';$('mission').textContent='K-17 / 작전 01 — 잿빛 회랑';$('resultStats').hidden=false;$('resultStats').textContent=`격침 ${kills}/3 · 교전 ${Math.floor(time)}초 · 명중률 ${shots?Math.round(hits/shots*100):0}%`;$('start').innerHTML='재출격';$('start').setAttribute('aria-label','재출격');$('practice').textContent='사격 시험장 진입';}
function pause(){if(state==='playing'){state='paused';pointer.down=false;keys.clear();$('pauseMenu').hidden=false;$('pause').textContent='계속하기'}else if(state==='paused'){state='playing';$('pauseMenu').hidden=true;C.focus()}}
function updateShip(s,dt){s.collisionFx=Math.max(0,s.collisionFx-dt);for(const h of s.hazards)h.shock*=Math.exp(-dt*1.8);syncGearAttachments(s);if(!s.dead)updateGear(s,dt);s.cool=Math.max(0,s.cool-dt);s.heavy=Math.max(0,s.heavy-dt);s.heat=Math.max(0,s.heat-dt*.23);if(s.overheated&&s.heat<.3)s.overheated=false;s.flash=Math.max(0,s.flash-dt);
 if(s.dead){s.vy+=G*dt;s.deathTime+=dt;s.vx*=Math.exp(-.08*dt);if(s.rcs){s.rcs.torque=s.rcs.effort=s.rcs.flare=s.rcs.acceleration=0;s.rcs.command=0;}}
 else{let ix=0,iy=0,boost=false;if(s===player){ix=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);iy=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);boost=keys.has('ShiftLeft')||keys.has('ShiftRight');let p=s.world(s.w/2,14);s.aim=Math.atan2(pointer.y+cam.y-p.y,pointer.x+cam.x-p.x);if(pointer.down)fire(s);if(keys.has('Space'))fire(s,true)}else{const dx=player.x-s.x,dy=player.y-s.y;if(Math.abs(dx)<850&&!player.dead){ix=clamp((dx-Math.sign(dx)*250)/120,-.75,.75);iy=clamp((dy+Math.sin(time*.7+s.phase)*85)/110,-.75,.75);const lead=Math.hypot(dx,dy)/215;s.aim=Math.atan2(dy+player.vy*lead*.65-8,dx+player.vx*lead*.65)+Math.sin(time*2+s.phase)*.035;s.aiTimer-=dt;if(s.aiTimer<=0&&Math.abs(dx)<570&&!practice){fire(s);s.aiTimer=rand(1.25,2.2)}}}
  const response=1-Math.exp(-dt/ .24);s.tx=lerp(s.tx,ix,response);s.ty=lerp(s.ty,iy,response);const thrust=s.engineRatio;const mass=clamp(s.count/s.initial,.55,1);if(iy<0)s.resting=false;const liftTarget=s.resting?0:1;s.liftPower=lerp(s.liftPower,liftTarget,1-Math.exp(-dt*8));s.throttle=clamp((1-s.ty*.7+(boost?.5:0))*(.15+s.liftPower*.85),.08,2);s.vx+=(s.tx*(boost?103:65)*thrust/mass-s.vx*.37)*dt;s.vy+=(G*(1-thrust*s.liftPower)+s.ty*(boost?100:65)*thrust/mass-s.vy*.6)*dt;
  // Airborne attitude control supplies torque; a supported hull can tip freely.
  if(!s.resting){
   const command=s===player?Number(keys.has('KeyE'))-Number(keys.has('KeyQ')):0;
   const controlled=s===player&&window.__ironwakeRCS?.step(s,command,dt);
   if(controlled){
    // A balanced RCS pair turns the hull; canted main lift supplies real drift.
    const lift=G*thrust*s.liftPower-s.ty*(boost?100:65)*thrust/mass;
    s.vx+=Math.sin(s.angle)*lift*dt;s.vy+=(1-Math.cos(s.angle))*lift*dt;
   }else{const target=clamp(s.tx*.13+s.vx*.0006,-.2,.2);s.av+=((target-s.angle)*12-s.av*5)*thrust*dt;}
  }else{if(s===player)window.__ironwakeRCS?.step(s,0,dt);s.av*=Math.exp(-dt*.06);}
 }
 rotateBody(s,s.av*dt);s.x+=s.vx*dt;s.y+=s.vy*dt;solveGround(s,dt);if(s.grounded)s.resting=true;
 if(s.y<45){s.y=45;s.vy=Math.max(0,s.vy)}

 if(s.x<60||s.x>WORLD-60){s.x=clamp(s.x,60,WORLD-60);s.vx*=-.2}
 if(!s.dead)for(const e of s.engines)if(e.alive)emitEngine(s,e,dt);if(!s.dead&&s===player)emitRCS(s,dt);
 s.smokeAcc-=dt;if(s.count/s.initial<.75&&s.smokeAcc<=0){s.smokeAcc=rand(.08,.2);const p=s.world(s.w*(.38+Math.random()*.24),18);billowSmoke.emit(p.x,p.y,s.vx*.32+rand(-5,5),s.vy*.12-rand(12,26),rand(3.5,6),rand(4,6),s.dead?1.2:.85)}

}
function update(dt){time+=dt;
 const maxMotion=Math.max(...ships.map(s=>Math.hypot(s.vx,s.vy)+Math.abs(s.av)*s.w*.55));
 const substeps=clamp(Math.ceil(maxMotion*dt/1.25),1,8),subdt=dt/substeps;
 for(let sub=0;sub<substeps;sub++){for(const s of ships)updateShip(s,subdt);resolveShipCollisions(subdt)}
 // Sweep every projectile segment through occupied material cells; holes stay traversable.
 for(let bi=bullets.length-1;bi>=0;bi--){const b=bullets[bi];b.px=b.x;b.py=b.y;b.vy+=12*dt;const nx=b.x+b.vx*dt,ny=b.y+b.vy*dt,steps=Math.ceil(Math.hypot(nx-b.x,ny-b.y));let hit=false;for(let k=1;k<=steps&&!hit;k++){const x=lerp(b.x,nx,k/steps),y=lerp(b.y,ny,k/steps);if(y>=FLOOR){explosion(x,FLOOR,b.heavy?1:.45);hit=true;break}for(const s of ships){if(s===b.owner||s.team===b.team||s.count<10)continue;if(Math.abs(x-s.x)>s.w||Math.abs(y-s.y)>s.w)continue;if(s.contains(x,y)){damage(s,x,y,b.heavy?15:7,b.heavy?6:4);explosion(x,y,b.heavy?1.6:.65);s.vx+=b.vx*(b.heavy?.035:.006);s.vy+=b.vy*.006;if(b.team===0)hits++;hit=true;break}}}b.x=nx;b.y=ny;b.life-=dt;if(hit||b.life<=0||b.x<0||b.x>WORLD||b.y<0)bullets.splice(bi,1);}
 for(let i=pending.length-1;i>=0;i--){const p=pending[i];p.t-=dt;if(p.t<=0){pending.splice(i,1);const q=pendingPosition(p);damage(p.ship,q.x,q.y,p.radius,5);explosion(q.x,q.y,p.radius/10,p.wreckCascade?'wreck':p.hazard?.kind==='fuel'?'fuel':'impact');if(p.hazard){collisionStats.detonations++;if(p.hazard.kind==='fuel')ignite(q.x,q.y,1.05,5,p.ship,p.x,p.y,'fuel')}}}
 fireFluid.step(dt);
 updateParticles(dt);
 for(let i=chunks.length-1;i>=0;i--){let p=chunks[i];p.life-=dt;p.vy+=G*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.a+=p.av*dt;const bottom=Math.abs(Math.sin(p.a))*p.w/2+Math.abs(Math.cos(p.a))*p.h/2;if(p.y>FLOOR-bottom){if(p.vy>50){for(let j=0;j<5;j++)addParticle(p.x,FLOOR-1,rand(-25,25),rand(-25,-5),.6,2,'spark',11)}p.y=FLOOR-bottom;p.vy=Math.abs(p.vy)<7?0:-p.vy*.12;p.vx*=Math.exp(-dt*7);p.av*=Math.exp(-dt*9)}if(p.life<=0)chunks.splice(i,1)}
 for(let i=blasts.length-1;i>=0;i--){blasts[i].age+=dt;if(blasts[i].age>.5)blasts.splice(i,1)}
 if(rcsCameraOffset){cam.x-=rcsCameraOffset;rcsCameraOffset=0;}
 shake*=Math.exp(-dt*8);flash*=Math.exp(-dt*12);slow=Math.max(0,slow-dt);cam.x=lerp(cam.x,clamp(player.x-W*.38+player.vx*.3,0,Math.max(0,WORLD-W)),1-Math.exp(-dt*3));cam.y=lerp(cam.y,clamp(player.y-H*.47+player.vy*.2,0,Math.max(0,FLOOR-H+45)),1-Math.exp(-dt*3));
 if(player.rcs&&window.__ironwakeRCS){const offset=window.__ironwakeRCS.sway(player.rcs,dt,options.shake),base=cam.x;cam.x=clamp(base+offset,0,Math.max(0,WORLD-W));rcsCameraOffset=cam.x-base;}
 if(result){endTimer-=dt;if(endTimer<=0)showResult()}if(practice&&kills===3&&!result){result='victory';endTimer=2}msgTimer-=dt;if(msgTimer<=0)notice(practice?'사격 시험 · 적 무장 정지':player.engineRatio<.75?'기관 손상 · 추력 저하':'',4);hudTimer-=dt;if(hudTimer<=0){updateHUD();hudTimer=.1}stats.maxParticles=Math.max(stats.maxParticles,particles.length);stats.maxChunks=Math.max(stats.maxChunks,chunks.length);stats.maxFlames=Math.max(stats.maxFlames,flames.length);
}
function updateParticles(dt){updateJetGas(dt);billowSmoke.update(dt);
 const end=particles.length;for(let i=end-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){particles[i]=particles[particles.length-1];particles.pop();continue}p.px=p.x;p.py=p.y;const age=p.max-p.life;
  if(p.type==='ember'||p.type==='fire'){const gas=fireFluid.flow(p.x,p.y);p.vx+=(gas.u-p.vx)*dt*2;p.vy+=(gas.v-14-p.vy)*dt*1.6}
  else if(p.type==='smoke'){const gas=fireFluid.flow(p.x,p.y);p.vx+=(gas.u-p.vx)*dt*.7;p.vy+=(gas.v-9-p.vy)*dt*.6;p.size+=dt*3}
  else if(p.type==='exhaust'){p.vx+=(Math.sin(time*25+p.phase)*12-p.vx*.7)*dt;p.vy*=Math.exp(-dt*.4)}
  else if(p.type==='rcs'){const drag=Math.exp(-dt*2.5);p.vx*=drag;p.vy*=drag;}
  else if(p.type==='ash'){p.vy+=dt*9;p.vx+=(Math.sin(time*2+p.phase)*9-p.vx)*dt}
  else{p.vy+=G*dt;p.hot=Math.max(0,p.hot-dt*.4)}
  p.x+=p.vx*dt;p.y+=p.vy*dt;
  if(age>.14&&(p.type==='debris'||p.type==='spark'||p.type==='ember'))for(const s of ships){if(s.count<15||Math.abs(p.x-s.x)>s.w*.6||Math.abs(p.y-s.y)>34)continue;if(s.contains(p.x,p.y)){p.x=p.px;p.y=p.py;p.vx*=-.35;p.vy*=-.3;if(p.type==='ember'){p.life=Math.min(p.life,.25);p.hot*=.65}break}}
  if(p.y>=FLOOR){p.y=FLOOR-1;if(p.type==='ember'){p.type='ash';p.life=Math.min(.7,p.life);p.vy=-rand(1,5)}else{p.vy*=-.24;p.vx*=.65;p.life=Math.min(p.life,p.type==='debris'?.8:.3)}}
  if(p.type==='debris'&&p.hot>.4&&Math.random()<dt*12)addParticle(p.x,p.y,p.vx*.2+rand(-4,4),-rand(8,22),rand(.2,.5),1,'ember',11);
 }
}
function updateHUD(){if(!player)return;let hp=Math.max(0,Math.round(player.count/player.initial*100)),heat=Math.round(player.heat*100);$('hull').innerHTML=hp+'<small> %</small>';$('hullBar').style.width=hp+'%';$('hullBar').style.background=hp<40?'#efad73':'#99f9bd';$('engines').textContent='기관 '+player.engines.filter(e=>e.alive).length+'/4';$('heat').innerHTML=String(heat).padStart(2,'0')+'<small> %</small>';$('heatBar').style.width=heat+'%';$('gunState').textContent=player.overheated?'냉각 중':'사격 가능';$('alt').innerHTML=Math.max(0,Math.round(FLOOR-player.y))+'<small> m</small>';$('speed').textContent=Math.round(player.vx)+' m/s';$('heavy').textContent=player.heavy>0?'180 mm 재장전 · '+player.heavy.toFixed(1)+'s':'180 mm 고폭탄 · 준비';$('kills').textContent=String(kills).padStart(2,'0')+' / 03';}
// Seeded terrain silhouettes stay fixed as the camera moves.
let seed=7129;function rng(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}const skyline=[];for(let i=0;i<80;i++)skyline.push({x:i*35,y:18+rng()*65,w:12+rng()*25,t:rng()});const clouds=[];for(let i=0;i<45;i++)clouds.push({x:rng()*1100,y:rng()*250,w:25+rng()*95});
function rect(x,y,w,h,c){ctx.fillStyle=typeof c==='number'?PAL[c]:c;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))}
function line(x,y,x2,y2,c,width=1){ctx.strokeStyle=typeof c==='number'?PAL[c]:c;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(Math.round(x)+.5,Math.round(y)+.5);ctx.lineTo(Math.round(x2)+.5,Math.round(y2)+.5);ctx.stroke()}
function text(t,x,y,c=5,size=7,align='left'){ctx.fillStyle=typeof c==='number'?PAL[c]:c;ctx.font=`${Math.max(10,size)}px DepartureMono,Mona10,monospace`;ctx.textAlign=align;ctx.fillText(t,Math.round(x),Math.round(y));ctx.textAlign='left'}
function background(){rect(0,0,W,H,3);const horizon=268-cam.y*.22;rect(0,horizon-105,W,105,4);rect(0,horizon,W,H,5); // Sparse ordered dithering blends bands without blur.
 if(ctx.drawDitherBands)ctx.drawDitherBands(W,horizon,PAL);else for(let y=0;y<20;y++)for(let x=(y%2)*3;x<W;x+=6){rect(x,horizon-105+y,1,1,y<10?3:4);rect(x,horizon+y,1,1,4)}
 const sunX=490-cam.x*.035,sunY=80-cam.y*.08;ctx.fillStyle=PAL[6];ctx.beginPath();ctx.arc(sunX,sunY,24,0,Math.PI*2);ctx.fill();for(const c of clouds){let x=((c.x-cam.x*.14-time*.7)%1100+1100)%1100-150;rect(x,c.y-cam.y*.12,c.w,3,3);rect(x+12,c.y+4-cam.y*.12,c.w*.65,2,3)}
 for(let layer=0;layer<2;layer++){const base=310-cam.y*(layer?.55:.32),col=layer?2:3;for(const b of skyline){let x=b.x-cam.x*(layer?.55:.27)-120;if(x<-60||x>W+60)continue;let h=b.y*(layer?1.3:.8);rect(x,base-h,b.w,h,col);if(b.t>.6){rect(x+5,base-h-30,3,30,col);line(x+6,base-h-38,x+6,base-h-25,col);line(x+6,base-h-28,x+35,base-h-23,col);line(x+35,base-h-23,x+35,base-h-4,col)}if(layer&&b.t<.3){for(let yy=base-h+8;yy<base-8;yy+=12)for(let xx=x+5;xx<x+b.w-4;xx+=9)rect(xx,yy,2,2,9)}}rect(0,base,W,H,col)}
 const gy=FLOOR-cam.y;rect(0,gy,W,90,1);rect(0,gy,W,2,4);for(let x=-((cam.x|0)%42);x<W;x+=42){rect(x,gy+5,22,2,2);rect(x+17,gy+11,6,2,3)}
}
function shipLabel(label,x,y,color){ctx.fillStyle=PAL[color];ctx.font='6px DepartureMono,Consolas,monospace';ctx.textAlign='left';ctx.fillText(label,Math.round(x),Math.round(y));}
function drawShip(s){if(s.dirty)s.rebuild();const x=Math.round(s.x-cam.x),y=Math.round(s.y-cam.y);if(x<-140||x>W+140||y<-100||y>H+120)return;
 ctx.save();ctx.translate(x,y);ctx.rotate(s.angle);drawGear(s);ctx.drawImage(s.skin,-s.w/2,-s.h/2);drawRCS(s);
 if(!s.dead){for(const e of s.engines)if(e.alive){const ex=e.x-s.w/2,ey=e.y-s.h/2;rect(ex-2,ey-1,4,1,'#ffe9a9');rect(ex-1,ey,2,2,'#fff9d9')}
 const gx=0,gy=14-s.h/2;ctx.save();ctx.translate(gx,gy);ctx.rotate(s.aim-s.angle);rect(-4,-3,21,5,17);rect(-2,-3,16,1,23);rect(0,-2,16,1,21);rect(15,-3,3,6,18);rect(18,-2,3,4,16);rect(18,-2,3,1,24);for(let i=4;i<13;i+=3)rect(i,0,1,2,16);ctx.restore();rect(-6,gy-3,12,6,19);rect(-5,gy-3,10,1,24);rect(-4,gy-1,2,2,22);rect(3,gy-1,2,2,17)}
 ctx.restore();if(!s.dead&&state!=='briefing'){shipLabel(s.team?'HOSTILE / '+['SK-04','SK-11','SK-09'][s.variant]:'K-17',x-s.w/2,y-34,s.team?12:6);if(s.team){rect(x-s.w/2,y-30,34,2,1);rect(x-s.w/2,y-30,34*s.count/s.initial,2,14)}}
}

const fireColors=fireRamp.map(c=>'rgb('+c.join(',')+')');
function drawParticles(smokeOnly=false){for(const p of particles){if((p.type==='smoke')!==smokeOnly)continue;const x=Math.round(p.x-cam.x),y=Math.round(p.y-cam.y);if(x<-40||x>W+40||y<-40||y>H+40)continue;const t=p.life/p.max,age=p.max-p.life;
 if(p.type==='smoke')continue;
 if(p.type==='ember'||p.type==='fire'){const flicker=.82+Math.sin(time*31+p.phase)*.18,heat=clamp(t*flicker+.32,0,1),col=fireColors[clamp(Math.floor(heat*7),0,7)];rect(x,y,1,1,col);if(t>.55&&(p.seed&7)===0){ctx.globalAlpha=.4;rect(x-1,y,1,1,11);rect(x,y-1,1,1,12);ctx.globalAlpha=1}if(Math.abs(p.vy)>45&&t>.4&&p.seed%3===0)rect(x,y+1,1,1,10);continue}
 if(p.type==='rcs'){line(x,y,x-p.vx*.012,y-p.vy*.012,t>.5?'#d5f5ff':'#7baebc');rect(x,y,1,1,t>.5?'#f4ffff':'#8dbac5');continue}
 if(p.type==='exhaust'){rect(x,y,1,1,t>.7?7:t>.4?12:10);if(t>.6&&(p.seed&3)===0)rect(x+1,y,1,1,11);continue}
 if(p.type==='spark'){if(age<.22)line(x,y,x-p.vx*.014,y-p.vy*.014,11);rect(x,y,1,1,t>.55?7:t>.22?12:10);continue}
 if(p.type==='ash'){ctx.globalAlpha=Math.min(1,t*2);rect(x,y,1,1,4);ctx.globalAlpha=1;continue}
 rect(x,y,1,1,p.hot>.35?11:p.color);if(p.size>1.3){rect(x+1,y,1,1,p.color);if(p.seed&1)rect(x,y+1,1,1,2)}
}}
function drawFlames(){ctx.drawImage(fireFluid.skin,0,0)}
function drawLight(){lightCtx.clearRect(0,0,lightCanvas.width,lightCanvas.height);lightCtx.globalCompositeOperation='lighter';for(const l of fireFluid.lights){const sz=14,brightness=clamp(l.energy/160,0,.42);lightCtx.globalAlpha=brightness;lightCtx.drawImage(lightStamp,(l.x-cam.x)/4-sz/2,(l.y-cam.y)/4-sz/2,sz,sz)}for(const b of blasts){if(b.age>.25)continue;const sz=18+b.size*18;lightCtx.globalAlpha=(1-b.age/.25)*.85;lightCtx.drawImage(lightStamp,(b.x-cam.x)/4-sz/2,(b.y-cam.y)/4-sz/2,sz,sz)}for(const s of ships)if(!s.dead)for(const e of s.engines)if(e.alive){const p=s.world(e.x,e.y+7);lightCtx.globalAlpha=.14;lightCtx.drawImage(lightStamp,(p.x-cam.x)/4-4,(p.y-cam.y)/4-4,8,8)}lightCtx.globalAlpha=1;lightCanvas._revision=(lightCanvas._revision||0)+1;ctx.save();ctx.globalCompositeOperation='screen';ctx.imageSmoothingEnabled=true;ctx.drawImage(lightCanvas,0,0,W,H);ctx.restore();}
function drawBlasts(){for(const b of blasts){const x=b.x-cam.x,y=b.y-cam.y,t=b.age;if(t<.085){const r=Math.max(1,(1-t/.085)*(4+b.size*4));for(let yy=-Math.ceil(r);yy<=r;yy++)for(let xx=-Math.ceil(r);xx<=r;xx++){const n=fireNoise[(b.seed+xx*37+yy*71)&2047];if(xx*xx+yy*yy<r*r*(.65+n*.4))rect(x+xx,y+yy,1,1,n>.3?7:13)}}if(t<.26){ctx.globalAlpha=(1-t/.26)*.5;for(let j=0;j<28;j++){const n=fireNoise[(b.seed+j*31)&2047],a=j/28*Math.PI*2+n*.12,r=(5+t*(90+n*50))*b.size;if(n>.25)rect(x+Math.cos(a)*r,y+Math.sin(a)*r*.75,1,1,11)}ctx.globalAlpha=1}}}
function tactical(){if(state==='briefing')return;const x=Math.round(24/viewScale),y=Math.round(88/viewScale);text(practice?'RANGE / LIVE AMMUNITION':'SECTOR 07 / ENGAGEMENT',x,y,'#85c79e',7);text(String(Math.floor(time/60)).padStart(2,'0')+':'+String(Math.floor(time%60)).padStart(2,'0'),W-20,y,'#8aceaa',8,'right');line(x,y+10,x+82,y+10,5);
 // Compact bearing strip locates enemies outside the viewport.
 line(W/2-90,18,W/2+90,18,4);for(const s of ships.filter(s=>s.team&&!s.dead)){const dx=s.x-player.x;const bx=W/2+clamp(dx/W,-1,1)*87;rect(bx-2,15,4,5,14);if(s.x-cam.x>W-18||s.x-cam.x<18){const cssWidth=W*viewScale,clearance=(cssWidth<=520?155:cssWidth<=900?185:clamp(cssWidth*.13,154,218)+56)/viewScale;let right=dx>0,ex=right?W-clearance:clearance,ey=clamp(s.y-cam.y,70/viewScale,H-35);text(right?'▶':'◀',ex,ey,12,10);text(Math.round(Math.abs(dx))+'m',ex+(right?-5:5),ey+12,5,6,right?'right':'left')}}rect(W/2-1,14,2,8,6);
 if(pointer.inside&&!player.dead){const x=pointer.x,y=pointer.y;line(x-8,y,x-3,y,6);line(x+3,y,x+8,y,6);line(x,y-8,x,y-3,6);line(x,y+3,x,y+8,6);rect(x,y,1,1,12);if(player.heavy<=0){line(x-10,y-10,x-6,y-10,11);line(x+6,y+10,x+10,y+10,11)}}
 if(player.overheated)text('BARREL OVERHEAT',W/2,H-22,12,8,'center');else if(player.engineRatio<.75)text('ENGINE DAMAGE / THRUST LOSS',W/2,H-22,12,8,'center');
}
function render(){
 ctx.begin?.();
 ctx.imageSmoothingEnabled=false;ctx.save();if(options.shake&&shake>.05)ctx.translate(Math.round(rand(-shake,shake)),Math.round(rand(-shake,shake)));
 background();fireFluid.raster();ctx.drawImage(fireFluid.smokeSkin,0,0);billowSmoke.raster();ctx.drawImage(billowSmoke.canvas,Math.round(billowSmoke.cx-cam.x),Math.round(billowSmoke.cy-cam.y),W,H);drawJetGas();for(const s of ships)drawShip(s);
 for(const p of chunks){ctx.save();ctx.translate(Math.round(p.x-cam.x),Math.round(p.y-cam.y));ctx.rotate(p.a);ctx.drawImage(p.im,-p.w/2,-p.h/2);ctx.restore()}
 drawFlames();drawParticles();
 for(const b of bullets){line(b.x-cam.x,b.y-cam.y,b.x-b.vx*.035-cam.x,b.y-b.vy*.035-cam.y,b.heavy?13:b.team?14:7,b.heavy?2:1);rect(b.x-cam.x,b.y-cam.y,1,1,7)}
 drawBlasts();drawLight();ctx.restore();
 if(options.flash&&flash>.005){ctx.globalAlpha=flash;rect(0,0,W,H,7);ctx.globalAlpha=1}
 if(options.scan){ctx.globalAlpha=.055;for(let y=0;y<H;y+=3)rect(0,y,W,1,0);ctx.globalAlpha=1}tactical();
 if(state==='paused'){ctx.globalAlpha=$('settings').hidden?.6:.27;rect(0,0,W,H,0);ctx.globalAlpha=1;}frames++;stats.frames=frames;ctx.end?.();
}
function loop(ts){window.__ironwakeFPS?.frame(ts);syncAudio();if(!last)last=ts;let elapsed=Math.min((ts-last)/1000,.1);last=ts;if(state==='preflight'){acc=0;requestAnimationFrame(loop);return}if(state==='playing'){acc+=elapsed*(slow>0?.55:1);let n=0;while(acc>=STEP&&n<6&&state==='playing'){update(STEP);acc-=STEP;n++}}else{acc=0;if(state==='briefing'){time+=elapsed;player.y=cam.y+H*.54+Math.sin(time*.6)*2;player.aim=-.2;player.throttle=1;for(const e of player.engines)if(e.alive)emitEngine(player,e,elapsed);updateJetGas(elapsed);billowSmoke.update(elapsed)}}render();requestAnimationFrame(loop)}
function resizeViewport(){rcsCameraOffset=0;
 const r=$('stage').getBoundingClientRect?.()||{width:1280,height:720};if(!r.width||!r.height)return;
 const scale=Math.max(Math.min(r.width/640,r.height/360),r.width/1280,r.height/720,.5),nw=Math.max(240,Math.round(r.width/scale)),nh=Math.max(180,Math.round(r.height/scale));
 viewScale=r.width/nw;ctx.resize?.(nw,nh);if(nw===W&&nh===H)return;const ow=W,oh=H;W=nw;H=nh;if(!ctx.isGPU){C.width=W;C.height=H;}fireFluid.resize();billowSmoke.resize();lightCanvas.width=Math.ceil(W/4);lightCanvas.height=Math.ceil(H/4);pointer.x=pointer.x/ow*W;pointer.y=pointer.y/oh*H;
 if(state==='briefing'){cam.x=0;cam.y=clamp((FLOOR-H)*.25,0,100);player.x=W*.72;player.y=cam.y+H*.54}
 else{cam.x=clamp(player.x-W*.38,0,Math.max(0,WORLD-W));cam.y=clamp(player.y-H*.47,0,Math.max(0,FLOOR-H+45))}
}
function pointerPos(e){const r=C.getBoundingClientRect();pointer.x=(e.clientX-r.left)/r.width*W;pointer.y=(e.clientY-r.top)/r.height*H;pointer.inside=true}
C.addEventListener('pointermove',pointerPos);C.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointerPos(e);pointer.down=state==='playing';C.focus();C.setPointerCapture(e.pointerId)});C.addEventListener('pointerup',()=>pointer.down=false);C.addEventListener('pointercancel',()=>pointer.down=false);C.addEventListener('pointerleave',()=>pointer.inside=false);C.addEventListener('contextmenu',e=>e.preventDefault());window.addEventListener('pointerup',()=>pointer.down=false);
window.addEventListener('keydown',e=>{if(state==='preflight'){if(e.code==='KeyM'&&!e.repeat)setSound(!soundOn);return;}if(e.target instanceof HTMLInputElement)return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(!e.repeat){if(e.code==='Escape'){if(!$('settings').hidden){$('settings').hidden=true;return}pause()}if(e.code==='KeyR'&&state!=='briefing')reset(practice);if(e.code==='KeyM')setSound(!soundOn);if(e.code==='KeyG')toggleGear()}if(state==='playing')keys.add(e.code)});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();pointer.down=false;if(state==='playing')pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')pause()});
$('start').onclick=beginOperation;$('practice').onclick=()=>reset(true);$('pause').onclick=pause;$('sound').onclick=()=>setSound(!soundOn);$('options').onclick=()=>{if(state==='playing')pause();$('settings').hidden=!$('settings').hidden};$('closeSettings').onclick=()=>{$('settings').hidden=true;if(state==='paused')pause()};$('titleOptions').onclick=()=>{$('settings').hidden=false;$('settings').scrollTop=0};$('titleControls').onclick=()=>{$('settings').hidden=false;document.querySelector('.control-guide')?.scrollIntoView({block:'nearest'})};$('titleSound').onclick=()=>setSound(!soundOn);for(const name of ['shake','flash','scan'])$(name).onchange=e=>{options[name]=e.target.checked;if(name==='shake')document.documentElement.classList.toggle('steady-projection',!options.shake)};document.documentElement.classList.toggle('steady-projection',!options.shake);$('volume').oninput=()=>{if(soundOn)setSound(true)};
player=new Ship(453,260,0);player.aim=-.2;ships=[player];cam={x:0,y:70};updateHUD();
resizeViewport();window.addEventListener('resize',resizeViewport);if(typeof ResizeObserver==='function')new ResizeObserver(resizeViewport).observe($('stage'));
// Condensation and scratches remain on the glass, behind the projected lettering.
let glassSeed=17491;const glassRandom=()=>{glassSeed=(glassSeed*1664525+1013904223)>>>0;return glassSeed/4294967296};$('titleGlass').innerHTML=Array.from({length:92},(_,i)=>{const x=(glassRandom()*100).toFixed(2),y=(glassRandom()*100).toFixed(2),w=2+glassRandom()*4,h=3+glassRandom()*9;return i<74?`<i style="left:${x}%;top:${y}%;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;opacity:${(.25+glassRandom()*.5).toFixed(2)}"></i>`:`<i class="scratch" style="left:${x}%;top:${y}%;width:${(20+glassRandom()*140).toFixed(0)}px"></i>`}).join('');
// Read-only diagnostics are useful for performance and regression checks.
window.IRONWAKE={snapshot:()=>({state,viewport:{width:W,height:H},rendering:ctx.diagnostics?.()||{type:'Canvas 2D'},time,kills,shots,hits,hull:player.count/player.initial,engines:player.engineRatio,player:{x:player.x,y:player.y,vx:player.vx,vy:player.vy},ships:ships.map(s=>({team:s.team,dead:s.dead,cells:s.count,initial:s.initial,engines:s.engineRatio,x:s.x,y:s.y})),collisions:{...collisionStats},smokeClouds:billowSmoke.puffs.length,jetParcels:jetGas.length,gear:{target:player.gearTarget,time:player.gearTime,grounded:!!player.grounded,legs:player.legs.map(l=>({cut:l.cut,hp:l.hp.slice()})),angle:player.angle,angularVelocity:player.av,contacts:player.contacts},particles:particles.length,chunks:chunks.length,pending:pending.length,flames:flames.length,fireCells:fireFluid.burning,flowCells:fireFluid.count,...stats})};
window.IRONWAKE.audio=()=>window.__ironwakeSound?.diagnostics()||{state:'unavailable'};
window.IRONWAKE.attitude=()=>({angle:player.angle,angularVelocity:player.av,command:player.rcs?.command||0,torque:player.rcs?.torque||0,effort:player.rcs?.effort||0,cameraSway:rcsCameraOffset});
requestAnimationFrame(loop);
})();
