// Browser-safe measurements of rendered PCM. No connection to sound presets.
module.exports=function measureAudio(audio){
 const rate=audio.sampleRate,n=2048,re=new Float64Array(n),im=new Float64Array(n),window=new Float64Array(n);
 for(let i=0;i<n;i++)window[i]=.5-.5*Math.cos(2*Math.PI*i/(n-1));
 let peak=0,energy=0,tail=0,attack=0,left=0,right=0,low=0,harsh=0,spectral=0,weighted=0;
 for(let c=0;c<audio.numberOfChannels;c++){
  const a=audio.getChannelData(c);
  for(let i=0;i<a.length;i++){
   const v=a[i];if(!Number.isFinite(v))throw Error('nonfinite PCM');
   const e=v*v;peak=Math.max(peak,Math.abs(v));energy+=e;if(i>rate*.4)tail+=e;if(i<rate*.08)attack+=e;if(c===0)left+=e;else right+=e;
  }
  for(let offset=0;offset+n<=a.length;offset+=n/2){
   for(let i=0;i<n;i++){re[i]=a[offset+i]*window[i];im[i]=0;}
   for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];}}
   for(let size=2;size<=n;size<<=1){const angle=-2*Math.PI/size,cr=Math.cos(angle),ci=Math.sin(angle);
    for(let start=0;start<n;start+=size){let wr=1,wi=0;for(let j=0;j<size/2;j++){
     const p=start+j,q=p+size/2,tr=wr*re[q]-wi*im[q],ti=wr*im[q]+wi*re[q];
     re[q]=re[p]-tr;im[q]=im[p]-ti;re[p]+=tr;im[p]+=ti;const next=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=next;
    }}
   }
   for(let i=1;i<n/2;i++){const hz=i*rate/n,e=re[i]*re[i]+im[i]*im[i];if(hz<40||hz>10000)continue;
    spectral+=e;weighted+=hz*e;if(hz<250)low+=e;if(hz>=2500&&hz<6000)harsh+=e;
   }
  }
 }
 return {peak,energy,tail,attack,left,right,rms:Math.sqrt(energy/(audio.length*audio.numberOfChannels)),lowFraction:low/(spectral||1),harshFraction:harsh/(spectral||1),centroidHz:weighted/(spectral||1)};
};
