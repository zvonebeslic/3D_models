"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
require("../vector-diff.js");
require("../vector-autotune.js");
const D=globalThis.VectorDiff,T=globalThis.VectorAutotune;
function image(w,h,fn){
 const data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(fn(x,y),4*(y*w+x));
 return{data,width:w,height:h};
}
const clear=[0,0,0,0],black=[3,4,5,255];
test("identical transparent images have exact zero pixel and edge errors",()=>{
 const a=image(20,20,(x,y)=>x>3&&x<16&&y>4&&y<17?black:clear);
 const result=D.compareData(a,a,20,20,{threshold:2});
 assert.equal(result.differentPixels,0);
 assert.equal(result.averageError,0);
 assert.equal(result.edgeMismatchPercent,0);
 assert.equal(result.meanEdgeDistance,0);
 assert.equal(result.score,0);
});
test("invisible RGB variation in fully transparent pixels creates no false errors",()=>{
 const a=image(6,6,()=>[250,0,0,0]);
 const b=image(6,6,()=>[0,250,250,0]);
 const result=D.compareData(a,b,6,6,{threshold:2});
 assert.equal(result.averageError,0);
 assert.equal(result.differentPixels,0);
 assert.equal(result.edgeMismatchPercent,0);
});
test("one missing solid pixel registers both color and alpha error",()=>{
 const a=image(10,10,(x,y)=>x===5&&y===5?[255,0,0,255]:clear);
 const b=image(10,10,()=>clear);
 const m=D.compareData(a,b,10,10,{threshold:8});
 assert.equal(m.differentPixels,1);
 assert.equal(m.alphaMismatchPixels,1);
 assert.equal(m.differentPercent,1);
 assert.ok(m.maximumError>100);
});
test("one-pixel translation of a black shape has nonzero edge discrepancy",()=>{
 const a=image(25,25,(x,y)=>x>=5&&x<=14&&y>=6&&y<=16?black:clear);
 const b=image(25,25,(x,y)=>x>=6&&x<=15&&y>=6&&y<=16?black:clear);
 const m=D.compareData(a,b,25,25,{threshold:5,edgeTolerance:0});
 assert.ok(m.meanEdgeDistance>0);
 assert.ok(m.edgeMismatchPercent>0);
 assert.ok(m.differentPixels>0);
 assert.ok(m.edgeHeatmap.some(v=>v>0));
});
test("a shifted outline within configured tolerance is not flagged as far edge deviation",()=>{
 const a=image(25,25,(x,y)=>x>=5&&x<=14&&y>=6&&y<=16?black:clear);
 const b=image(25,25,(x,y)=>x>=6&&x<=15&&y>=6&&y<=16?black:clear);
 const zero=D.compareData(a,b,25,25,{edgeTolerance:0});
 const one=D.compareData(a,b,25,25,{edgeTolerance:1});
 assert.ok(one.edgeMismatchPercent<zero.edgeMismatchPercent);
});
test("color mismatch without alpha change appears in color heatmap but not edge heatmap",()=>{
 const a=image(12,12,(x,y)=>x>=3&&x<10&&y>=3&&y<10?[240,30,20,255]:clear);
 const b=image(12,12,(x,y)=>x>=3&&x<10&&y>=3&&y<10?[30,30,220,255]:clear);
 const m=D.compareData(a,b,12,12,{threshold:5});
 assert.ok(m.differentPixels>0);
 assert.equal(m.edgeMismatchPercent,0);
 assert.ok(m.heatmap.some(v=>v>0));
 assert.ok(m.edgeHeatmap.every(v=>v===0));
});
test("comparison chooses bounded preview size without changing source dimensions",()=>{
 assert.deepEqual(D.chooseDimensions(200,200,700000),{width:200,height:200,scale:1});
 const dim=D.chooseDimensions(3000,2000,700000);
 assert.ok(dim.width*dim.height<=700000);
 assert.ok(dim.scale<1);
});
test("autotune exposes distinct scenarios and at least one detail preserving option",()=>{
 const candidates=T.candidateSettings({maxColors:12,denoise:70,edgeSmoothness:65,
   minIsland:6,minHole:14,segmentScale:2,ultraCleanup:true});
 assert.ok(candidates.length>=5);
 assert.ok(candidates.some(x=>x.settings.edgeSmoothness===0&&x.settings.minHole===0));
 assert.ok(candidates.some(x=>x.settings.ultraCleanup===false));
 assert.ok(candidates.every(x=>x.settings.maxColors<=16));
});
test("homepage loads both modules and visible analysis controls",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
 const js=fs.readFileSync(path.join(__dirname,"../vector.js"),"utf8");
 for(const id of ["compareSvg","autoTuneSvg","diffThreshold","edgeTolerance",
   "diffPanel","diffStats","originalDiffPreview","svgDiffPreview",
   "colorDiffPreview","edgeDiffPreview","autoTuneResults"]){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/vector-diff\.js\?v=vector13/);
 assert.match(html,/vector-autotune\.js\?v=vector13/);
 assert.match(js,/window\.VectorDiff\.compare\(/);
 assert.match(js,/window\.VectorAutotune\.run\(/);
 assert.match(js,/function getVectorReference\(/);
});
