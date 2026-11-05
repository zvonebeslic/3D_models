"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../trace-core.js");
const core = globalThis.TraceCore;

function image(w,h, fn) {
  const data = new Uint8ClampedArray(w*h*4);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const c=fn(x,y), i=(y*w+x)*4;
    data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];data[i+3]=c[3];
  }
  return {data};
}
const settings = {bgTolerance:42,alphaThreshold:50,tolerance:.5,includeHoles:false};
const transparent=[0,0,0,0], solid=[30,130,180,255];

test("traces one alpha silhouette as a closed vector",()=>{
  const img=image(12,12,(x,y)=>x>=2&&x<=9&&y>=2&&y<=9?solid:transparent);
  const result=core.contours(img,12,12,settings);
  assert.equal(result.source,"alpha");
  assert.equal(result.paths.length,1);
  assert.ok(result.paths[0].points.length>=4);
  assert.ok(result.paths[0].closed);
  assert.ok(Math.abs(core._test.area(result.paths[0].points))>50);
});

test("detects inner holes only when requested",()=>{
  const img=image(30,30,(x,y)=>{
    const outer=x>=3&&x<27&&y>=3&&y<27;
    const hole=x>=10&&x<20&&y>=10&&y<20;
    return outer&&!hole?solid:transparent;
  });
  const outside=core.contours(img,30,30,settings);
  const withHoles=core.contours(img,30,30,{...settings,includeHoles:true});
  assert.equal(outside.paths.length,1);
  assert.equal(withHoles.paths.length,2);
  const svg=core.exportSVG(withHoles.paths,30,30,{style:"filled",color:"#1e82b4",strokeWidth:2,smooth:20});
  assert.match(svg,/fill-rule="evenodd"/);
  assert.ok(!svg.includes("<image"));
  assert.ok(!svg.includes("data:image"));
});

test("traces an opaque logo against white background",()=>{
  const black=[10,12,18,255], white=[255,255,255,255];
  const img=image(28,28,(x,y)=>x>=6&&x<22&&y>=6&&y<22?black:white);
  const result=core.contours(img,28,28,settings);
  assert.equal(result.source,"opaque");
  assert.equal(result.paths.length,1);
});

test("blank background creates no fake contour",()=>{
  const img=image(15,15,()=>[255,255,255,255]);
  assert.equal(core.contours(img,15,15,settings).paths.length,0);
});

test("independent emblems remain independent paths",()=>{
  const img=image(35,20,(x,y)=>{
    const a=x>=3&&x<10&&y>=4&&y<14;
    const b=x>=23&&x<32&&y>=4&&y<14;
    return a||b?solid:transparent;
  });
  assert.equal(core.contours(img,35,20,settings).paths.length,2);
});

test("simplifies an open gesture without losing endpoints",()=>{
  const line=Array.from({length:100},(_,x)=>({x,y:25}));
  const short=core.simplify(line,1,false);
  assert.equal(short.length,2);
  const svg=core.exportSVG([{points:short,closed:false,type:"manual"}],100,60,
    {style:"outline",color:"#12ab34",strokeWidth:2,smooth:0});
  assert.match(svg,/stroke="#12ab34"/);
  assert.match(svg,/viewBox="0 0 100 60"/);
  assert.ok(svg.includes("<path"));
  assert.ok(!svg.includes("<image"));
});

test("filled open gestures remain strokes instead of closing unexpectedly",()=>{
  const path={points:[{x:0,y:0},{x:30,y:30},{x:70,y:0}],closed:false,type:"manual"};
  const svg=core.exportSVG([path],100,100,{style:"filled",color:"#123456",strokeWidth:2,smooth:35});
  assert.match(svg,/fill="none" stroke="#123456"/);
  assert.ok(svg.includes(" C"));
});

test("border-touching transparent artwork traces closed boundary",()=>{
  const img=image(20,20,(x,y)=>(x<6&&y<6)?solid:transparent);
  const result=core.contours(img,20,20,settings);
  assert.equal(result.paths.length,1);
  assert.ok(result.paths[0].points.length>=3);
});