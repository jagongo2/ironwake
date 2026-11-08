// A small actual 3D mesh, rendered only when its pose/lighting/size changes.
// No scene-library dependency and no image transforms. Canvas projects the same
// mesh if this device cannot create a second WebGL context.
const add=(a,b)=>a.map((v,i)=>v+b[i]),scale=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>scale(a,1/(Math.hypot(...a)||1));
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function multiply(a,b){const out=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
function transform(m,p,w=1){return [0,1,2,3].map(r=>m[r]*p[0]+m[r+4]*p[1]+m[r+8]*p[2]+m[r+12]*w);}
function perspective(aspect){const f=1/Math.tan(34*Math.PI/360),near=1,far=1000;return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];}
const eye=[0,80,350];
function cameraView(cameraEye){const z=norm([cameraEye[0],cameraEye[1]-62,cameraEye[2]-15]),x=norm(cross([0,1,0],z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,cameraEye),-dot(y,cameraEye),-dot(z,cameraEye),1];}
const steel=[.13,.12,.09,.3],edge=[.23,.20,.14,.45],chrome=[.34,.31,.23,.65],black=[.022,.019,.015,.1],red=[.20,.033,.017,.28],ridge=[.10,.016,.009,.2];
function paintedSurface(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d'),image=ctx.createImageData(512,512);
  let seed=716391;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const field=size=>{const data=new Float32Array(size*size);for(let i=0;i<data.length;i++)data[i]=random();return {data,size};};
  const coarse=field(17),fine=field(65),brush=field(33);
  const sample=(grid,x,y)=>{x=((x%1)+1)%1*(grid.size-1);y=((y%1)+1)%1*(grid.size-1);const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,a=fx*fx*(3-2*fx),b=fy*fy*(3-2*fy),i=ix+iy*grid.size,d=grid.data;return (d[i]*(1-a)+d[i+1]*a)*(1-b)+(d[i+grid.size]*(1-a)+d[i+grid.size+1]*a)*b;};
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=(x+y*512)*4,u=x/512,v=y/512;image.data[i]=(sample(coarse,u,v)*.74+sample(fine,u,v)*.26)*255;image.data[i+1]=sample(brush,u*.8,v*3)*44;image.data[i+2]=random()*255;image.data[i+3]=255;}
  ctx.putImageData(image,0,0);ctx.globalCompositeOperation='screen';ctx.lineCap='round';
  for(let i=0;i<260;i++){const x=random()*512,y=random()*512,length=4+random()*42;ctx.strokeStyle=`rgba(0,${90+Math.floor(random()*150)},0,${.3+random()*.5})`;ctx.lineWidth=.35+random()*.8;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+length*.35,y+random()*2);ctx.lineTo(x+length,y-1+random()*3);ctx.stroke();}
  return {canvas,pixels:ctx.getImageData(0,0,512,512).data};
}
function geometry(){
  const base=[],arm=[];
  const vertex=(out,p,n,m)=>out.push(...p,...n,...m);
  const triangle=(out,a,b,c,na,nb,nc,m)=>{vertex(out,a,na,m);vertex(out,b,nb,m);vertex(out,c,nc,m);};
  function box(out,center,size,m){const half=scale(size,.5),p=(x,y,z)=>add(center,[x*half[0],y*half[1],z*half[2]]);for(const [n,face] of [
    [[0,0,1],[p(-1,-1,1),p(1,-1,1),p(1,1,1),p(-1,1,1)]],[[0,0,-1],[p(1,-1,-1),p(-1,-1,-1),p(-1,1,-1),p(1,1,-1)]],
    [[1,0,0],[p(1,-1,1),p(1,-1,-1),p(1,1,-1),p(1,1,1)]],[[-1,0,0],[p(-1,-1,-1),p(-1,-1,1),p(-1,1,1),p(-1,1,-1)]],
    [[0,1,0],[p(-1,1,1),p(1,1,1),p(1,1,-1),p(-1,1,-1)]],[[0,-1,0],[p(-1,-1,-1),p(1,-1,-1),p(1,-1,1),p(-1,-1,1)]]
  ]){triangle(out,face[0],face[1],face[2],n,n,n,m);triangle(out,face[0],face[2],face[3],n,n,n,m);}}
  function cylinder(out,a,b,r,m,segments=28){const axis=norm(add(b,scale(a,-1))),u=norm(cross(axis,Math.abs(axis[2])<.9?[0,0,1]:[0,1,0])),v=cross(axis,u);
    for(let i=0;i<segments;i++){const q=i/segments*Math.PI*2,t=(i+1)/segments*Math.PI*2,n=add(scale(u,Math.cos(q)),scale(v,Math.sin(q))),nn=add(scale(u,Math.cos(t)),scale(v,Math.sin(t))),a0=add(a,scale(n,r)),a1=add(a,scale(nn,r)),b0=add(b,scale(n,r)),b1=add(b,scale(nn,r));triangle(out,a0,b0,b1,n,n,nn,m);triangle(out,a0,b1,a1,n,nn,nn,m);triangle(out,a,a1,a0,scale(axis,-1),scale(axis,-1),scale(axis,-1),m);triangle(out,b,b0,b1,axis,axis,axis,m);}}
  function sphere(out,center,r,m){for(let y=0;y<10;y++)for(let x=0;x<24;x++){const point=(xx,yy)=>{const a=xx/24*Math.PI*2,b=yy/10*Math.PI;return [Math.sin(b)*Math.cos(a),Math.cos(b),Math.sin(b)*Math.sin(a)];};const n=[point(x,y),point(x+1,y),point(x+1,y+1),point(x,y+1)],p=n.map(v=>add(center,scale(v,r)));triangle(out,p[0],p[1],p[2],n[0],n[1],n[2],m);triangle(out,p[0],p[2],p[3],n[0],n[2],n[3],m);}}
  box(base,[0,0,-10],[86,80,10],black);box(base,[0,0,-5],[82,76,8],edge);box(base,[0,0,-.3],[76,70,3],steel);
  box(base,[0,14,3],[18,42,6],black);
  for(const x of [-30,30])for(const y of [-26,26]){cylinder(base,[x,y,1],[x,y,5],5.4,black);cylinder(base,[x,y,5],[x,y,7],4.2,chrome);box(base,[x,y,7.2],[5.4,.9,.8],black);}
  cylinder(base,[-38,0,13],[38,0,13],10,chrome);for(const x of [-32,32]){cylinder(base,[x-5,0,13],[x+5,0,13],13,steel);cylinder(base,[x-6,0,13],[x-5,0,13],11,edge);}
  box(arm,[0,10,0],[14,25,17],steel);cylinder(arm,[0,15,0],[0,121,0],3.8,chrome);cylinder(arm,[0,112,0],[0,120,0],6.5,chrome);
  cylinder(arm,[0,119,0],[0,133,0],7,red);cylinder(arm,[-32,133,0],[32,133,0],10.8,red);sphere(arm,[-32,133,0],10.8,red);sphere(arm,[32,133,0],10.8,red);
  for(const x of [-28,-24,24,28])cylinder(arm,[x-.65,133,0],[x+.65,133,0],11.2,ridge);
  return {base:new Float32Array(base),arm:new Float32Array(arm)};
}
const vertexSource=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec4 aMaterial;
uniform mat4 uModel;uniform mat4 uVP;uniform mediump float uShadow;
uniform mediump vec2 uShadowOffset;
varying vec3 vWorld;varying vec3 vLocal;varying vec3 vNormal;varying vec3 vSurface;varying vec4 vMaterial;
void main(){vec4 world=uModel*vec4(aPosition,1.);vLocal=aPosition;vNormal=mat3(uModel)*aNormal;vSurface=aNormal;vMaterial=aMaterial;
if(uShadow>.5){float plane=uShadow>1.5?-16.:1.5;float height=max(0.,world.z-plane);world.x+=height*.32+uShadowOffset.x;world.y-=height*.65-uShadowOffset.y;world.z=plane;}vWorld=world.xyz;gl_Position=uVP*world;}`;
const fragmentSource=`precision mediump float;varying vec3 vWorld;varying vec3 vLocal;varying vec3 vNormal;varying vec4 vMaterial;
varying vec3 vSurface;
uniform vec3 uEye;uniform mediump float uShadow;uniform float uArmed;uniform float uHover;uniform float uShadowAlpha;uniform sampler2D uSurface;
float hash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,39.425)))*43758.5453);}
void main(){if(uShadow>.5){if(uShadow<1.5&&(abs(vWorld.x)>37.||abs(vWorld.y)>34.))discard;gl_FragColor=vec4(0.,0.,0.,uShadowAlpha);return;}
vec3 weights=pow(abs(vSurface),vec3(4.));weights/=max(.001,weights.x+weights.y+weights.z);
vec3 surface=texture2D(uSurface,vLocal.yz*.01+.5).rgb*weights.x+texture2D(uSurface,vLocal.xz*.01+.5).rgb*weights.y+texture2D(uSurface,vLocal.xy*.01+.5).rgb*weights.z;
float paint=step(vMaterial.g*2.5,vMaterial.r),rust=smoothstep(.38,.68,surface.r+surface.b*.07)*mix(.92,.4,paint),scratch=smoothstep(.28,.78,surface.g);
vec3 n=normalize(vNormal+(surface.b-.5)*.055),v=normalize(uEye-vWorld),l=normalize(vec3(-100.,240.,400.)-vWorld);
float diffuse=max(dot(n,l),0.),bands=floor((diffuse+(surface.g-.2)*.08)*6.)/6.;
float chiaroscuro=mix(bands,diffuse,.3),lit=smoothstep(.12,.7,chiaroscuro),finish=vMaterial.a*(1.-rust*.8);
vec3 albedo=mix(vMaterial.rgb,vec3(.23,.088,.023),rust*.8);albedo=mix(albedo,vec3(.43,.35,.22),scratch*(.45-paint*.27));
albedo*=.77+surface.b*.18+surface.g*.16;
float spec=pow(max(dot(n,normalize(l+v)),0.),34.+finish*60.)*(.08+finish*.62)*(1.-rust*.75);
vec3 color=albedo*(.025+lit*.55+pow(diffuse,1.7)*.58)+vec3(.76,.57,.31)*spec*(1.+uHover*.16);
color+=pow(1.-max(dot(n,v),0.),4.)*finish*vec3(.045,.031,.017);
color*=mix(.78,1.,uArmed);color+=(hash(floor(gl_FragCoord.xyz))-.5)*.009;
gl_FragColor=vec4(pow(max(color,vec3(0.)),vec3(.9)),1.);}`;

export function createLeverView(canvas,onGrip) {
  const meshes=geometry();let gl,ctx,program,buffers,locations,observer,surface,initialized=false,position=0,armed=false,hover=false,vp,model,cameraEye=eye;
  const clamp=v=>Math.max(0,Math.min(1,v));
  function init(){
    initialized=true;
    try{
      surface ||= paintedSurface();
      gl=canvas.getContext('webgl',{alpha:true,antialias:true,stencil:true,premultipliedAlpha:false,powerPreference:'low-power'});
      if(!gl)throw Error('No WebGL');
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
      program=gl.createProgram();const vs=shader(gl.VERTEX_SHADER,vertexSource),fs=shader(gl.FRAGMENT_SHADER,fragmentSource);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.deleteShader(vs);gl.deleteShader(fs);
      locations={};for(const name of ['uModel','uVP','uEye','uShadow','uShadowOffset','uShadowAlpha','uSurface','uArmed','uHover'])locations[name]=gl.getUniformLocation(program,name);
      for(const name of ['aPosition','aNormal','aMaterial'])locations[name]=gl.getAttribLocation(program,name);
      buffers={};for(const [name,data] of Object.entries(meshes)){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);buffers[name]=buffer;}
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,surface.canvas);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);canvas.dataset.renderer='webgl3d';
    }catch(error){
      console.warn('3D lever WebGL unavailable; using projected mesh.',error.message);
      if(gl){const previous=canvas,next=canvas.cloneNode(false);canvas.replaceWith(next);canvas=next;gl=null;observer?.unobserve(previous);observer?.observe(canvas);}
      ctx=canvas.getContext('2d');canvas.dataset.renderer='canvas3d';
    }
  }
  function project(point,m=model){const p=transform(vp,transform(m,point));return {x:(p[0]/p[3]+1)/2,y:(1-p[1]/p[3])/2,z:p[2]/p[3]};}
  function grip(){
    const points=[];for(const x of [-45,45])for(const y of [121,145])for(const z of [-12,12])points.push(project([x,y,z]));
    const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
    onGrip({left:clamp(left-.015),top:clamp(top-.015),width:Math.min(1,right-left+.03),height:Math.min(1,bottom-top+.03)});
  }
  function drawGL(){
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT|gl.STENCIL_BUFFER_BIT);gl.useProgram(program);
    gl.uniformMatrix4fv(locations.uVP,false,new Float32Array(vp));gl.uniform3fv(locations.uEye,cameraEye);gl.uniform1f(locations.uArmed,armed?1:0);gl.uniform1f(locations.uHover,hover&&armed?1:0);
    gl.uniform1i(locations.uSurface,0);
    const draw=(name,m,shadow)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffers[name]);for(const [attribute,size,offset] of [['aPosition',3,0],['aNormal',3,12],['aMaterial',4,24]]){gl.enableVertexAttribArray(locations[attribute]);gl.vertexAttribPointer(locations[attribute],size,gl.FLOAT,false,40,offset);}gl.uniformMatrix4fv(locations.uModel,false,new Float32Array(m));gl.uniform1f(locations.uShadow,shadow);gl.drawArrays(gl.TRIANGLES,0,meshes[name].length/10);};
    const shadow=(mode,alpha,x,y)=>{
      gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
      gl.stencilMask(255);gl.clear(gl.STENCIL_BUFFER_BIT);gl.enable(gl.STENCIL_TEST);gl.stencilFunc(gl.EQUAL,0,255);gl.stencilOp(gl.KEEP,gl.KEEP,gl.INCR);
      gl.uniform1f(locations.uShadowAlpha,alpha);gl.uniform2f(locations.uShadowOffset,x,y);
      if(mode===2)draw('base',identity(),mode);draw('arm',model,mode);
      gl.disable(gl.STENCIL_TEST);gl.depthMask(true);gl.disable(gl.BLEND);
    };
    // Separate soft cast shadows on the console from the dark hinge contact layer.
    shadow(2,.13,-.7,.4);shadow(2,.13,.7,-.4);draw('base',identity(),0);shadow(1,.35,0,0);draw('arm',model,0);
  }
  function drawCanvas(){
    const triangles=[];for(const [name,data] of Object.entries(meshes)){const m=name==='arm'?model:identity();for(let i=0;i<data.length;i+=30){const points=[0,10,20].map(k=>project([data[i+k],data[i+k+1],data[i+k+2]],m));const n=norm(transform(m,[data[i+3],data[i+4],data[i+5]],0).slice(0,3)),diffuse=Math.max(0,dot(n,norm([-.25,.6,1]))),brightness=.025+Math.pow(diffuse,1.5)*1.1;
      const u=((data[i]*.01+.5)%1+1)%1,v=((data[i+1]*.01+.5)%1+1)%1,index=(Math.floor(u*512)+Math.floor(v*512)*512)*4,rust=clamp((surface.pixels[index]/255-.38)/.3)*.7,scratch=clamp((surface.pixels[index+1]/255-.28)/.5);
      const colors=[data[i+6],data[i+7],data[i+8]].map((c,k)=>(c*(1-rust)+[.23,.088,.023][k]*rust)*(1-scratch*.3)+[.43,.35,.22][k]*scratch*.3);
      triangles.push({points,z:points.reduce((s,p)=>s+p.z,0)/3,color:colors.map(c=>Math.min(255,Math.round(Math.pow(c*brightness,.9)*(armed?1:.78)*255)))});}}
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const shadowPoint=point=>{const p=transform(model,point),height=p[2]+16;return project([p[0]+height*.32,p[1]-height*.65,-16],identity());};
    ctx.save();ctx.strokeStyle='#0006';ctx.lineCap='round';ctx.shadowColor='#0007';ctx.shadowBlur=3;for(const [a,b,width] of [[[0,0,0],[0,133,0],7],[[-43,133,0],[43,133,0],22]]){const p=shadowPoint(a),q=shadowPoint(b);ctx.lineWidth=width*canvas.height/230;ctx.beginPath();ctx.moveTo(p.x*canvas.width,p.y*canvas.height);ctx.lineTo(q.x*canvas.width,q.y*canvas.height);ctx.stroke();}ctx.restore();
    triangles.sort((a,b)=>b.z-a.z);for(const t of triangles){ctx.fillStyle=`rgb(${t.color.join(',')})`;ctx.beginPath();t.points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*canvas.width,p.y*canvas.height));ctx.closePath();ctx.fill();}
  }
  function render(next=position,nextArmed=armed,nextHover=hover){
    position=next;armed=nextArmed;hover=nextHover;const bounds=canvas.getBoundingClientRect();if(bounds.width<1||bounds.height<1)return;
    if(!initialized)init();const ratio=Math.min(devicePixelRatio||1,2),width=Math.round(bounds.width*ratio),height=Math.round(bounds.height*ratio);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    // No side-camera yaw: the shaft stays on the vertical centreline throughout.
    const aspect=width/height;cameraEye=eye;
    vp=multiply(perspective(aspect),cameraView(cameraEye));const angle=position*66*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);model=[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,13,1];
    if(gl)drawGL();else if(ctx)drawCanvas();grip();canvas.dataset.position=position.toFixed(4);
  }
  observer=new ResizeObserver(()=>render());observer.observe(canvas);
  canvas.addEventListener('webglcontextlost',event=>event.preventDefault());
  canvas.addEventListener('webglcontextrestored',()=>{initialized=false;render();});
  return {render};
}
