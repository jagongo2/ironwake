import { Application, CanvasSource, Color, Container, Matrix, Sprite, Text, Texture, TextureStyle } from 'pixi.js';

const identity = () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/**
 * Thin compatibility boundary for the existing drawing functions. The visible
 * framebuffer is WebGL: rectangles, lines, text, vessels and effects are pooled
 * Pixi objects. Canvas 2D remains only for texture generation and fluid buffers.
 */
class FleetRenderer {
  constructor(app) {
    this.app = app;
    this.scene = new Container({ eventMode: 'none' });
    this.app.stage.addChild(this.scene);
    this.nodes = []; this.free = { sprite: [], text: [] }; this.cursor = 0;
    this.sources = new WeakMap(); this.textures = new Set();
    this.matrix = identity(); this.stack = []; this.colors = new Map();
    this.affine = new Matrix();
    this.globalAlpha = 1; this.globalCompositeOperation = 'source-over';
    this.fillStyle = '#fff'; this.strokeStyle = '#fff'; this.lineWidth = 1;
    this.font = '10px monospace'; this.textAlign = 'left'; this.imageSmoothingEnabled = false;
    this.isGPU = true; this.frame = 0;
    this.circle = canvas(128, 128);
    const circle = this.circle.getContext('2d'); circle.fillStyle = '#fff';
    circle.beginPath(); circle.arc(64, 64, 64, 0, Math.PI * 2); circle.fill();
  }
  resize(w,h){if(this.renderWidth===w&&this.renderHeight===h)return;this.renderWidth=w;this.renderHeight=h;this.app.renderer.resize(w,h);}
  begin(){this.cursor=0;this.matrix=identity();this.stack.length=0;this.globalAlpha=1;this.globalCompositeOperation='source-over';}
  end(){for(let i=this.cursor;i<this.nodes.length;i++)this.nodes[i].visible=false;this.app.render();this.frame++;
    if(this.frame%240===0)for(const record of this.textures)if(this.frame-record.lastUsed>240){this.sources.delete(record.canvas);record.texture.destroy(true);this.textures.delete(record);}}
  diagnostics(){return {type:'PixiJS WebGL',renderWidth:this.renderWidth,renderHeight:this.renderHeight,pooledObjects:this.nodes.length,textures:this.textures.size,postProcessing:false};}
  drawDitherBands(width,horizon,palette){
    if(!this.dither||this.dither.width!==width){const top=canvas(width,20),bottom=canvas(width,20),a=top.getContext('2d'),b=bottom.getContext('2d');
      for(let y=0;y<20;y++)for(let x=(y%2)*3;x<width;x+=6){a.fillStyle=palette[y<10?3:4];a.fillRect(x,y,1,1);b.fillStyle=palette[4];b.fillRect(x,y,1,1);}this.dither={width,top,bottom};}
    this.drawImage(this.dither.top,0,Math.round(horizon-105));this.drawImage(this.dither.bottom,0,Math.round(horizon));
  }
  color(value) {
    if (!this.colors.has(value)) this.colors.set(value, typeof value === 'number' ? value : new Color(value).toNumber());
    return this.colors.get(value);
  }
  node(kind = 'sprite') {
    const i = this.cursor++; let node = this.nodes[i];
    if (node?._kind !== kind) {
      if (node) { this.scene.removeChild(node); node.visible = false; this.free[node._kind].push(node); }
      node = this.free[kind].pop() || (kind === 'text' ? new Text({ text: '', resolution: 2 }) : new Sprite(Texture.WHITE));
      node._kind = kind; this.nodes[i] = node; this.scene.addChildAt(node, i);
    }
    node.visible = true; node.alpha = this.globalAlpha;
    node.blendMode = this.globalCompositeOperation === 'screen' ? 'screen' : this.globalCompositeOperation === 'lighter' ? 'add' : 'normal';
    return node;
  }
  place(node, x, y, sx = 1, sy = 1, rotation = 0) {
    const m = this.matrix;
    // Most particles and background rectangles have no rotation. Avoid matrix
    // decomposition and trigonometry for each of their individual pixel quads.
    if(rotation===0&&m.b===0&&m.c===0){
      node.position.set(m.a*x+m.tx,m.d*y+m.ty);node.scale.set(m.a*sx,m.d*sy);
      node.rotation=0;node.skew.set(0,0);return;
    }
    const c = Math.cos(rotation), s = Math.sin(rotation);
    this.affine.set((m.a*c+m.c*s)*sx, (m.b*c+m.d*s)*sx,
      (-m.a*s+m.c*c)*sy, (-m.b*s+m.d*c)*sy, m.a*x+m.c*y+m.tx, m.b*x+m.d*y+m.ty);
    node.setFromMatrix(this.affine);
  }
  texture(source) {
    let record = this.sources.get(source);
    if (!record) {
      const texture = new Texture({ dynamic: true, source: new CanvasSource({ resource: source, scaleMode: 'nearest', autoGenerateMipmaps: false }) });
      record = { canvas: source, texture, revision: source._revision, lastUsed: this.frame };
      this.sources.set(source, record); this.textures.add(record);
    } else if (record.revision !== source._revision) {
      record.texture.source.resize(source.width, source.height); record.texture.source.update(); record.revision = source._revision;
    }
    record.lastUsed = this.frame;
    record.texture.source.scaleMode = this.imageSmoothingEnabled ? 'linear' : 'nearest';
    return record.texture;
  }
  fillRect(x, y, w, h) {
    if (w <= 0 || h <= 0) return;
    const node = this.node(); node.texture = Texture.WHITE; node.tint = this.color(this.fillStyle);
    this.place(node, x, y, w, h);
  }
  drawImage(source, x, y, w = source.width, h = source.height) {
    const node = this.node(); node.texture = this.texture(source); node.tint = 0xffffff;
    this.place(node, x, y, w / source.width, h / source.height);
  }
  fillText(text, x, y) {
    const node = this.node('text');
    const [, size = '10', family = 'monospace'] = this.font.match(/([\d.]+)px\s+(.+)/) || [];
    if (node._font !== this.font) { node.style.fontSize = Number(size); node.style.fontFamily = family; node._font = this.font; }
    node.style.fill = this.fillStyle; node.text = String(text);
    node.anchor.set(this.textAlign === 'center' ? .5 : this.textAlign === 'right' ? 1 : 0, .83);
    this.place(node, x, y);
  }
  save() { this.stack.push({ ...this.matrix, alpha: this.globalAlpha, blend: this.globalCompositeOperation, smooth: this.imageSmoothingEnabled }); }
  restore() { const m = this.stack.pop(); if (!m) return; this.matrix = m; this.globalAlpha = m.alpha; this.globalCompositeOperation = m.blend; this.imageSmoothingEnabled = m.smooth; }
  translate(x, y) { const m = this.matrix; m.tx += m.a * x + m.c * y; m.ty += m.b * x + m.d * y; }
  rotate(angle) { const m = this.matrix, c = Math.cos(angle), s = Math.sin(angle), a = m.a, b = m.b; m.a = a*c+m.c*s; m.b = b*c+m.d*s; m.c = m.c*c-a*s; m.d = m.d*c-b*s; }
  beginPath() { this.path = []; this.circlePath = null; }
  moveTo(x, y) { this.path.push([x, y]); }
  lineTo(x, y) { this.path.push([x, y]); }
  arc(x, y, r) { this.circlePath = { x, y, r }; }
  fill() {
    if (!this.circlePath) return;
    const { x, y, r } = this.circlePath, node = this.node(); node.texture = this.texture(this.circle); node.tint = this.color(this.fillStyle);
    this.place(node, x-r, y-r, r/64, r/64);
  }
  stroke() {
    const old = this.fillStyle; this.fillStyle = this.strokeStyle;
    for (let i = 1; i < this.path.length; i++) {
      const [x, y] = this.path[i-1], [xx, yy] = this.path[i], length = Math.hypot(xx-x, yy-y);
      const node = this.node(); node.texture = Texture.WHITE; node.tint = this.color(this.strokeStyle);
      const angle=Math.atan2(yy-y,xx-x);this.place(node,x+Math.sin(angle)*this.lineWidth/2,y-Math.cos(angle)*this.lineWidth/2,length,this.lineWidth,angle);
    }
    this.fillStyle = old;
  }
}
export async function createRenderer(surface){
 TextureStyle.defaultOptions.scaleMode='nearest';const app=new Application();
 await app.init({canvas:surface,preference:'webgl',preferWebGLVersion:2,width:640,height:360,resolution:1,antialias:false,autoStart:false,background:'#26352b',powerPreference:'high-performance'});
 const renderer=new FleetRenderer(app);renderer.resize(640,360);return renderer;
}
