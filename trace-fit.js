/* Smooth vector reconstruction: adaptive cubic Bézier fitting with corner anchors.
   Entirely local. The error target is an approximation tolerance in source-image pixels,
   NOT a guarantee of recovery of the unknown pre-raster original geometry. */
(function(root){
"use strict";
var cache=new WeakMap();
function cap(v,a,b){return Math.max(a,Math.min(b,v));}
function sq(a,b){var x=a.x-b.x,y=a.y-b.y;return x*x+y*y;}
function dot(a,b){return a.x*b.x+a.y*b.y;}
function norm(a){var m=Math.hypot(a.x,a.y);return m>1e-10?{x:a.x/m,y:a.y/m}:{x:0,y:0};}
function minus(a,b){return{x:a.x-b.x,y:a.y-b.y};}
function rounded(x){return String(Number(x.toFixed(6)));}
function xy(p){return rounded(p.x)+" "+rounded(p.y);}
function curve(p0,p1,p2,p3,u){
  var v=1-u;
  return{x:v*v*v*p0.x+3*v*v*u*p1.x+3*v*u*u*p2.x+u*u*u*p3.x,
         y:v*v*v*p0.y+3*v*v*u*p1.y+3*v*u*u*p2.y+u*u*u*p3.y};
}
function chordParams(points){
  var n=points.length,us=new Float64Array(n),total=0;
  for(var i=1;i<n;i++){total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);us[i]=total;}
  if(total>1e-10)for(var j=1;j<n;j++)us[j]/=total;
  else for(var j=1;j<n;j++)us[j]=j/(n-1);
  return us;
}
function maxDistanceFromLine(pts){
  var a=pts[0],b=pts[pts.length-1],dx=b.x-a.x,dy=b.y-a.y,den=Math.hypot(dx,dy);
  if(den<1e-12)return Infinity;
  var m=0;
  for(var i=1;i<pts.length-1;i++){
    var dist=Math.abs(dx*(a.y-pts[i].y)-(a.x-pts[i].x)*dy)/den;
    if(dist>m)m=dist;
  }
  return m;
}
function fitOnce(pts){
  var p0=pts[0],p3=pts[pts.length-1],n=pts.length,chord=Math.hypot(p3.x-p0.x,p3.y-p0.y);
  // Use a short weighted neighborhood to estimate tangents while resisting one-pixel jitter.
  var offset=Math.min(4,n-1);
  var tanL=norm(minus(pts[offset],p0)),tanR=norm(minus(pts[n-1-offset],p3));
  if(!tanL.x&&!tanL.y)tanL=norm(minus(pts[1],p0));
  if(!tanR.x&&!tanR.y)tanR=norm(minus(pts[n-2],p3));
  var us=chordParams(pts),c00=0,c01=0,c11=0,x0=0,x1=0;
  for(var i=1;i<n-1;i++){
    var u=us[i],v=1-u,b0=v*v*v,b1=3*v*v*u,b2=3*v*u*u,b3=u*u*u;
    var a1={x:tanL.x*b1,y:tanL.y*b1},a2={x:tanR.x*b2,y:tanR.y*b2};
    var x={x:pts[i].x-p0.x*(b0+b1)-p3.x*(b2+b3),
           y:pts[i].y-p0.y*(b0+b1)-p3.y*(b2+b3)};
    c00+=dot(a1,a1);c01+=dot(a1,a2);c11+=dot(a2,a2);
    x0+=dot(a1,x);x1+=dot(a2,x);
  }
  var det=c00*c11-c01*c01,alpha=chord/3,beta=chord/3;
  if(Math.abs(det)>1e-10){
    alpha=(x0*c11-x1*c01)/det;
    beta=(x1*c00-x0*c01)/det;
  }
  if(!Number.isFinite(alpha)||!Number.isFinite(beta)||
    alpha<chord*.01||beta<chord*.01||alpha>chord*4||beta>chord*4){
    alpha=beta=chord/3;
  }
  var p1={x:p0.x+tanL.x*alpha,y:p0.y+tanL.y*alpha};
  var p2={x:p3.x+tanR.x*beta,y:p3.y+tanR.y*beta};
  var max=-1,index=Math.floor(n/2);
  for(var j=1;j<n-1;j++){
    var q=curve(p0,p1,p2,p3,us[j]),d=sq(q,pts[j]);
    if(d>max){max=d;index=j;}
  }
  return {p0:p0,p1:p1,p2:p2,p3:p3,err:max,index:index};
}
function fitArc(points,tolerance,out){
  var stack=[points];
  var count=0;
  while(stack.length){
    var pts=stack.pop(),n=pts.length;
    if(n<2)continue;
    if(n===2||maxDistanceFromLine(pts)<=tolerance*.60){
      out.push({line:pts[n-1]});continue;
    }
    var fit=fitOnce(pts);
    if(fit.err<=tolerance*tolerance||n<=3||count++>6000){
      out.push({curve:fit});continue;
    }
    var split=cap(fit.index,1,n-2);
    stack.push(pts.slice(split));
    stack.push(pts.slice(0,split+1));
  }
}
function ringAnchors(points){
  var n=points.length,smallTol=.72,keepers=[];
  // RDP is only for locating corners, not for throwing away source contour vertices.
  var poly=root.TraceCore&&root.TraceCore.simplify?root.TraceCore.simplify(points,smallTol,true):points;
  var indexes=new Map();for(var i=0;i<n;i++)indexes.set(points[i],i);
  for(var k=0;k<poly.length;k++){
    var a=poly[(k-1+poly.length)%poly.length],p=poly[k],b=poly[(k+1)%poly.length];
    var da=Math.sqrt(sq(a,p)),db=Math.sqrt(sq(b,p));
    if(da<2.8||db<2.8)continue;
    var u=norm(minus(a,p)),v=norm(minus(b,p));
    var turn=Math.PI-Math.acos(cap(dot(u,v),-1,1));
    if(turn>1.05)keepers.push({index:indexes.get(p),turn:turn});
  }
  keepers.sort(function(a,b){return b.turn-a.turn;});
  var selected=[];
  for(var item of keepers){
    if(selected.length>=50)break;
    var idx=item.index;
    if(selected.every(function(j){return Math.min((idx-j+n)%n,(j-idx+n)%n)>=4;}))
      selected.push(idx);
  }
  if(selected.length<2){
    selected=[];
    var first=0;for(var t=1;t<n;t++)if(points[t].x<points[first].x)first=t;
    selected=[first,(first+Math.floor(n/2))%n];
  }
  selected.sort(function(a,b){return a-b;});
  var all=[];
  for(var z=0;z<selected.length;z++){
    var start=selected[z],end=selected[(z+1)%selected.length],count=(end-start+n)%n;
    var countChunks=Math.max(1,Math.ceil(count/160));
    for(var u=0;u<countChunks;u++)all.push((start+Math.round(u*count/countChunks))%n);
  }
  return Array.from(new Set(all)).sort(function(a,b){return a-b;});
}
function fitPath(points,closed,tol){
  if(!points||points.length<(closed?3:2))return "";
  // Tiny glyphs need their genuine pixel corners, not invented cubic arcs.
  var n=points.length,tolerance=cap(Number(tol)||.7,.18,3);
  if(n<12){
    var direct="M"+xy(points[0]);
    for(var z=1;z<n;z++)direct+=" L"+xy(points[z]);
    return direct+(closed?" Z":"");
  }
  var anchors=closed?ringAnchors(points):[0,n-1],out="M"+xy(points[anchors[0]]);
  for(var ai=0;ai<(closed?anchors.length:anchors.length-1);ai++){
    var start=anchors[ai],end=closed?anchors[(ai+1)%anchors.length]:anchors[ai+1];
    var arc=[points[start]],idx=start,limit=0;
    while(idx!==end&&limit++<=n){
      idx=(idx+1)%n;arc.push(points[idx]);
    }
    if(limit>n)continue;
    var commands=[];fitArc(arc,tolerance,commands);
    for(var item of commands){
      if(item.line)out+=" L"+xy(item.line);
      else out+=" C"+xy(item.curve.p1)+" "+xy(item.curve.p2)+" "+xy(item.curve.p3);
    }
  }
  return out+(closed?" Z":"");
}
function pathD(points,closed,tol){
  if(!points)return "";
  var quality=cap(Number(tol)||.7,.18,3);
  var cached=cache.get(points);
  var k=(closed?"1":"0")+":"+quality.toFixed(3);
  if(cached&&cached[k])return cached[k];
  var d=fitPath(points,closed,quality);
  if(!cached){cached={};cache.set(points,cached);}
  cached[k]=d;
  return d;
}
function clearCache(points){if(points)cache.delete(points);}
root.TraceFit={pathD:pathD,clearCache:clearCache,_test:{fitOnce:fitOnce,ringAnchors:ringAnchors}};
})(typeof window!=="undefined"?window:globalThis);
