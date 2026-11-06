/* Logo Print Lab: vector accuracy / color / edge comparison. All processing local.
   SVG is re-rasterized for measurement; original image bytes are never modified. */
(function(root) {
"use strict";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sign=(x)=>x<0?-1:1;
function assertImage(image,w,h){
  if(!image||!image.data||image.data.length!==w*h*4)
    throw Error("Podaci originala i SVG prikaza nisu jednakih dimenzija.");
}
// Compare premultiplied RGBA, so fully transparent source RGB values do not
// generate fictitious errors. This compares visual appearance on transparency.
function compareData(a,b,w,h,opts) {
  opts=opts||{};
  assertImage(a,w,h);assertImage(b,w,h);
  const N=w*h,A=a.data,B=b.data,threshold=clamp(Number(opts.threshold)||12,0.1,255);
  const edgeTolerance=clamp(Math.round(opts.edgeTolerance==null?1:Number(opts.edgeTolerance)),0,8);
  const heat=new Uint8ClampedArray(N*4);
  const outlineA=new Uint8Array(N),outlineB=new Uint8Array(N);
  let total=0,maximum=0,different=0,significantAlpha=0;
  const alphaA=new Uint8Array(N),alphaB=new Uint8Array(N);
  for(let i=0;i<N;i++){
    const k=i*4,aa=A[k+3]/255,bb=B[k+3]/255;
    // Average magnitude across RGBA, on a consistent 0..255 scale.
    const dr=A[k]*aa-B[k]*bb,dg=A[k+1]*aa-B[k+1]*bb,
          db=A[k+2]*aa-B[k+2]*bb,da=A[k+3]-B[k+3];
    const e=Math.sqrt((dr*dr+dg*dg+db*db+da*da)/4);
    total+=e;if(e>maximum)maximum=e;
    if(e>threshold)different++;
    if(Math.abs(da)>threshold)significantAlpha++;
    alphaA[i]=A[k+3]>=128?1:0;
    alphaB[i]=B[k+3]>=128?1:0;
    if(e>threshold){
      const t=clamp((e-threshold)/(130-threshold||1),0,1);
      heat[k]=255;heat[k+1]=Math.round((1-t)*208);heat[k+2]=0;
      heat[k+3]=Math.round(95+155*t);
    }
  }
  // Edges include silhouette boundaries AND high-contrast color boundaries
  // inside an opaque logo. Alpha-only edges would miss colored lettering.
  const contrastThreshold=Math.max(32,threshold*2.5);
  function edge(binary,dest,rgba){
    function contrast(i,j){
      if(!binary[i]||!binary[j])return false;
      const a=i*4,b=j*4;
      const dr=rgba[a]-rgba[b],dg=rgba[a+1]-rgba[b+1],
            db=rgba[a+2]-rgba[b+2];
      return Math.sqrt((dr*dr+dg*dg+db*db)/3)>contrastThreshold;
    }
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x,m=binary[i];
      if((x>0&&(binary[i-1]!==m||contrast(i,i-1)))||
        (x<w-1&&(binary[i+1]!==m||contrast(i,i+1)))||
        (y>0&&(binary[i-w]!==m||contrast(i,i-w)))||
        (y<h-1&&(binary[i+w]!==m||contrast(i,i+w)))||
        (x===0&&m)||(x===w-1&&m)||(y===0&&m)||(y===h-1&&m))dest[i]=1;
    }
  }
  edge(alphaA,outlineA,A);edge(alphaB,outlineB,B);
  // Manhattan distance to the nearest edge. 2-pass dynamic programming:
  // exact for 4-connected grid and fast enough for large images on mobile.
  function distance(edges) {
    const inf=w+h+12,d=new Uint32Array(N);d.fill(inf);
    for(let i=0;i<N;i++)if(edges[i])d[i]=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;
      if(x&&d[i-1]+1<d[i])d[i]=d[i-1]+1;
      if(y&&d[i-w]+1<d[i])d[i]=d[i-w]+1;
    }
    for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
      const i=y*w+x;
      if(x<w-1&&d[i+1]+1<d[i])d[i]=d[i+1]+1;
      if(y<h-1&&d[i+w]+1<d[i])d[i]=d[i+w]+1;
    }
    return d;
  }
  const distA=distance(outlineA),distB=distance(outlineB);
  let edgeA=0,edgeB=0,missA=0,missB=0,sumEdgeDistance=0,maxEdgeDistance=0;
  const edgeHeat=new Uint8ClampedArray(N*4);
  for(let i=0;i<N;i++){
    const k=i*4;
    if(outlineA[i]){
      edgeA++;
      const d=distB[i];sumEdgeDistance+=Math.min(d,12);
      if(d>maxEdgeDistance)maxEdgeDistance=d;
      if(d>edgeTolerance){
        missA++;edgeHeat[k]=255;edgeHeat[k+1]=58;edgeHeat[k+2]=50;edgeHeat[k+3]=220;
      }
    }
    if(outlineB[i]){
      edgeB++;
      const d=distA[i];sumEdgeDistance+=Math.min(d,12);
      if(d>maxEdgeDistance)maxEdgeDistance=d;
      if(d>edgeTolerance){
        missB++;
        if(!edgeHeat[k+3]){edgeHeat[k]=43;edgeHeat[k+1]=170;edgeHeat[k+2]=255;edgeHeat[k+3]=220;}
      }
    }
  }
  const edgeCount=edgeA+edgeB;
  const edgeMismatchPercent=edgeCount?(missA+missB)/edgeCount*100:0;
  const differentPercent=N?different/N*100:0;
  const averageError=N?total/N:0;
  const meanEdgeDistance=edgeCount?sumEdgeDistance/edgeCount:0;
  // Edge preservation is weighted strongly; both area and boundary matter.
  const score=(averageError/255)*50+differentPercent*.25+
              edgeMismatchPercent*.20+meanEdgeDistance*3;
  return {
    width:w,height:h,threshold,edgeTolerance,
    averageError,maximumError:maximum,differentPixels:different,differentPercent,
    alphaMismatchPixels:significantAlpha,edgeMismatchPercent,meanEdgeDistance,
    maxEdgeDistance,sourceEdgePixels:edgeA,vectorEdgePixels:edgeB,score,
    heatmap:heat,edgeHeatmap:edgeHeat
  };
}
function canvasFor(w,h){
  const c=document.createElement("canvas");c.width=w;c.height=h;return c;
}
function paintData(image,w,h){
  const c=canvasFor(w,h);
  const ctx=c.getContext("2d",{willReadFrequently:true});
  ctx.putImageData(new ImageData(image.data,w,h),0,0);
  return c;
}
function drawArray(bytes,w,h){
  return paintData({data:bytes},w,h);
}
async function rasterizeSVG(svg,w,h){
  if(!svg||typeof svg!=="string")throw Error("SVG je prazan.");
  const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml;charset=utf-8"}));
  try {
    const image=await new Promise((resolve,reject)=>{
      const im=new Image();
      im.onload=()=>resolve(im);
      im.onerror=()=>reject(Error("SVG nije moguće prikazati. Provjeri valjanost SVG-a."));
      im.src=url;
    });
    const canvas=canvasFor(w,h),ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.clearRect(0,0,w,h);ctx.drawImage(image,0,0,w,h);
    return {canvas,imageData:ctx.getImageData(0,0,w,h)};
  } finally {URL.revokeObjectURL(url);}
}
function resizeReference(image,w,h,targetW,targetH){
  assertImage(image,w,h);
  if(w===targetW&&h===targetH)return image;
  const original=paintData(image,w,h),out=canvasFor(targetW,targetH);
  const ctx=out.getContext("2d",{willReadFrequently:true});
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  ctx.drawImage(original,0,0,targetW,targetH);
  return ctx.getImageData(0,0,targetW,targetH);
}
function chooseDimensions(w,h,maxPixels){
  const cap=Math.max(4096,Math.floor(Number(maxPixels)||700000));
  if(w*h<=cap)return{width:w,height:h,scale:1};
  const scale=Math.sqrt(cap/(w*h));
  return{width:Math.max(1,Math.floor(w*scale)),
    height:Math.max(1,Math.floor(h*scale)),scale};
}
async function compare(image,svg,w,h,options){
  options=options||{};
  const dims=chooseDimensions(w,h,options.maxPixels||700000);
  const reference=resizeReference(image,w,h,dims.width,dims.height);
  const vector=await rasterizeSVG(svg,dims.width,dims.height);
  const metrics=compareData(reference,vector.imageData,dims.width,dims.height,options);
  return {metrics,
    sourceCanvas:paintData(reference,dims.width,dims.height),
    renderedCanvas:vector.canvas,
    heatmapCanvas:drawArray(metrics.heatmap,dims.width,dims.height),
    edgeCanvas:drawArray(metrics.edgeHeatmap,dims.width,dims.height),
    sourceWidth:w,sourceHeight:h,comparisonWidth:dims.width,
    comparisonHeight:dims.height,scaled:dims.scale!==1};
}
root.VectorDiff={compare,compareData,chooseDimensions,
  _test:{resizeReference,paintData,rasterizeSVG}};
})(typeof window!=="undefined"?window:globalThis);
