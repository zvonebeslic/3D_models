/* Logo Print Lab Full Vector v5.
   Silhouette FIRST, meaningful interior color regions SECOND.
   Pixel noise must never become an independent "color" just because its RGB differs.
   Browser-only. True SVG paths, no <image> or embedded raster. */
(function(root){
"use strict";
function clamp(n,a,b){return Math.min(b,Math.max(a,n));}
function rgbDist2(a,b){var r=a[0]-b[0],g=a[1]-b[1],bl=a[2]-b[2];return r*r+g*g+bl*bl;}
function hex(c){return "#"+c.map(function(n){return clamp(Math.round(n),0,255).toString(16).padStart(2,"0");}).join("");}
function area(p){var a=0;for(var i=0,j=p.length-1;i<p.length;j=i++)a+=p[j].x*p[i].y-p[i].x*p[j].y;return a/2;}
function paletteFor(mask,pixels,w,h,alpha,maxColors,similarity){
  var n=w*h,step=Math.max(1,Math.floor(Math.sqrt(n/28000)));
  var bins=new Map(),samples=[],total=0;
  for(var y=0;y<h;y+=step)for(var x=0;x<w;x+=step){
    var at=y*w+x,idx=at*4;
    if(!mask[at]||(alpha&&pixels[idx+3]<210))continue;
    var rgb=[pixels[idx],pixels[idx+1],pixels[idx+2]];
    samples.push(rgb);total++;
    var key=((rgb[0]>>3)<<10)|((rgb[1]>>3)<<5)|(rgb[2]>>3);
    var b=bins.get(key);
    if(!b){b={count:0,sum:[0,0,0]};bins.set(key,b);}
    b.count++;
    for(var ch=0;ch<3;ch++)b.sum[ch]+=rgb[ch];
  }
  if(!samples.length){
    for(var j=0;j<n;j+=Math.max(1,Math.ceil(n/18000)))if(mask[j]){
      var i=j*4;
      samples.push([pixels[i],pixels[i+1],pixels[i+2]]);
    }
  }
  if(!samples.length)throw Error("Logo nema nijednog vidljivog piksela.");
  var hist=Array.from(bins.values()).sort(function(a,b){return b.count-a.count;});
  var seeds=[],minSeparation=Math.max(24,similarity*.78);
  // Seed using frequency, not farthest-point outliers (those are usually JPEG noise).
  for(var b of hist){
    if(b.count<Math.max(2,total*.00065))continue;
    var c=b.sum.map(function(v){return v/b.count;});
    if(seeds.every(function(s){return rgbDist2(c,s)>minSeparation*minSeparation;}))
      seeds.push(c);
    if(seeds.length>=maxColors)break;
  }
  if(!seeds.length)seeds.push(samples[0]);
  // Small palette k-means: the number of colors is never artificially fixed at 48.
  for(var pass=0;pass<4;pass++){
    var counts=new Float64Array(seeds.length);
    var sums=Array.from({length:seeds.length},()=>[0,0,0]);
    for(var s of samples){
      var bi=0,bd=Infinity;
      for(var k=0;k<seeds.length;k++){
        var d=rgbDist2(s,seeds[k]);if(d<bd){bd=d;bi=k;}
      }
      counts[bi]++;
      for(var t=0;t<3;t++)sums[bi][t]+=s[t];
    }
    for(var kk=0;kk<seeds.length;kk++)if(counts[kk]){
      seeds[kk]=sums[kk].map(function(v){return v/counts[kk];});
    }
  }
  // Merge near-identical palette centers AND reject micro-clusters.
  var sizes=new Int32Array(seeds.length);
  for(var s of samples){
    var bi=0,bd=Infinity;
    for(var k=0;k<seeds.length;k++){var d=rgbDist2(s,seeds[k]);if(d<bd){bd=d;bi=k;}}
    sizes[bi]++;
  }
  var entries=seeds.map(function(color,i){return{color:color,n:sizes[i]};})
    .sort(function(a,b){return b.n-a.n;});
  var merged=[];
  for(var e of entries){
    if(e.n < Math.max(3,samples.length*.002) && merged.length)continue;
    var nearest=null,best=Infinity;
    for(var m of merged){
      var d=rgbDist2(e.color,m.color);
      if(d<best){best=d;nearest=m;}
    }
    if(nearest&&best<similarity*similarity){
      var t=nearest.n+e.n;
      nearest.color=nearest.color.map(function(v,i){return(v*nearest.n+e.color[i]*e.n)/t;});
      nearest.n=t;
    }else if(merged.length<maxColors)merged.push({color:e.color,n:e.n});
  }
  if(!merged.length)merged.push(entries[0]||{color:samples[0],n:1});
  merged.sort(function(a,b){return b.n-a.n;});
  return merged.map(function(e){return e.color;});
}
function classify(mask,pixels,w,h,colors){
  var n=w*h,K=colors.length,labels=new Uint8Array(n);labels.fill(255);
  for(var i=0;i<n;i++){
    if(!mask[i])continue;
    var p=i*4,bi=0,bd=Infinity;
    for(var j=0;j<K;j++){
      var c=colors[j],dr=pixels[p]-c[0],dg=pixels[p+1]-c[1],db=pixels[p+2]-c[2];
      var d=dr*dr+dg*dg+db*db;
      if(d<bd){bi=j;bd=d;}
    }
    labels[i]=bi;
  }
  return labels;
}
function majorityFilter(labels,w,h,passes){
  var src=labels,near=new Int32Array(8);
  for(var round=0;round<passes;round++){
    var next=src.slice(),changed=0;
    for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){
      var p=y*w+x,current=src[p];if(current===255)continue;
      near[0]=p-w-1;near[1]=p-w;near[2]=p-w+1;near[3]=p-1;near[4]=p+1;near[5]=p+w-1;near[6]=p+w;near[7]=p+w+1;
      var own=0;
      for(var q of near)if(src[q]===current)own++;
      if(own>=3)continue;
      var replacement=255,frequency=0;
      for(var u of near){
        var candidate=src[u];if(candidate===255||candidate===current)continue;
        var freq=0;for(var v of near)if(src[v]===candidate)freq++;
        if(freq>frequency){replacement=candidate;frequency=freq;}
      }
      if(frequency>=5){next[p]=replacement;changed++;}
    }
    src=next;
    if(!changed)break;
  }
  return src;
}
function removeSmallRegions(labels,w,h,minPixels){
  if(minPixels<=1)return{labels:labels,removed:0};
  var n=w*h,visited=new Uint8Array(n),queue=new Int32Array(n),removed=0;
  // Connected regions of a palette color, 4-neighborhood.
  for(var s=0;s<n;s++){
    if(visited[s]||labels[s]===255)continue;
    var head=0,tail=1,label=labels[s];queue[0]=s;visited[s]=1;
    while(head<tail){
      var idx=queue[head++],x=idx%w,y=(idx/w)|0;
      if(x>0&&!visited[idx-1]&&labels[idx-1]===label){visited[idx-1]=1;queue[tail++]=idx-1;}
      if(x<w-1&&!visited[idx+1]&&labels[idx+1]===label){visited[idx+1]=1;queue[tail++]=idx+1;}
      if(y>0&&!visited[idx-w]&&labels[idx-w]===label){visited[idx-w]=1;queue[tail++]=idx-w;}
      if(y<h-1&&!visited[idx+w]&&labels[idx+w]===label){visited[idx+w]=1;queue[tail++]=idx+w;}
    }
    if(tail>=minPixels)continue;
    // Keep tiny separate islands (letter accents or detached shapes).
    // Only merge a tiny color fragment embedded within another foreground color.
    var neighbors=new Map();
    for(var i=0;i<tail;i++){
      var p=queue[i],x=p%w,y=(p/w)|0;
      if(x>0&&labels[p-1]!==label&&labels[p-1]!==255)neighbors.set(labels[p-1],(neighbors.get(labels[p-1])||0)+1);
      if(x<w-1&&labels[p+1]!==label&&labels[p+1]!==255)neighbors.set(labels[p+1],(neighbors.get(labels[p+1])||0)+1);
      if(y>0&&labels[p-w]!==label&&labels[p-w]!==255)neighbors.set(labels[p-w],(neighbors.get(labels[p-w])||0)+1);
      if(y<h-1&&labels[p+w]!==label&&labels[p+w]!==255)neighbors.set(labels[p+w],(neighbors.get(labels[p+w])||0)+1);
    }
    var chosen=255,most=0;
    for(var pair of neighbors)if(pair[1]>most){chosen=pair[0];most=pair[1];}
    if(chosen!==255){
      for(var i=0;i<tail;i++)labels[queue[i]]=chosen;
      removed+=tail;
    }
  }
  return{labels:labels,removed:removed};
}
function toPath(loops,fitTolerance){
  var pieces=[],points=0,segments=0;
  for(var loop of loops){
    if(loop.length<3||Math.abs(area(loop))<.40)continue;
    var d=(root.TraceFit&&root.TraceFit.pathD)?
      root.TraceFit.pathD(loop,true,fitTolerance):
      "M"+loop.map(function(p){return p.x.toFixed(3)+" "+p.y.toFixed(3);}).join(" L")+" Z";
    if(!d)continue;
    pieces.push(d);points+=loop.length;
    segments+=(d.match(/ [LC]/g)||[]).length;
  }
  return{d:pieces.join(" "),paths:pieces.length,points:points,segments:segments};
}
function FullVector(mask,img,W,H,opts){
  opts=opts||{};
  var N=W*H,pix=img.data,geom=root.TraceCore&&root.TraceCore._test,cleanup=root.VectorCleanup;
  if(!geom||!geom.traceIso||!cleanup)throw Error("Moduli za precizne konture nisu učitani.");
  if(!mask||mask.length!==N||!pix||pix.length!==N*4)throw Error("Neispravan ulaz slike.");
  if(N>10500000)throw Error("Slika je prevelika za mobilnu vektorizaciju. Najviše 10,5 megapiksela.");
  var original=new Uint8Array(N),hasAlpha=false,visible=0;
  for(var n=0;n<N;n++){
    var a=pix[n*4+3];
    if(a<250)hasAlpha=true;
    if(mask[n]&&a>=24){original[n]=1;visible++;}
  }
  if(!visible)throw Error("Nisam pronašao vidljiv logo. Provjeri uklanjanje pozadine.");

  // Geometry-first: clean raster topology BEFORE any colors or curve fitting.
  // True large holes, separate accents and thin strokes remain when above thresholds.
  var islandLimit=opts.minIsland==null?6:Math.max(0,Number(opts.minIsland)||0);
  var holeLimit=opts.minHole==null?14:Math.max(0,Number(opts.minHole)||0);
  var cleanupOn=opts.ultraCleanup!==false;
  var cleaned=cleanupOn?cleanup.clean(original,W,H,{
    minIsland:islandLimit,minHole:holeLimit,notchRepair:opts.notchRepair!==false
  }):{mask:original,removedIslands:0,filledHoles:0,
      removedIslandCount:0,filledHoleCount:0,correctedNotches:0};
  var foreground=cleaned.mask,coverage=new Uint8Array(N);
  for(var i=0;i<N;i++){
    if(!foreground[i])continue;
    var a=pix[i*4+3];
    // For filled transparent pinholes, the new shape must be opaque.
    coverage[i]=hasAlpha?(original[i]&&a>=24?a:255):255;
  }

  // Crop every connected shape locally, optionally interpolate its ORIGINAL
  // coverage field at 2x/3x. Do not upscale an already fitted SVG.
  // Large components safely fall back to 1x rather than exhausting RAM.
  var zoom=cleanupOn?Math.round(clamp(Number(opts.segmentScale)||2,1,3)):1;
  var main=cleanup.traceComponents(foreground,coverage,W,H,{
    zoom:zoom,maxLocalPixels:2400000,minArea:.25
  });
  var silhouette=toPath(main.loops,.52);
  if(!silhouette.paths)throw Error("Nije prepoznata silueta. Pokušaj drugačiji izvorni PNG.");

  var strength=clamp(opts.denoise==null?70:Number(opts.denoise),0,100);
  var palette=paletteFor(foreground,pix,W,H,hasAlpha,
    clamp(Number(opts.maxColors)||12,1,16),28+strength*.43);
  var labels=classify(foreground,pix,W,H,palette);
  var passes=strength<10?0:strength<45?1:2;
  if(palette.length>1&&passes)labels=majorityFilter(labels,W,H,passes);
  var minRegion=strength<10?1:Math.max(3,Math.round(Math.min(100,N/90000)*(strength/70)));
  var denoised=palette.length>1?removeSmallRegions(labels,W,H,minRegion):{labels:labels,removed:0};
  labels=denoised.labels;

  // The dominant color fills the single unified silhouette. Other colors
  // are traced as coherent regions and painted above it. No pixel confetti.
  var counts=new Int32Array(palette.length);
  for(var n=0;n<N;n++)if(labels[n]!==255)counts[labels[n]]++;
  var base=0;
  for(var k=1;k<counts.length;k++)if(counts[k]>counts[base])base=k;
  function shapeTag(d,color){
    // Tiny paint-under stroke prevents pinhole seams caused by SVG antialiasing
    // without inserting a raster element or destroying transparent letter holes.
    return '<path d="'+d+'" fill="'+color+'" fill-rule="evenodd" stroke="'+color+
      '" stroke-width="0.10" stroke-linecap="round" stroke-linejoin="round" paint-order="stroke fill"/>';
  }
  var body=[shapeTag(silhouette.d,hex(palette[base]))];
  var totalPaths=silhouette.paths,totalPoints=silhouette.points,
      totalSegments=silhouette.segments,colors=1,
      components=main.stats.components,refined=main.stats.refined,
      fallback=main.stats.fallback,removedColor=denoised.removed;
  var minColorArea=opts.minColorArea==null?Math.max(5,Math.round(strength*.14)):
    Math.max(0,Number(opts.minColorArea)||0);
  for(var k=0;k<palette.length;k++){
    if(k===base||counts[k]<minColorArea)continue;
    var region=new Uint8Array(N);
    for(var i=0;i<N;i++)if(labels[i]===k)region[i]=1;
    if(cleanupOn&&minColorArea>1){
      var regionClean=cleanup.clean(region,W,H,{
        minIsland:minColorArea,minHole:0,notchRepair:false
      });
      region=regionClean.mask;
      removedColor+=regionClean.removedIslands;
    }
    var regionCoverage=new Uint8Array(N);
    for(var i=0;i<N;i++)if(region[i])regionCoverage[i]=255;
    var local=cleanup.traceComponents(region,regionCoverage,W,H,{
      zoom:zoom,maxLocalPixels:1700000,minArea:.25
    });
    var vector=toPath(local.loops,.60);
    if(!vector.paths)continue;
    body.push(shapeTag(vector.d,hex(palette[k])));
    totalPaths+=vector.paths;totalPoints+=vector.points;
    totalSegments+=vector.segments;colors++;
    components+=local.stats.components;
    refined+=local.stats.refined;
    fallback+=local.stats.fallback;
  }
  var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+
    '" viewBox="0 0 '+W+' '+H+'" shape-rendering="geometricPrecision">'+body.join("")+'</svg>';
  return{svg:svg,colors:colors,paths:totalPaths,points:totalPoints,
    segments:totalSegments,noiseRemoved:removedColor+cleaned.removedIslands,
    baseColor:hex(palette[base]),sourceColors:palette.length,hasAlpha:hasAlpha,
    microIslandsRemoved:cleaned.removedIslandCount,
    microHolesFilled:cleaned.filledHoleCount,
    microHolePixels:cleaned.filledHoles,
    microNotchesRepaired:cleaned.correctedNotches,
    components:components,refined:refined,fallback:fallback};
}
root.FullVector=FullVector;
root.FullVectorV5={paletteFor:paletteFor,classify:classify,majorityFilter:majorityFilter,
  removeSmallRegions:removeSmallRegions};
})(typeof window!=="undefined"?window:globalThis);
