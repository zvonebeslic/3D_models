/* Logo Print Lab TrueColor Vector: every visible 8-bit RGBA sample preserved.
   Real SVG paths, never embedded <image>. Optional precision silhouette clip.
   Lossless at the sampled pixel-grid level, not a recovery of unknown original curves. */
(function(root){
"use strict";
function positiveInt(v,fallback){var n=Number(v);return Number.isFinite(n)&&n>=1?Math.floor(n):fallback;}
function rgbaKey(p,i){
  return ((p[i]*16777216)+(p[i+1]*65536)+(p[i+2]*256)+p[i+3])>>>0;
}
function hex6(n){return "#"+((n>>>8)&0xffffff).toString(16).padStart(6,"0");}
function opacity(n){return String(Number((n/255).toFixed(8)));}
function microClip(coverage,w,h,opts){
  var engine=root.TraceCore&&root.TraceCore._test;
  if(!engine||!engine.traceIso)throw Error("Za mikro konture nedostaje TraceCore modul.");
  var zoom=Number(opts.microScale)||2;
  zoom=Math.max(1,Math.min(3,Math.round(zoom)));
  var loops,stats;
  if(root.VectorCleanup&&root.VectorCleanup.traceComponents){
    var actualMask=new Uint8Array(w*h);
    for(var i=0;i<actualMask.length;i++)actualMask[i]=coverage[i]?1:0;
    var result=root.VectorCleanup.traceComponents(actualMask,coverage,w,h,{
      zoom:zoom,maxLocalPixels:2500000,minArea:0,edgeSmoothness:0
    });
    loops=result.loops;stats=result.stats;
  }else{
    loops=engine.traceIso(coverage,w,h,128);
    stats={refined:0,fallback:0,components:0};
  }
  var commands=[],points=0;
  var tolerance=Number.isFinite(Number(opts.curveTolerance))?
    Math.max(.18,Math.min(.45,Number(opts.curveTolerance))):.18;
  for(var loop of loops){
    if(loop.length<3)continue;
    var d=root.TraceFit&&root.TraceFit.pathD?
      root.TraceFit.pathD(loop,true,tolerance):
      "M"+loop.map(p=>Number(p.x.toFixed(6))+" "+Number(p.y.toFixed(6))).join(" L")+" Z";
    if(d){commands.push(d);points+=loop.length;}
  }
  return{d:commands.join(" "),points:points,paths:commands.length,stats:stats};
}
function TrueColorVector(mask,image,w,h,opts){
  opts=opts||{};
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1)
    throw Error("Neispravne dimenzije izvornog logotipa.");
  var n=w*h,p=image&&image.data;
  if(!p||p.length!==4*n||!mask||mask.length!==n)
    throw Error("Nedostaju RGBA podaci originala ili maska.");
  // Avoid silently downscaling or altering source data, even for huge JPGs.
  var maxPixels=positiveInt(opts.maxPixels,10000000);
  if(n>maxPixels)throw Error("TRUECOLOR zahtijeva izvorne piksele, a datoteka prelazi "+
    maxPixels.toLocaleString("hr-HR")+" piksela. Učitaj izvorni logo manje rezolucije.");
  var maxShapes=positiveInt(opts.maxShapes,1100000);
  var maxChars=positiveInt(opts.maxChars,75000000);
  var mode=opts.mode==="micro"?"micro":"exact";
  // Merge consecutive same-RGBA pixels in a scanline and identical runs
  // through adjacent rows, WITHOUT merging different shades or alpha values.
  var active=new Map(),groups=new Map(),shapes=0,sourcePixels=0,characterCount=0,hasAlpha=false;
  function flush(rect){
    shapes++;
    if(shapes>maxShapes)throw Error("SVG bi zahtijevao više od "+
      maxShapes.toLocaleString("hr-HR")+
      " vektorskih oblika. Nijanse nisu spojene ni izbrisane. Probaj manji original.");
    var group=groups.get(rect.keyColor);
    if(!group){group=[];groups.set(rect.keyColor,group);characterCount+=85;}
    // Path contains one closed native-pixel rectangle per maximal run;
    // all coordinates are integers, so every displayed pixel is accounted for.
    var command="M"+rect.x+" "+rect.y+"h"+rect.width+
      "v"+rect.height+"h-"+rect.width+"z";
    group.push(command);characterCount+=command.length;
    if(characterCount>maxChars)
      throw Error("Rezultat bi prekoračio dopuštenu SVG memoriju. "+
        "Nijanse nisu ograničene, ali izvor je prevelik za obradu na mobitelu.");
  }
  for(var y=0;y<h;y++){
    var next=new Map(),x=0;
    while(x<w){
      var at=y*w+x,index=at*4;
      if(!mask[at]||p[index+3]===0){x++;continue;}
      var key=rgbaKey(p,index),start=x;
      if(p[index+3]!==255)hasAlpha=true;
      x++;sourcePixels++;
      while(x<w){
        var j=y*w+x,k=j*4;
        if(!mask[j]||p[k+3]===0||rgbaKey(p,k)!==key)break;
        x++;sourcePixels++;
      }
      var width=x-start,identity=start+":"+width+":"+key;
      var preceding=active.get(identity);
      if(preceding){
        preceding.height++;
        next.set(identity,preceding);
        active.delete(identity);
      }else next.set(identity,{x:start,y:y,width:width,height:1,keyColor:key});
    }
    for(var unmerged of active.values())flush(unmerged);
    active=next;
  }
  for(var last of active.values())flush(last);
  if(!sourcePixels)throw Error("Izvorna slika nema vidljivih piksela.");
  // Exact RGBA colors and alpha values; grouping is only by exact 32-bit code.
  var paths=[],colors=0;
  for(var entry of groups){
    var key=entry[0],runs=entry[1],a=key&255;
    var attr=' fill="'+hex6(key)+'"';
    if(a!==255)attr+=' fill-opacity="'+opacity(a)+'"';
    var limit=250000,chunk="",maxPath=0;
    for(var command of runs){
      if(chunk.length+command.length>limit&&chunk){
        paths.push('<path'+attr+' d="'+chunk+'"/>');chunk="";
      }
      chunk+=command;maxPath++;
    }
    if(chunk)paths.push('<path'+attr+' d="'+chunk+'"/>');
    colors++;
  }
  var clip=null,defs="",open="",close="",type="exact",microPoints=0;
  if(mode==="micro"){
    // Geometric boundary is a separate vector clip, preserving true RGB/alpha
    // per pixel inside. It changes outer edge geometry and is NOT lossless.
    var coverage=new Uint8Array(n);
    for(var i=0;i<n;i++)coverage[i]=mask[i]?p[i*4+3]:0;
    clip=microClip(coverage,w,h,opts);
    if(clip.d){
      defs='<defs><clipPath id="tc-micro-clip" clipPathUnits="userSpaceOnUse">'+
        '<path d="'+clip.d+'" clip-rule="evenodd"/></clipPath></defs>';
      open='<g clip-path="url(#tc-micro-clip)">';close='</g>';
      microPoints=clip.points;type="micro";
    }
  }
  var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+
    '" height="'+h+'" viewBox="0 0 '+w+' '+h+
    '" shape-rendering="crispEdges">'+defs+open+paths.join("")+close+'</svg>';
  return{svg,mode:type,colors,uniqueRGBA:colors,paths:paths.length+(clip?clip.paths:0),
    shapes,segments:shapes*4,points:microPoints,sourcePixels,
    hasAlpha:hasAlpha,
    microPaths:clip?clip.paths:0,bytes:svg.length,
    exactPixels:type==="exact",edgeRefined:type==="micro"};
}
root.TrueColorVector=TrueColorVector;
root.TrueColorVectorTest={rgbaKey:rgbaKey,hex6:hex6,opacity:opacity};
})(typeof window!=="undefined"?window:globalThis);
