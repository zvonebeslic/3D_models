"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
require("../trace-core.js");
require("../trace-fit.js");
require("../vector-cleanup.js");
require("../truecolor-vector.js");
const make=globalThis.TrueColorVector;
function scene(w,h,pick){
  const data=new Uint8ClampedArray(4*w*h),mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const color=pick(x,y);
    data.set(color,(y*w+x)*4);
    mask[y*w+x]=color[3]>0?1:0;
  }
  return{data,mask,w,h};
}
function exportScene(scene,opts={}){
  return make(scene.mask,{data:scene.data},scene.w,scene.h,opts);
}
// Parse the very SVG commands written by exact vector: this tests source
// color/alpha completeness independently of a browser's raster antialiasing.
function decode(svg,w,h){
  const decoded=new Uint8ClampedArray(w*h*4);
  const pathPattern=/<path fill="(#[0-9a-f]{6})"(?: fill-opacity="([0-9.]+)")? d="([^"]+)"\/>/g;
  let matched,shapes=0;
  while((matched=pathPattern.exec(svg))){
    const hex=matched[1];
    const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),
      b=parseInt(hex.slice(5,7),16);
    const alpha=matched[2]==null?255:Math.round(Number(matched[2])*255);
    const commands=matched[3],runs=/M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g;
    let run;
    while((run=runs.exec(commands))){
      const x=+run[1],y=+run[2],rw=+run[3],rh=+run[4];
      for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++){
        const at=(yy*w+xx)*4;
        decoded.set([r,g,b,alpha],at);
      }
      shapes++;
    }
  }
  return{data:decoded,shapes};
}
test("every native RGBA shade survives SVG conversion, including one-pixel accents",()=>{
 const original=scene(26,20,(x,y)=>[
   (x*71+y*13)%256,(x*31+y*37)%256,(x*17+y*67)%256,
   ((x+y)%7===0)?1:((x+y)%5===0)?127:255
 ]);
 const result=exportScene(original);
 const restored=decode(result.svg,26,20);
 assert.deepEqual(restored.data,original.data);
 assert.equal(result.sourcePixels,26*20);
 assert.ok(result.uniqueRGBA>16);
 assert.equal(result.exactPixels,true);
 assert.ok(!result.svg.includes("<image"));
 assert.ok(!result.svg.includes("data:image"));
});
test("transparent pixels are skipped without changing any visible sampled RGBA value",()=>{
 const s=scene(14,14,(x,y)=>
   x>=4&&x<10&&y>=2&&y<12?
     [(x*21)%256,(y*13)%256,91,(x+y)%2?22:220]:
     [0,0,0,0]
 );
 const svg=exportScene(s);
 const back=decode(svg.svg,14,14);
 assert.deepEqual(back.data,s.data);
 assert.equal(svg.sourcePixels,60);
 assert.ok(svg.uniqueRGBA>10);
});
test("same-color horizontal and vertical runs merge without changing pixels",()=>{
 const s=scene(90,65,(x,y)=>x<55&&y<49?[21,31,41,255]:[70,80,90,255]);
 const r=exportScene(s),decoded=decode(r.svg,90,65);
 assert.equal(r.colors,2);
 assert.equal(r.shapes,3);
 assert.deepEqual(decoded.data,s.data);
});
test("every discrete alpha channel level is retained as separate precision",()=>{
 const s=scene(255,1,(x,y)=>[23,45,67,x+1]);
 const v=exportScene(s),data=decode(v.svg,255,1).data;
 assert.deepEqual(data,s.data);
 assert.equal(v.colors,255);
});
test("same RGB with different alpha is not merged",()=>{
 const s=scene(10,1,(x,y)=>[23,45,67,25+x]);
 const result=exportScene(s),data=decode(result.svg,10,1).data;
 assert.deepEqual(data,s.data);
 assert.equal(result.colors,10);
});
test("the tool does not silently discard colors or downscale when memory is exhausted",()=>{
 const s=scene(20,20,(x,y)=>[x*9,y*9,(x*y*5)%256,255]);
 assert.throws(()=>exportScene(s,{maxShapes:10}),/više od|oblik/);
 assert.throws(()=>exportScene(s,{maxPixels:100}),/prelazi|piksela/);
});
test("micro mode adds real precision contour clip while retaining full RGBA palette",()=>{
 const s=scene(100,80,(x,y)=>{
   if(x<8||x>=92||y<9||y>=72||(x>=40&&x<53&&y>=32&&y<47))
     return[0,0,0,0];
   return [x*2,(y*3)%256,(x*11+y*7)%256,255];
 });
 const r=exportScene(s,{mode:"micro",microScale:2});
 assert.equal(r.mode,"micro");
 assert.ok(r.microPaths>=2);
 assert.ok(r.svg.includes("<clipPath"));
 assert.ok(r.uniqueRGBA>16);
 assert.equal(r.exactPixels,false);
 assert.ok(!/<image\b/.test(r.svg));
});
test("page makes exact truecolor the default and retains legacy curve option",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
 const controller=fs.readFileSync(path.join(__dirname,"../vector.js"),"utf8");
 assert.match(html,/id="vectorMode"/);
 assert.match(html,/<option value="exact" selected>/);
 assert.match(html,/<option value="micro">/);
 assert.match(html,/<option value="curves">/);
 assert.match(html,/truecolor-vector\.js\?v=vector15/);
 assert.match(controller,/window\.TrueColorVector\(mask,imgData,W,H/);
 assert.match(controller,/const options=currentVectorOptions\(\)/);
});
