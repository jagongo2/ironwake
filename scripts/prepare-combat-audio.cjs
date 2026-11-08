// Rebuild the licensed recording edits. Requires ffmpeg on PATH; no runtime DSP.
// node scripts/prepare-combat-audio.cjs --download
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cache=path.join(root,'artifacts/audio-sources');
const out=path.join(root,'assets/audio/combat');
const sources={
 rifle:{author:'michorvath',title:'AR15 rifle shot',page:'https://freesound.org/people/michorvath/sounds/427596/',preview:'https://cdn.freesound.org/previews/427/427596_3094998-hq.mp3'},
 cannon:{author:'qubodup',title:'Cannon Shot',page:'https://freesound.org/people/qubodup/sounds/187767/',preview:'https://cdn.freesound.org/previews/187/187767_71257-hq.mp3'},
 explosion:{author:'sidohzen',title:'Explosion with debris - authentic. 4kg TNT',page:'https://freesound.org/people/sidohzen/sounds/165808/',preview:'https://cdn.freesound.org/previews/165/165808_2872744-hq.mp3'}
};
// Windows are deliberately bounded to one report: the cannon file has two shots,
// and the demolition recording has people/background noise before the explosion.
const edits=[
 {file:'cannon-light.ogg',source:'rifle',start:.070,end:.430,pitch:.62,high:45,low:2200,bass:2,fade:.22},
 {file:'cannon-heavy.ogg',source:'cannon',start:.150,end:2.500,pitch:.70,high:30,low:3000,bass:3,fade:.95},
 {file:'blast-impact.ogg',source:'explosion',start:2.165,end:3.120,pitch:.90,high:40,low:3200,bass:1.5,fade:.38},
 {file:'blast-wreck.ogg',source:'explosion',start:2.165,end:6.165,pitch:.78,high:28,low:3000,bass:2,fade:1.5}
];
(async()=>{
 fs.mkdirSync(cache,{recursive:true});fs.mkdirSync(out,{recursive:true});
 for(const [key,source] of Object.entries(sources)){
  const file=path.join(cache,key+'.mp3');
  if(process.argv.includes('--download')){
   const r=await fetch(source.preview);if(!r.ok)throw Error('Preview HTTP '+r.status);
   fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));
  }
  if(!fs.existsSync(file))throw Error('Missing '+file+'; use --download to fetch the public CC0 preview.');
  source.sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 }
 for(const e of edits){
  const duration=(e.end-e.start)/e.pitch;
  const filter=`atrim=start=${e.start}:end=${e.end},asetpts=PTS-STARTPTS,aresample=32000,asetrate=${32000*e.pitch},aresample=32000,highpass=f=${e.high},lowpass=f=${e.low},equalizer=f=90:t=q:w=0.8:g=${e.bass},equalizer=f=3500:t=q:w=0.7:g=-9,afade=t=in:d=0.001,afade=t=out:st=${duration-e.fade}:d=${e.fade}`;
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',path.join(cache,e.source+'.mp3'),'-af',filter,'-ac','1','-ar','32000','-c:a','libvorbis','-q:a','4',path.join(out,e.file)]);
  console.log(e.file,fs.statSync(path.join(out,e.file)).size+' bytes');
 }
 fs.writeFileSync(path.join(out,'sources.json'),JSON.stringify({license:'CC0-1.0',licenseURL:'https://creativecommons.org/publicdomain/zero/1.0/',sources,
  processing:{bassHz:90,bassQ:.8,presenceHz:3500,presenceQ:.7,presenceDb:-9,mono:true,sampleRate:32000,codec:'libvorbis',quality:4},edits},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
