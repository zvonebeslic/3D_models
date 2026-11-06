"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
require("../trace-core.js");
require("../trace-fit.js");
require("../vector-cleanup.js");
require("../vector-smart-color.js");
require("../fullvector.js");
const S=globalThis.VectorSmartColor,F=globalThis.FullVector;
function sample(w,h,fn){
 const data=new Uint8ClampedArray(w*h*4),mask=new Uint8Array(w*h),labels=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,rgba=fn(x,y);data.set(rgba,i*4);mask[i]=rgba[3]>0?1:0;
   labels[i]=mask[i]?0:255;
 }
 return{mask,img:{data},labels,w,h};
}
const clear=[0,0,0,0],black=[5,5,5,255];
test("exact shade detector counts one-pixel RGB and alpha differences",()=>{
 const s=sample(10,10,(x,y)=>{
   if(x===1&&y===1)return[14,15,16,255];
   if(x===2&&y===2)return[14,15,17,255];
   if(x===3&&y===3)return[14,15,16,254];
   return[14,15,16,255];
 });
 const r=S.exactShadeCount(s.img.data,s.mask,250000);
 assert.equal(r.count,3);
 assert.equal(r.lowerBound,false);
});
test("gradient detection uses actual image colors and creates no paths from pixels",()=>{
 const s=sample(240,180,(x,y)=>{
   if(x<20||x>=220||y<18||y>=160)return clear;
   return[Math.round(20+x*.7),Math.round(22+x*.2),
     Math.round(240-x*.6),255];
 });
 const direct=S.fitRegion(s.img.data,s.labels,s.w,s.h,0,[90,80,130],0);
 assert.ok(direct&&direct.improvement>.25);
 assert.match(direct.defs,/<linearGradient/);
 assert.match(direct.defs,/gradientUnits="userSpaceOnUse"/);
 const v=F(s.mask,s.img,s.w,s.h,{smartShades:true,edgeSmoothness:0,
    curveTolerance:.18,minIsland:0,minHole:0,denoise:50});
 assert.ok(v.gradientCount>=1);
 assert.match(v.svg,/linearGradient/);
 assert.doesNotMatch(v.svg,/<rect|<image/);
});
test("flat-color logo has the same contour count with or without smart shades",()=>{
 const s=sample(150,110,(x,y)=>x>20&&x<130&&y>15&&y<95?black:clear);
 const a=F(s.mask,s.img,s.w,s.h,{smartShades:true,edgeSmoothness:0});
 const b=F(s.mask,s.img,s.w,s.h,{smartShades:false,edgeSmoothness:0});
 assert.equal(a.gradientCount,0);
 assert.equal(a.paths,b.paths);
 assert.equal(a.segments,b.segments);
 assert.doesNotMatch(a.svg,/linearGradient|<rect/);
});
test("random near-black noise does not invent fake image-wide color gradients",()=>{
 const s=sample(240,180,(x,y)=>{
   if(x<20||x>=220||y<18||y>=160)return clear;
   return[(x*71+y*97)%13+17,(x*31+y*27)%12+18,
     (x*57+y*41)%13+20,255];
 });
 const v=F(s.mask,s.img,s.w,s.h,{smartShades:true,maxColors:12,
   denoise:70,edgeSmoothness:15});
 assert.equal(v.colors,1);
 assert.equal(v.gradientCount,0);
 assert.equal(v.paths,1);
});
test("smaller curve tolerance retains at least as many contour segments",()=>{
 const s=sample(240,200,(x,y)=>{
   const left=34+Math.round(Math.sin(y*.23)*5+Math.sin(y*.71)*2);
   return x>left&&x<211&&y>20&&y<178?black:clear;
 });
 const a=F(s.mask,s.img,s.w,s.h,{curveTolerance:.18,edgeSmoothness:0,
   smartShades:false,minIsland:0,minHole:0});
 const b=F(s.mask,s.img,s.w,s.h,{curveTolerance:1.2,edgeSmoothness:0,
   smartShades:false,minIsland:0,minHole:0});
 assert.ok(a.segments>=b.segments);
 assert.equal(a.paths,b.paths);
});
test("main page keeps classic vector first and exposes exact RGBA only as separate export",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
 const script=fs.readFileSync(path.join(__dirname,"../vector.js"),"utf8");
 assert.match(html,/id="smartShades" checked/);
 assert.match(html,/id="curveTolerance"/);
 assert.match(html,/id="vectorColors"[^>]*max="64"/);
 assert.match(html,/id="exportAllShades"/);
 assert.match(html,/vector-smart-color\.js\?v=vector16/);
 assert.match(script,/window\.FullVector\(mask,imgData,W,H,currentVectorOptions\(\)\)/);
 assert.match(script,/window\.TrueColorVector\(originalMask,imgData,W,H/);
 assert.doesNotMatch(html,/id="vectorMode"/);
});
