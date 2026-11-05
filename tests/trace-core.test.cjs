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

test("ULTRA keeps a one-pixel detail in a large image",()=>{
  const img=image(1500,30,(x,y)=>x===1001&&y===17?solid:transparent);
  const result=core.contours(img,1500,30,{...settings,tolerance:0,includeHoles:true});
  assert.equal(result.paths.length,1);
  assert.equal(result.paths[0].points.length,4);
});

test("ULTRA retains every pixel boundary vertex when tolerance is zero",()=>{
  const img=image(22,22,(x,y)=>x>=3&&x<19&&y>=3&&y<19?solid:transparent);
  const exact=core.contours(img,22,22,{...settings,tolerance:0,includeHoles:true});
  const simplified=core.contours(img,22,22,{...settings,tolerance:2,includeHoles:true});
  assert.ok(exact.paths[0].points.length>simplified.paths[0].points.length);
});

test("SVG serialization retains six decimal places without raster content",()=>{
  const svg=core.exportSVG([{points:[{x:.123456789,y:2},{x:.654321123,y:6}],
    closed:false,type:"manual"}],10,10,
    {style:"outline",color:"#234567",strokeWidth:.5,smooth:0});
  assert.match(svg,/0\.123457/);
  assert.match(svg,/0\.654321/);
  assert.doesNotMatch(svg,/<image\b|data:image/);
});

test("ULTRA detects interior high-contrast color boundaries",()=>{
  const red=[230,30,30,255],blue=[30,30,230,255];
  const img=image(28,28,(x,y)=>x>=3&&x<25&&y>=3&&y<25?(x<14?red:blue):transparent);
  const result=core.contours(img,28,28,{...settings,tolerance:0,
    includeHoles:true,includeColorEdges:true,edgeTolerance:40});
  assert.ok(result.paths.some(p=>p.type==="auto"));
  assert.ok(result.paths.some(p=>p.type==="detail"));
  const svg=core.exportSVG(result.paths,28,28,
    {style:"filled",color:"#004488",strokeWidth:.5,smooth:0});
  assert.match(svg,/fill-rule="evenodd"/);
  assert.match(svg,/fill="none" stroke="#004488"/);
});

test("opaque color-mask interpolation keeps fractional boundary coordinates",()=>{
  const white=[255,255,255,255],light=[225,225,225,255],black=[5,5,5,255];
  const img=image(16,16,(x,y)=>x<4||x>11||y<4||y>11?white:
    (x===4||x===11||y===4||y===11?light:black));
  const result=core.contours(img,16,16,{...settings,bgTolerance:18,tolerance:0,includeHoles:true});
  assert.equal(result.paths.length,1);
  assert.ok(result.paths[0].points.some(p=>Math.abs(p.x-Math.round(p.x))>.000001));
});

test("ultra mode is the default and cache-busted scripts are used",()=>{
  const fs=require("node:fs"), path=require("node:path");
  const html=fs.readFileSync(path.join(__dirname,"../trace.html"),"utf8");
  const js=fs.readFileSync(path.join(__dirname,"../trace-app.js"),"utf8");
  assert.match(html,/id="nativePixels"[^>]*checked/);
  assert.match(html,/id="autoTolerance"[^>]*value="0"/);
  assert.match(html,/id="autoSmooth"[^>]*value="0"/);
  assert.match(html,/trace-core\.js\?v=curves4/);
  assert.match(js,/var full = els\.nativePixels\.checked/);
});
