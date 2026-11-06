"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
require("../trace-core.js");
require("../trace-fit.js");
require("../vector-cleanup.js");
require("../fullvector.js");
const cleanup=globalThis.VectorCleanup, vector=globalThis.FullVector;
function binary(w,h,fn){
  const mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)mask[y*w+x]=fn(x,y)?1:0;
  return mask;
}
function logo(w,h,fn){
  const data=new Uint8ClampedArray(w*h*4),mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const pixel=fn(x,y),p=y*w+x;data.set(pixel,p*4);
    mask[p]=pixel[3]>=24?1:0;
  }
  return{img:{data},mask,w,h};
}
const clear=[0,0,0,0],black=[5,5,5,255],red=[230,35,25,255],blue=[30,65,235,255];
test("separate pixel specks are removed without damaging the big logo shape",()=>{
  const w=70,h=60,mask=binary(w,h,(x,y)=>
    (x>=10&&x<60&&y>=10&&y<50)||(x===4&&y===3));
  const res=cleanup.clean(mask,w,h,{minIsland:6,minHole:0,notchRepair:false});
  assert.equal(res.mask[3*w+4],0);
  assert.equal(res.mask[30*w+30],1);
  assert.equal(res.removedIslandCount,1);
  assert.equal(mask[3*w+4],1,"must not alter original mask");
});
test("tiny fully enclosed transparent holes are filled while large counters remain",()=>{
  const w=100,h=80,mask=binary(w,h,(x,y)=>{
    if(!(x>=10&&x<90&&y>=10&&y<70))return false;
    if(x===30&&y===30)return false;
    if(x>=50&&x<58&&y>=33&&y<41)return false;
    return true;
  });
  const res=cleanup.clean(mask,w,h,{minIsland:0,minHole:12,notchRepair:false});
  assert.equal(res.mask[30*w+30],1);
  assert.equal(res.mask[36*w+54],0);
  assert.equal(res.filledHoles,1);
  assert.equal(res.filledHoleCount,1);
});
test("outer white background never becomes a hole even if the shape nearly touches its edge",()=>{
  const w=60,h=60,mask=binary(w,h,(x,y)=>
    x>=2&&x<=55&&y>=3&&y<=56&&!(x===2&&y>=21&&y<=23));
  const res=cleanup.clean(mask,w,h,{minIsland:0,minHole:20,notchRepair:false});
  assert.equal(res.mask[21*w+2],0);
  assert.equal(res.filledHoleCount,0);
});
test("one pixel inner antialias notch can be repaired in strict mode",()=>{
  const w=30,h=30,mask=binary(w,h,(x,y)=>
    x>=4&&x<26&&y>=4&&y<26&&!(x===12&&y===12));
  const res=cleanup.clean(mask,w,h,{minIsland:0,minHole:0,notchRepair:true});
  assert.equal(res.mask[12*w+12],1);
  assert.equal(res.correctedNotches,1);
});
test("two detached letter dots produce two true local paths without tile seams",()=>{
  const w=100,h=65,mask=binary(w,h,(x,y)=>
    (x>=7&&x<=27&&y>=14&&y<=48)||(x>=63&&x<=89&&y>=8&&y<=51));
  const rgba=new Uint8Array(mask.map(x=>x?255:0));
  const result=cleanup.traceComponents(mask,rgba,w,h,{zoom:2,maxLocalPixels:2500000});
  assert.equal(result.stats.components,2);
  assert.equal(result.stats.refined,2);
  assert.equal(result.loops.length,2);
  const spans=result.loops.map(points=>({
    minX:Math.min(...points.map(p=>p.x)),
    maxX:Math.max(...points.map(p=>p.x))
  })).sort((a,b)=>a.minX-b.minX);
  assert.ok(Math.abs(spans[0].minX-7)<1.1);
  assert.ok(Math.abs(spans[0].maxX-28)<1.1);
  assert.ok(Math.abs(spans[1].minX-63)<1.1);
  assert.ok(Math.abs(spans[1].maxX-90)<1.1);
});
test("3x local retrace falls back safely to 1x on oversized components",()=>{
  const w=100,h=100,mask=binary(w,h,(x,y)=>
    x>=5&&x<95&&y>=5&&y<95);
  const alpha=Uint8Array.from(mask,v=>v?255:0);
  const r=cleanup.traceComponents(mask,alpha,w,h,{zoom:3,maxLocalPixels:12000});
  assert.equal(r.stats.components,1);
  assert.equal(r.stats.refined,0);
  assert.equal(r.stats.fallback,1);
  assert.equal(r.loops.length,1);
});
test("full SVG cleanup eliminates tiny specks while preserving real interior letter holes",()=>{
  const data=logo(130,120,(x,y)=>{
    if(x===3&&y===4)return black;
    const inside=x>=15&&x<115&&y>=12&&y<109;
    if(!inside)return clear;
    if(x===28&&y===32)return clear; // accidental pinhole
    if(x>=53&&x<67&&y>=44&&y<61)return clear; // intentional counter
    return black;
  });
  const r=vector(data.mask,data.img,data.w,data.h,{ultraCleanup:true,minIsland:6,minHole:14,segmentScale:2,denoise:70});
  assert.equal(r.colors,1);
  assert.equal(r.paths,2,"only outer path and real counter");
  assert.equal(r.microIslandsRemoved,1);
  assert.ok(r.microHolesFilled+r.microNotchesRepaired>=1);
  assert.equal(r.refined,1);
  assert.doesNotMatch(r.svg,/<image\b|data:image/);
  assert.match(r.svg,/fill-rule="evenodd"/);
});
test("multicolor logo keeps real strong color regions with cleanup enabled",()=>{
  const data=logo(160,100,(x,y)=>x>=10&&x<150&&y>=10&&y<90?
    (x<80?red:blue):clear);
  const r=vector(data.mask,data.img,data.w,data.h,{
    ultraCleanup:true,minIsland:6,minHole:12,segmentScale:2,denoise:70});
  assert.equal(r.colors,2);
  assert.equal(r.paths,2);
  assert.ok(r.components>=2);
});
test("cleanup is reversible via its explicit disabled switch",()=>{
  const data=logo(70,60,(x,y)=>
    (x>=9&&x<60&&y>=9&&y<50)||(x===4&&y===4)?black:clear);
  const cleaned=vector(data.mask,data.img,data.w,data.h,{ultraCleanup:true,minIsland:6,minHole:10});
  const raw=vector(data.mask,data.img,data.w,data.h,{ultraCleanup:false});
  assert.equal(cleaned.paths,1);
  assert.equal(raw.paths,2);
});
test("homepage wires all segmentation sliders and imports the cleanup module",()=>{
  const fs=require("node:fs"),path=require("node:path");
  const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
  const controller=fs.readFileSync(path.join(__dirname,"../vector.js"),"utf8");
  for(const id of ["ultraCleanup","minIsland","minHole","segmentScale"])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/vector-cleanup\.js\?v=vector10/);
  assert.match(controller,/ultraCleanup:\$\('#ultraCleanup'\)\.checked/);
});

test("zero hole threshold leaves an intentional single-pixel counter untouched",()=>{
  const w=40,h=40;
  const data=logo(w,h,(x,y)=>x>=4&&x<36&&y>=4&&y<36&&!(x===20&&y===20)?black:clear);
  const r=vector(data.mask,data.img,w,h,{
    ultraCleanup:true,minIsland:0,minHole:0,segmentScale:1});
  assert.equal(r.microHolesFilled,0);
  assert.equal(r.microNotchesRepaired,0);
  assert.equal(r.paths,2);
});
