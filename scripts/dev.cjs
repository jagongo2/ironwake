const esbuild=require('esbuild');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
  const build=await esbuild.context({entryPoints:['src/pixi-renderer.js'],bundle:true,format:'esm',target:'es2022',
    outfile:'assets/renderer.js',loader:{'.glsl':'text'},legalComments:'eof'});
  await build.rebuild();await build.watch();
  http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname;
    if(name!=='/'&&name!=='/index.html'&&!/^\/(src|assets)\//.test(name)){res.writeHead(404).end();return;}
    const file=path.resolve(root,'.'+(name==='/'?'/index.html':decodeURIComponent(name)));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
  }).listen(4173,'127.0.0.1',()=>console.log('IRONWAKE: http://localhost:4173 (save, then refresh)'));
})();
