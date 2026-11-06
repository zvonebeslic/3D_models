/* Smart shades: adapt a small number of SVG gradients to the SOURCE colors,
   retaining the established curve silhouette. Never converts image into
   a cloud of pixel rectangles. Optional and conservative. */
(function(root){
"use strict";
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function f(v){return String(Number(v.toFixed(4)));}
function color(c){return "#"+c.map(n=>clamp(Math.round(n),0,255).toString(16).padStart(2,"0")).join("");}
function exactShadeCount(p,mask,maxDistinct){
  const cap=Math.max(500,Math.floor(maxDistinct||250000));
  const seen=new Set(),N=mask.length;
  for(let i=0;i<N;i++){
    if(!mask[i]||p[i*4+3]===0)continue;
    const j=i*4;
    seen.add((p[j]*16777216+p[j+1]*65536+p[j+2]*256+p[j+3])>>>0);
    if(seen.size>=cap)return {count:seen.size,lowerBound:true};
  }
  return {count:seen.size,lowerBound:false};
}
function fitRegion(p,labels,w,h,region,base,index){
  const n=w*h,step=Math.max(1,Math.floor(Math.sqrt(n/65000)));
  let samples=[],cx=0,cy=0,mean=[0,0,0],xmin=w,ymin=h,xmax=-1,ymax=-1;
  for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){
    const i=y*w+x;
    if(labels[i]!==region)continue;
    const j=i*4,px={x:x+.5,y:y+.5,r:p[j],g:p[j+1],b:p[j+2]};
    samples.push(px);
    cx+=px.x;cy+=px.y;mean[0]+=px.r;mean[1]+=px.g;mean[2]+=px.b;
    if(x<xmin)xmin=x;if(x>xmax)xmax=x;
    if(y<ymin)ymin=y;if(y>ymax)ymax=y;
  }
  const m=samples.length;
  if(m<40||xmax-xmin<4&&ymax-ymin<4)return null;
  cx/=m;cy/=m;mean=mean.map(v=>v/m);
  let xx=0,xy=0,yy=0,xr=[0,0,0],yr=[0,0,0],variance=0;
  for(const s of samples){
    const dx=s.x-cx,dy=s.y-cy;
    xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;
    const vals=[s.r,s.g,s.b];
    for(let q=0;q<3;q++){
      const dv=vals[q]-mean[q];xr[q]+=dx*dv;yr[q]+=dy*dv;
      variance+=dv*dv;
    }
  }
  if(variance/m<20)return null; // flat color: don't manufacture shading
  const det=xx*yy-xy*xy;
  if(det<1e-6)return null;
  const ax=[],ay=[];
  for(let q=0;q<3;q++){
    ax[q]=(xr[q]*yy-yr[q]*xy)/det;
    ay[q]=(yr[q]*xx-xr[q]*xy)/det;
  }
  let gx=0,gy=0,gxy=0;
  for(let q=0;q<3;q++){gx+=ax[q]*ax[q];gy+=ay[q]*ay[q];gxy+=ax[q]*ay[q];}
  // Principal direction of RGB change on the source raster.
  const theta=.5*Math.atan2(2*gxy,gx-gy);
  const vx=Math.cos(theta),vy=Math.sin(theta);
  const projection=[xmin*vx+ymin*vy,xmax*vx+ymin*vy,
    xmin*vx+ymax*vy,xmax*vx+ymax*vy];
  const lo=Math.min(...projection),hi=Math.max(...projection),span=hi-lo;
  if(span<6)return null;
  const bins=11,sums=Array.from({length:bins},()=>[0,0,0,0]);
  for(const s of samples){
    const t=clamp((s.x*vx+s.y*vy-lo)/span,0,.999999);
    const k=Math.floor(t*bins),a=sums[k];
    a[0]+=s.r;a[1]+=s.g;a[2]+=s.b;a[3]++;
  }
  let filled=0;
  const centers=sums.map(v=>{
    if(!v[3])return null;
    filled++;
    return [v[0]/v[3],v[1]/v[3],v[2]/v[3]];
  });
  if(filled<6)return null;
  for(let k=0;k<bins;k++){
    if(centers[k])continue;
    let before=k-1,after=k+1;
    while(before>=0&&!centers[before])before--;
    while(after<bins&&!centers[after])after++;
    if(before<0&&after>=bins)return null;
    if(before<0)centers[k]=centers[after].slice();
    else if(after>=bins)centers[k]=centers[before].slice();
    else centers[k]=centers[before].map((v,q)=>v+(centers[after][q]-v)*(k-before)/(after-before));
  }
  // Suppress artificial bands due to discontinuous/non-gradient colors.
  let jumps=0;
  for(let k=1;k<bins;k++){
    const d=Math.hypot(...centers[k].map((v,q)=>v-centers[k-1][q]));
    if(d>75)jumps++;
  }
  if(jumps>1)return null;
  let flatErr=0,gradErr=0;
  for(const s of samples){
    const pos=clamp((s.x*vx+s.y*vy-lo)/span*bins-.5,0,bins-1);
    const low=Math.floor(pos),high=Math.min(bins-1,low+1),mix=pos-low;
    const current=[s.r,s.g,s.b];
    for(let q=0;q<3;q++){
      const d=current[q]-mean[q];flatErr+=d*d;
      const predicted=centers[low][q]*(1-mix)+centers[high][q]*mix;
      const e=current[q]-predicted;gradErr+=e*e;
    }
  }
  if(flatErr/m<20||gradErr>flatErr*.74)return null; // need material improvement
  // SVG gradient endpoints use user coordinates, not shape bounds.
  const origin=cx*vx+cy*vy;
  const x1=cx+vx*(lo-origin),y1=cy+vy*(lo-origin),
        x2=cx+vx*(hi-origin),y2=cy+vy*(hi-origin);
  const id="shade"+index;
  const stops=centers.map((rgb,k)=>
    '<stop offset="'+f((k+.5)/bins*100)+'%" stop-color="'+color(rgb)+'"/>').join("");
  // The outer 0%/100% stops avoid uncolored gaps.
  const defs='<linearGradient id="'+id+'" gradientUnits="userSpaceOnUse"'+
    ' x1="'+f(x1)+'" y1="'+f(y1)+'" x2="'+f(x2)+'" y2="'+f(y2)+'">'+
    '<stop offset="0%" stop-color="'+color(centers[0])+'"/>'+
    stops+'<stop offset="100%" stop-color="'+color(centers[bins-1])+'"/>'+
    '</linearGradient>';
  return {paint:"url(#"+id+")",defs:defs,improvement:1-gradErr/flatErr,points:m};
}
root.VectorSmartColor={fitRegion:fitRegion,exactShadeCount:exactShadeCount,
  _test:{hex:color}};
})(typeof window!=="undefined"?window:globalThis);
