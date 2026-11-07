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
const eye=[76,104,350];
function cameraView(cameraEye){const z=norm([cameraEye[0],cameraEye[1]-62,cameraEye[2]-15]),x=norm(cross([0,1,0],z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,cameraEye),-dot(y,cameraEye),-dot(z,cameraEye),1];}
const steel=[.19,.20,.17,.38],edge=[.32,.33,.29,.5],chrome=[.62,.66,.63,1],black=[.045,.052,.043,.14],red=[.32,.026,.017,.6],ridge=[.22,.016,.012,.5];
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
varying vec3 vWorld;varying vec3 vLocal;varying vec3 vNormal;varying vec4 vMaterial;
void main(){vec4 world=uModel*vec4(aPosition,1.);vLocal=aPosition;vNormal=mat3(uModel)*aNormal;vMaterial=aMaterial;
if(uShadow>.5){world.x-=world.z*.38;world.y-=world.z*.65;world.z=1.5;}vWorld=world.xyz;gl_Position=uVP*world;}`;
const fragmentSource=`precision mediump float;varying vec3 vWorld;varying vec3 vLocal;varying vec3 vNormal;varying vec4 vMaterial;
uniform vec3 uEye;uniform mediump float uShadow;uniform float uArmed;uniform float uHover;
float hash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,39.425)))*43758.5453);}
void main(){if(uShadow>.5){if(abs(vWorld.x)>37.||abs(vWorld.y)>34.)discard;gl_FragColor=vec4(0.,0.,0.,.23);return;}
vec3 n=normalize(vNormal),v=normalize(uEye-vWorld),l=normalize(vec3(-100.,260.,240.)-vWorld),fill=normalize(vec3(180.,130.,110.)-vWorld);
float grain=hash(floor(vLocal*12.)),scratches=step(.994,hash(vec3(floor(vLocal.x*3.),floor(vLocal.y*25.),floor(vLocal.z*3.))));
float diffuse=max(dot(n,l),0.),rim=max(dot(n,fill),0.),finish=vMaterial.a;
float spec=pow(max(dot(n,normalize(l+v)),0.),28.+finish*75.)*(.25+finish*1.35);
float coolSpec=pow(max(dot(n,normalize(fill+v)),0.),38.)*.16;
vec3 albedo=vMaterial.rgb*(.89+grain*.15)+scratches*.06;
vec3 color=albedo*(.34+diffuse*.85+rim*.2)+vec3(1.,.85,.63)*spec+vec3(.65,.85,.76)*coolSpec;
color+=pow(1.-max(dot(n,v),0.),3.)*finish*.13;color*=mix(.72,1.,uArmed);color+=uHover*.025;
gl_FragColor=vec4(pow(max(color,vec3(0.)),vec3(.9)),1.);}`;

export function createLeverView(canvas,onGrip) {
  const meshes=geometry();let gl,ctx,program,buffers,locations,observer,initialized=false,position=0,armed=false,hover=false,vp,model,cameraEye=eye;
  const clamp=v=>Math.max(0,Math.min(1,v));
  function init(){
    initialized=true;
    try{
      gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,powerPreference:'low-power'});
      if(!gl)throw Error('No WebGL');
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
      program=gl.createProgram();const vs=shader(gl.VERTEX_SHADER,vertexSource),fs=shader(gl.FRAGMENT_SHADER,fragmentSource);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.deleteShader(vs);gl.deleteShader(fs);
      locations={};for(const name of ['uModel','uVP','uEye','uShadow','uArmed','uHover'])locations[name]=gl.getUniformLocation(program,name);
      for(const name of ['aPosition','aNormal','aMaterial'])locations[name]=gl.getAttribLocation(program,name);
      buffers={};for(const [name,data] of Object.entries(meshes)){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);buffers[name]=buffer;}
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
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
    gl.uniformMatrix4fv(locations.uVP,false,new Float32Array(vp));gl.uniform3fv(locations.uEye,cameraEye);gl.uniform1f(locations.uArmed,armed?1:0);gl.uniform1f(locations.uHover,hover&&armed?1:0);
    const draw=(name,m,shadow)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffers[name]);for(const [attribute,size,offset] of [['aPosition',3,0],['aNormal',3,12],['aMaterial',4,24]]){gl.enableVertexAttribArray(locations[attribute]);gl.vertexAttribPointer(locations[attribute],size,gl.FLOAT,false,40,offset);}gl.uniformMatrix4fv(locations.uModel,false,new Float32Array(m));gl.uniform1f(locations.uShadow,shadow);gl.drawArrays(gl.TRIANGLES,0,meshes[name].length/10);};
    draw('base',identity(),0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);draw('arm',model,1);gl.depthMask(true);gl.disable(gl.BLEND);draw('arm',model,0);
  }
  function drawCanvas(){
    const triangles=[];for(const [name,data] of Object.entries(meshes)){const m=name==='arm'?model:identity();for(let i=0;i<data.length;i+=30){const points=[0,10,20].map(k=>project([data[i+k],data[i+k+1],data[i+k+2]],m));const n=norm(transform(m,[data[i+3],data[i+4],data[i+5]],0).slice(0,3));const brightness=.38+Math.max(0,dot(n,norm([-.4,.8,.6])))*.85;triangles.push({points,z:points.reduce((s,p)=>s+p.z,0)/3,color:[data[i+6],data[i+7],data[i+8]].map(c=>Math.min(255,Math.round(c*brightness*(armed?1:.72)*255)))});}}
    ctx.clearRect(0,0,canvas.width,canvas.height);triangles.sort((a,b)=>b.z-a.z);for(const t of triangles){ctx.fillStyle=`rgb(${t.color.join(',')})`;ctx.beginPath();t.points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*canvas.width,p.y*canvas.height));ctx.closePath();ctx.fill();}
  }
  function render(next=position,nextArmed=armed,nextHover=hover){
    position=next;armed=nextArmed;hover=nextHover;const bounds=canvas.getBoundingClientRect();if(bounds.width<1||bounds.height<1)return;
    if(!initialized)init();const ratio=Math.min(devicePixelRatio||1,2),width=Math.round(bounds.width*ratio),height=Math.round(bounds.height*ratio);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    // A frontal view keeps the forward-moving grip inside narrow portrait bays.
    const aspect=width/height;cameraEye=[eye[0]*clamp((aspect-.65)/.5),eye[1],eye[2]];
    vp=multiply(perspective(aspect),cameraView(cameraEye));const angle=(-12+position*78)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);model=[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,13,1];
    if(gl)drawGL();else if(ctx)drawCanvas();grip();canvas.dataset.position=position.toFixed(4);
  }
  observer=new ResizeObserver(()=>render());observer.observe(canvas);
  canvas.addEventListener('webglcontextlost',event=>event.preventDefault());
  canvas.addEventListener('webglcontextrestored',()=>{initialized=false;render();});
  return {render};
}
