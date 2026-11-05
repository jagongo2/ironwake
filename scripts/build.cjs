const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const result = esbuild.buildSync({ entryPoints: ['src/pixi-renderer.js'], bundle: true,
  format: 'esm', target: 'es2022', minify: true, sourcemap: false,
  outfile: 'assets/renderer.js', loader: { '.glsl': 'text' }, legalComments: 'eof', metafile: true });
// Preserve notices for the packages actually included in the client bundle.
const packages=new Map();
for(const input of Object.keys(result.metafile.inputs)) {
  if(!input.includes('node_modules/'))continue;
  let directory=path.dirname(path.resolve(input));
  while(directory!==path.dirname(directory)) {
    const manifest=path.join(directory,'package.json');
    if(fs.existsSync(manifest)) {
      const pkg=JSON.parse(fs.readFileSync(manifest,'utf8'));
      if(pkg.name&&!packages.has(pkg.name)) {
        const license=fs.readdirSync(directory).find(name=>/^licen[sc]e(?:\..*)?$/i.test(name));
        packages.set(pkg.name,`${pkg.name} ${pkg.version}\n${license?fs.readFileSync(path.join(directory,license),'utf8'):pkg.license||'See package source for license.'}`);
      }
      if(pkg.name)break;
    }
    directory=path.dirname(directory);
  }
}
fs.writeFileSync('assets/THIRD-PARTY-LICENSES.txt',Array.from(packages.values()).join('\n\n--------------------\n\n'));
