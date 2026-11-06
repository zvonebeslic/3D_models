/* Auto-tune Full Vector settings by measuring rasterized SVG against the same
   foreground source. Uses preview-scale trials, then caller renders full scale.
   This selects a best candidate among trials, not a global mathematical optimum. */
(function(root){
"use strict";
function clamp(x,a,b){return Math.min(b,Math.max(a,x));}
function candidateSettings(base){
 const den=clamp(Math.round(Number(base.denoise)||0),0,100),
       smooth=clamp(Math.round(Number(base.edgeSmoothness)||0),0,100),
       island=clamp(Math.round(Number(base.minIsland)||0),0,80),
       hole=clamp(Math.round(Number(base.minHole)||0),0,80),
       colors=clamp(Math.round(Number(base.maxColors)||12),1,16);
 const baseSet={...base,mode:"curves",denoise:den,edgeSmoothness:smooth,minIsland:island,
   minHole:hole,maxColors:colors,segmentScale:2};
 const cases=[
   {name:"TRUECOLOR 1:1 · sve RGBA nijanse",settings:{...baseSet,mode:"exact"}},
   {name:"TRUECOLOR MICRO · precizni rubovi",settings:{...baseSet,mode:"micro"}},
   {name:"Klasične trenutačne postavke",settings:baseSet},
   {name:"Maksimalni detalji",settings:{...baseSet,ultraCleanup:true,
     denoise:0,edgeSmoothness:0,minIsland:0,minHole:0,maxColors:16}},
   {name:"Nježne krivulje",settings:{...baseSet,ultraCleanup:true,
     denoise:25,edgeSmoothness:10,minIsland:1,minHole:1,maxColors:16}},
   {name:"Sitni detalji",settings:{...baseSet,ultraCleanup:true,
     denoise:40,edgeSmoothness:25,minIsland:2,minHole:3,maxColors:16}},
   {name:"Uravnotežena preciznost",settings:{...baseSet,ultraCleanup:true,
     denoise:55,edgeSmoothness:40,minIsland:4,minHole:8,maxColors:Math.max(colors,14)}},
   {name:"Čisti rubovi",settings:{...baseSet,ultraCleanup:true,
     denoise:70,edgeSmoothness:65,minIsland:6,minHole:14,maxColors:colors}},
   {name:"Bez mikročišćenja",settings:{...baseSet,ultraCleanup:false,
     denoise:35,edgeSmoothness:0,minIsland:0,minHole:0,maxColors:16}}
 ];
 // Do not score the same parameter set twice.
 const keys=new Set();
 return cases.filter(c=>{
   const key=JSON.stringify([c.settings.mode,c.settings.ultraCleanup,c.settings.denoise,
     c.settings.edgeSmoothness,c.settings.minIsland,c.settings.minHole,c.settings.maxColors]);
   if(keys.has(key))return false;keys.add(key);return true;
 });
}
function maskedDownsample(source,w,h,maxPixels){
  const D=root.VectorDiff;
  if(!D)throw Error("Modul za usporedbu nije učitan.");
  const dims=D.chooseDimensions(w,h,maxPixels);
  const image=D._test.resizeReference(source,w,h,dims.width,dims.height);
  const mask=new Uint8Array(dims.width*dims.height);
  for(let i=0;i<mask.length;i++)mask[i]=image.data[i*4+3]>0?1:0;
  return{img:image,mask,width:dims.width,height:dims.height};
}
async function run(source,w,h,base,opts){
 opts=opts||{};
 const compare=root.VectorDiff,curves=root.FullVector,truecolor=root.TrueColorVector;
 if(!compare||typeof curves!=="function"||typeof truecolor!=="function")
   throw Error("Moduli za automatsko podešavanje nisu učitani.");
 if(!source||!source.data||source.data.length!==w*h*4)
   throw Error("Izvorna slika i dimenzije nisu usklađene.");
 const preview=maskedDownsample(source,w,h,opts.maxPixels||80000);
 const configurations=candidateSettings(base);
 const results=[];
 for(let j=0;j<configurations.length;j++){
   if(opts.signal&&opts.signal.aborted)throw Error("Automatsko podešavanje je prekinuto.");
   const current=configurations[j];
   if(opts.onProgress)opts.onProgress(j,configurations.length,current.name);
   // Permit progress to paint before each CPU-heavy synchronous vectorization.
   await new Promise(resolve=>setTimeout(resolve,12));
   try{
     const isTrueColor=current.settings.mode!=="curves";
     const b=isTrueColor?
       truecolor(preview.mask,preview.img,preview.width,preview.height,{
         mode:current.settings.mode,microScale:2,
         maxShapes:200000,maxChars:20000000
       }):
       curves(preview.mask,preview.img,preview.width,preview.height,current.settings);
     const result=await compare._test.rasterizeSVG(b.svg,preview.width,preview.height);
     const stats=compare.compareData(preview.img,result.imageData,preview.width,preview.height,{
       threshold:opts.threshold||12,edgeTolerance:opts.edgeTolerance==null?1:opts.edgeTolerance
     });
     results.push({name:current.name,settings:current.settings,
       score:stats.score,colorError:stats.averageError,
       differentPercent:stats.differentPercent,
       edgeMismatchPercent:stats.edgeMismatchPercent,
       segments:b.segments,colors:b.colors,valid:true});
   }catch(error){
     results.push({name:current.name,settings:current.settings,
       valid:false,score:Infinity,error:String(error.message||error)});
   }
 }
 const sorted=results.filter(x=>x.valid).sort((a,b)=>a.score-b.score);
 if(!sorted.length)throw Error("Nijedna probna vektorizacija nije uspjela.");
 if(opts.onProgress)opts.onProgress(configurations.length,configurations.length,"Gotovo");
 return{best:sorted[0],attempts:results,ranking:sorted,
   sampledWidth:preview.width,sampledHeight:preview.height,
   sourceWidth:w,sourceHeight:h,previewOnly:true};
}
root.VectorAutotune={run,candidateSettings,_test:{maskedDownsample}};
})(typeof window!=="undefined"?window:globalThis);
