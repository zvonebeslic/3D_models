"use strict";
const { test }=require("node:test");
const assert=require("node:assert/strict");
require("../trace-core.js");
require("../trace-fit.js");
const core=globalThis.TraceCore, fit=globalThis.TraceFit;
function image(w,h,fn){
  const data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(fn(x,y),4*(y*w+x));
  return{data};
}
const opaque=[20,90,180,255], clear=[0,0,0,0];
const options={bgTolerance:18,alphaThreshold:50,tolerance:0,includeHoles:true,edgeSoftness:45};

test("square logo preserves four distinct corners with fitted paths",()=>{
  const w=120,h=120;
  const img=image(w,h,(x,y)=>x>=20&&x<100&&y>=20&&y<100?opaque:clear);
  const data=core.contours(img,w,h,options);
  assert.equal(data.paths.length,1);
  const p=data.paths[0].points;
  const corners=fit._test.ringAnchors(p).map(i=>p[i]);
  assert.equal(corners.length,4);
  const bounds=[
    [20,20],[100,20],[100,100],[20,100]
  ];
  for(const [x,y] of bounds)
    assert.ok(corners.some(q=>Math.hypot(q.x-x,q.y-y)<2),"missing real corner "+x+","+y);
  const d=fit.pathD(p,true,.65);
  assert.match(d,/ C/);
  assert.match(d,/ Z$/);
  assert.ok((d.match(/ C/g)||[]).length<30);
});

test("circular silhouette becomes smooth vector curves, not pixel-to-pixel segments",()=>{
  const img=image(160,160,(x,y)=>Math.hypot(x-79.5,y-79.5)<50?opaque:clear);
  const res=core.contours(img,160,160,options);
  assert.equal(res.paths.length,1);
  const points=res.paths[0].points;
  const d=fit.pathD(points,true,.65);
  const commands=(d.match(/ [CL]/g)||[]).length;
  assert.ok(points.length>300);
  assert.ok(commands<points.length/3);
  assert.match(d,/ C/);
});

test("a one-pixel feature remains visible after gentle edge blur",()=>{
  const img=image(35,35,(x,y)=>x===17&&y===18?opaque:clear);
  const res=core.contours(img,35,35,options);
  assert.equal(res.paths.length,1);
  assert.ok(res.paths[0].points.length>=3);
});

test("SVG export is identical to the fitted display geometry",()=>{
  const img=image(100,100,(x,y)=>Math.hypot(x-50,y-50)<29?opaque:clear);
  const res=core.contours(img,100,100,options);
  const d=fit.pathD(res.paths[0].points,true,.55);
  const svg=core.exportSVG(res.paths,100,100,
    {color:"#112233",style:"outline",strokeWidth:.5,smooth:0,fit:true,fitTolerance:.55});
  assert.ok(svg.includes('d="'+d+'"'));
  assert.ok(!svg.includes("<image"));
});

test("user-selected background overrides corner background guess",()=>{
  const white=[255,255,255,255],blue=[0,0,150,255];
  const img=image(20,20,(x,y)=>x>=5&&x<15&&y>=5&&y<15?blue:white);
  const a=core._test.sourceMask(img,20,20,{bgTolerance:30});
  const b=core._test.sourceMask(img,20,20,{bgTolerance:30,backgroundColor:[0,0,150]});
  assert.equal(a.values[0],0);
  assert.ok(b.values[0]>a.values[0]);
});

test("colored interior boundary uses fitted curves, not a raster image",()=>{
  const red=[230,20,20,255],blue=[20,20,230,255];
  const img=image(40,40,(x,y)=>x>=4&&x<36&&y>=4&&y<36?(x<20?red:blue):clear);
  const r=core.contours(img,40,40,{...options,includeColorEdges:true,edgeTolerance:35});
  assert.ok(r.detailCount>=1);
  const svg=core.exportSVG(r.paths,40,40,
    {style:"outline",color:"#fa00aa",strokeWidth:.5,fit:true,fitTolerance:.5});
  assert.match(svg,/<path/);
  assert.doesNotMatch(svg,/<image|data:image/);
});
