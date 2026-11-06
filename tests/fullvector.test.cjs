"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
require("../trace-core.js");
require("../trace-fit.js");
require("../fullvector.js");
const FullVector=globalThis.FullVector;
function make(w,h,fn){
  const mask=new Uint8Array(w*h),data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,color=fn(x,y);
    data.set(color,i*4);
    if(color[3]>=24)mask[i]=1;
  }
  return{mask,img:{data},w,h};
}
function vector(input,opts={}){return FullVector(input.mask,input.img,input.w,input.h,{maxColors:12,denoise:70,...opts});}
const clear=[0,0,0,0],black=[4,5,6,255];
test("flat black shape is one color and one vector contour",()=>{
  const img=make(120,90,(x,y)=>x>=10&&x<110&&y>=10&&y<80?black:clear);
  const result=vector(img);
  assert.equal(result.colors,1);
  assert.equal(result.paths,1);
  assert.equal((result.svg.match(/<path /g)||[]).length,1);
  assert.ok(result.segments>=4);
  assert.ok(result.segments<30,"rectangle should use very few genuine SVG segments");
});
test("subtle near-black noise does not generate thousands of extra paths",()=>{
  const img=make(320,240,(x,y)=>{
    if(x<20||x>300||y<20||y>220)return clear;
    const variant=(x*173+y*509+(x*y)%1073)%100;
    return variant<8?[15+x%17,16+y%19,18+(x*y)%13,255]:black;
  });
  const result=vector(img);
  assert.equal(result.colors,1);
  assert.equal(result.paths,1);
  assert.ok(result.segments<60,"tiny shade noise must not create many final SVG segments");
});
test("isolated bright JPG-style noise is not turned into white confetti",()=>{
  const img=make(320,240,(x,y)=>{
    if(x<20||x>300||y<20||y>220)return clear;
    const variant=(x*1619+y*731+Math.floor(x*y/11))%101;
    return variant<3?[255,248,249,255]:black;
  });
  const result=vector(img);
  assert.equal(result.paths,1);
  assert.equal(result.colors,1);
  assert.doesNotMatch(result.svg,/#ff/);
});
test("three actual flat colors are preserved as three SVG regions",()=>{
  const img=make(240,240,(x,y)=>{
    if(Math.hypot(x-120,y-120)>90)return clear;
    return x<90?[220,20,25,255]:x<165?[30,55,225,255]:[35,170,60,255];
  });
  const result=vector(img);
  assert.equal(result.colors,3);
  assert.ok(result.paths<=6);
  assert.match(result.svg,/fill-rule="evenodd"/);
});
test("donut-shaped logo retains genuine transparent interior",()=>{
  const img=make(140,140,(x,y)=>{
    const r=Math.hypot(x-70,y-70);
    return r>20&&r<55?black:clear;
  });
  const result=vector(img);
  assert.equal(result.paths,2);
  assert.equal(result.colors,1);
  assert.match(result.svg,/fill-rule="evenodd"/);
});
test("foreground touching an image edge is not clipped by the path engine",()=>{
  const img=make(90,90,(x,y)=>x<40&&y<60?black:clear);
  assert.equal(vector(img).paths,1);
});
test("SVG output consists of real vector paths, never embedded raster",()=>{
  const img=make(65,65,(x,y)=>x>=7&&y>=7&&x<55&&y<55?black:clear);
  const result=vector(img);
  assert.match(result.svg,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.doesNotMatch(result.svg,/<image\b|data:image|<foreignObject/);
});
test("palette/noise controls are wired to the home-page Full Vector action",()=>{
  const fs=require("node:fs"),path=require("node:path");
  const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
  const controller=fs.readFileSync(path.join(__dirname,"../vector.js"),"utf8");
  assert.match(html,/id="vectorColors"/);
  assert.match(html,/id="noiseReduction"/);
  assert.match(html,/fullvector\.js\?v=vector11/);
  assert.match(controller,/window\.FullVector\(mask,imgData,W,H,\{/);
  assert.match(controller,/confidence\[n\]<112/);
});

test("original mode retains hundreds of true SVG edge segments instead of smoothing them away",()=>{const w=200,h=140;const sample=make(w,h,(x,y)=>x>=15+(y%5===0?2:0)&&x<160&&y>10&&y<125?black:clear);const raw=vector(sample,{detailMode:"original",ultraCleanup:true,edgeSmoothness:100,minIsland:60,minHole:60});const curved=vector(sample,{detailMode:"curves",edgeSmoothness:85,minIsland:60,minHole:60});assert.equal(raw.detailMode,"original");assert.equal(raw.edgeSmoothness,0);assert.ok(raw.segments>curved.segments*8);assert.match(raw.svg,/stroke="none"/);assert.equal(raw.microIslandsRemoved,0);});
test("original mode preserves single-pixel counters and tiny isolated details",()=>{const w=120,h=120;const s=make(w,h,(x,y)=>(x>=10&&x<110&&y>=10&&y<110&&!(x===50&&y===50))||(x===3&&y===3)?black:clear);const out=vector(s,{detailMode:"original",ultraCleanup:true,minIsland:70,minHole:70,edgeSmoothness:90});assert.equal(out.paths,3);assert.equal(out.microHolesFilled,0);assert.equal(out.microIslandsRemoved,0);assert.equal(out.detailMode,"original");});
test("homepage enables raw contour mode by default",()=>{const fs=require("node:fs"),path=require("node:path");const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");const js=fs.readFileSync(path.join(__dirname,"../vector.js"),"utf8");assert.match(html,/id="keepAllDetail" checked/);assert.match(html,/id="curveTolerance"/);assert.match(html,/fullvector\.js\?v=vector11/);assert.match(js,/detailMode:.*keepAllDetail/);});

test("original mode detects a one-pixel contrasting color missed by histogram subsampling",()=>{const s=make(160,120,(x,y)=>x>=10&&x<148&&y>=10&&y<110?(x===127&&y===38?[240,20,30,255]:black):clear);const original=vector(s,{detailMode:"original",maxColors:16,denoise:95});const normal=vector(s,{detailMode:"curves",maxColors:16,denoise:95});assert.equal(original.colors,2);assert.match(original.svg,/fill="#f0141e"/);assert.equal(original.detailMode,"original");assert.equal(normal.colors,1);});
test("original fidelity is not allowed to downsample silently",()=>{const fs=require("node:fs"),path=require("node:path");const controller=fs.readFileSync(path.join(__dirname,"../vector.js"),"utf8");assert.match(controller,/if\(\$\('#keepAllDetail'\)\.checked\)throw Error/);assert.match(controller,/do 10 MP/);assert.match(controller,/imgData=null;mask=null/);});
