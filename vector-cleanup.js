/* Full Vector - local component cleanup and subpixel re-tracing.
   Pure browser-side geometry, preserving original image coordinate space. */
(function(root){
"use strict";
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function walk(binary,w,h,connectivity,visitor){
  var n=w*h,seen=new Uint8Array(n),queue=new Int32Array(n),componentCount=0;
  for(var start=0;start<n;start++){
    if(!binary[start]||seen[start])continue;
    var head=0,tail=1,sx=start%w,sy=Math.floor(start/w);
    var left=sx,right=sx,top=sy,bottom=sy,touches=sx===0||sy===0||sx===w-1||sy===h-1;
    queue[0]=start;seen[start]=1;
    while(head<tail){
      var p=queue[head++],x=p%w,y=Math.floor(p/w);
      if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;
      if(x===0||y===0||x===w-1||y===h-1)touches=true;
      var q;
      if(x>0){q=p-1;if(binary[q]&&!seen[q]){seen[q]=1;queue[tail++]=q;}}
      if(x<w-1){q=p+1;if(binary[q]&&!seen[q]){seen[q]=1;queue[tail++]=q;}}
      if(y>0){q=p-w;if(binary[q]&&!seen[q]){seen[q]=1;queue[tail++]=q;}}
      if(y<h-1){q=p+w;if(binary[q]&&!seen[q]){seen[q]=1;queue[tail++]=q;}}
      if(connectivity===8){
        if(x>0&&y>0){q=p-w-1;if(binary[q]&&!seen[q]){seen[q]=1;queue[tail++]=q;}}
        if(x<w-1&&y>0){q=p-w+1;if(binary[q]&&!seen[q]){seen[q]=1;queue[tail++]=q;}}
        if(x>0&&y<h-1){q=p+w-1;if(binary[q]&&!seen[q]){seen[q]=1;queue[tail++]=q;}}
        if(x<w-1&&y<h-1){q=p+w+1;if(binary[q]&&!seen[q]){seen[q]=1;queue[tail++]=q;}}
      }
    }
    componentCount++;
    visitor(queue,tail,{left:left,right:right,top:top,bottom:bottom,touches:touches});
  }
  return componentCount;
}
function clean(mask,w,h,opts){
  opts=opts||{};
  var n=w*h,cleaned=new Uint8Array(n),removedIslands=0,filledHoles=0,
      removedIslandCount=0,filledHoleCount=0,correctedNotches=0;
  var minIsland=clamp(Math.floor(Number(opts.minIsland)||0),0,100000);
  var minHole=clamp(Math.floor(Number(opts.minHole)||0),0,100000);
  for(var i=0;i<n;i++)cleaned[i]=mask[i]?1:0;
  if(minIsland>1)walk(cleaned,w,h,8,function(queue,count){
    if(count>=minIsland)return;
    for(var j=0;j<count;j++)cleaned[queue[j]]=0;
    removedIslands+=count;removedIslandCount++;
  });
  // Conservative repair of isolated antialias pinpricks and 1-pixel V-notches.
  if(opts.notchRepair&&w>2&&h>2){
    var updates=[];
    for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){
      var p=y*w+x;if(cleaned[p])continue;
      var axial=cleaned[p-1]+cleaned[p+1]+cleaned[p-w]+cleaned[p+w];
      if(axial<3)continue;
      var diagonal=cleaned[p-w-1]+cleaned[p-w+1]+cleaned[p+w-1]+cleaned[p+w+1];
      if(axial+diagonal>=7)updates.push(p);
    }
    for(var p of updates)cleaned[p]=1;
    correctedNotches=updates.length;
  }
  if(minHole>1){
    var inverse=new Uint8Array(n);
    for(var i=0;i<n;i++)inverse[i]=cleaned[i]?0:1;
    // A true hole is enclosed. Areas connected to the canvas edge are never filled.
    walk(inverse,w,h,4,function(queue,count,bounds){
      if(bounds.touches||count>=minHole)return;
      for(var j=0;j<count;j++)cleaned[queue[j]]=1;
      filledHoles+=count;filledHoleCount++;
    });
  }
  return{mask:cleaned,removedIslands:removedIslands,filledHoles:filledHoles,
    removedIslandCount:removedIslandCount,filledHoleCount:filledHoleCount,correctedNotches:correctedNotches};
}
function sampleAt(src,w,h,x,y){
  var x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0;
  x0=clamp(x0,0,w-1);y0=clamp(y0,0,h-1);
  var x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1);
  var a=src[y0*w+x0]*(1-tx)+src[y0*w+x1]*tx,
      b=src[y1*w+x0]*(1-tx)+src[y1*w+x1]*tx;
  return Math.round(a*(1-ty)+b*ty);
}
// Separable Gaussian filter of alpha/coverage, in ORIGINAL PIXEL coordinates.
// Applied before local 2x/3x interpolation. Does not touch the source bitmap.
// A halfway (128) isoline on this smooth confidence field reduces raster spikes.
function smoothCoverage(source,w,h,strength){
  var amount=clamp(Number(strength)||0,0,100);
  if(amount<=0||w<2||h<2)return source;
  var sigma=amount*.022; // 65 => 1.43 native pixels, 100 => 2.2 pixels
  var radius=Math.max(1,Math.ceil(sigma*2.5)),weights=[],sum=0;
  for(var i=-radius;i<=radius;i++){
    var q=Math.exp(-(i*i)/(2*sigma*sigma));
    weights.push(q);sum+=q;
  }
  for(var i=0;i<weights.length;i++)weights[i]/=sum;
  var row=new Uint8Array(w*h),out=new Uint8Array(w*h);
  for(var y=0;y<h;y++)for(var x=0;x<w;x++){
    var sumR=0;
    for(var k=-radius;k<=radius;k++){
      var col=x+k;
      if(col>=0&&col<w)sumR+=source[y*w+col]*weights[k+radius];
    }
    row[y*w+x]=Math.round(sumR);
  }
  for(var y=0;y<h;y++)for(var x=0;x<w;x++){
    var sumC=0;
    for(var k=-radius;k<=radius;k++){
      var line=y+k;
      if(line>=0&&line<h)sumC+=row[line*w+x]*weights[k+radius];
    }
    out[y*w+x]=Math.round(sumC);
  }
  return out;
}
function traceComponents(mask,coverage,w,h,opts){
  opts=opts||{};
  var requested=clamp(Math.round(Number(opts.zoom)||1),1,3);
  var maxLocalPixels=clamp(Math.round(Number(opts.maxLocalPixels)||2500000),10000,10000000);
  var minArea=Math.max(0,Number(opts.minArea)||0);
  var paths=[],details={components:0,refined:0,fallback:0,zoom:requested,totalRawPoints:0};
  var geom=root.TraceCore&&root.TraceCore._test;
  if(!geom||!geom.traceIso)throw Error("Modul TraceCore nije dostupan.");
  if(mask.length!==w*h||coverage.length!==w*h)throw Error("Dimenzije maske se ne poklapaju.");
  details.components=walk(mask,w,h,8,function(queue,count,bounds){
    // Each connected component is cropped with 2px halo. No artificial tile seams.
    var left=Math.max(0,bounds.left-2),top=Math.max(0,bounds.top-2),
        right=Math.min(w-1,bounds.right+2),bottom=Math.min(h-1,bounds.bottom+2);
    var cw=right-left+1,ch=bottom-top+1,factor=requested;
    if(cw*ch*factor*factor>maxLocalPixels){
      factor=1;details.fallback++;
    }
    if(factor>1)details.refined++;
    var local=new Uint8Array(cw*ch);
    for(var i=0;i<count;i++){
      var original=queue[i],x=original%w,y=Math.floor(original/w);
      local[(y-top)*cw+x-left]=coverage[original];
    }
    // The spatial filter is confined to the component's own padded crop,
    // so other letter shapes cannot bleed into one another.
    var smoothed=smoothCoverage(local,cw,ch,opts.edgeSmoothness);
    // Keep genuine enclosed counters. Without this, Gaussian smoothing could
    // erase a tiny intentional hole even if the user set its cleanup to 0.
    if(Number(opts.edgeSmoothness)>0&&opts.preserveHoles!==false){
      var inverse=new Uint8Array(cw*ch);
      for(var ii=0;ii<inverse.length;ii++)inverse[ii]=local[ii]?0:1;
      walk(inverse,cw,ch,4,function(cells,length,bounds){
        if(bounds.touches)return; // only fully enclosed holes, not the outside
        for(var j=0;j<length;j++)smoothed[cells[j]]=0;
      });
    }
    var field=smoothed,fw=cw,fh=ch;
    if(factor>1){
      fw=cw*factor;fh=ch*factor;
      field=new Uint8Array(fw*fh);
      for(var yy=0;yy<fh;yy++){
        var py=(yy+.5)/factor-.5;
        for(var xx=0;xx<fw;xx++){
          var px=(xx+.5)/factor-.5;
          field[yy*fw+xx]=sampleAt(smoothed,cw,ch,px,py);
        }
      }
    }
    var loops=geom.traceIso(field,fw,fh,128);
    for(var loop of loops){
      if(loop.length<3)continue;
      for(var p of loop){p.x=left+p.x/factor;p.y=top+p.y/factor;}
      var a=0;
      for(var j=0,k=loop.length-1;j<loop.length;k=j++)a+=loop[k].x*loop[j].y-loop[j].x*loop[k].y;
      if(Math.abs(a/2)<minArea)continue;
      details.totalRawPoints+=loop.length;
      paths.push(loop);
    }
  });
  return{loops:paths,stats:details};
}
root.VectorCleanup={clean:clean,traceComponents:traceComponents,_test:{walk:walk,sampleAt:sampleAt,smoothCoverage:smoothCoverage}};
})(typeof window!=="undefined"?window:globalThis);
