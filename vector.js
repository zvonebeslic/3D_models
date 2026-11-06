const $=s=>document.querySelector(s),input=$('#imageInput'),drop=$('#drop'),preview=$('#preview'),previewWrap=$('#previewWrap'),remove=$('#removeImage'),removeBg=$('#removeBg'),run=$('#vectorize'),status=$('#status'),bgCard=$('#bgResultCard'),bgCanvas=$('#bgCanvas'),bgctx=bgCanvas.getContext('2d',{willReadFrequently:true}),cleanPreview=$('#cleanPreview'),resultCard=$('#resultCard'),svgResult=$('#svgResult'),stats=$('#stats'),zoom=$('#zoom'),zoomValue=$('#zoomValue');let url=null,imgData=null,mask=null,W=0,H=0,svgText='';
function load(f){if(!f||!f.type?.startsWith('image/'))return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(f);preview.onload=()=>{drop.classList.add('hidden');previewWrap.classList.remove('hidden');removeBg.disabled=false;run.disabled=false;bgCard.classList.add('hidden');resultCard.classList.add('hidden');status.classList.add('hidden');imgData=mask=null};preview.src=url}input.onchange=e=>load(e.target.files?.[0]);remove.onclick=()=>location.reload();async function image(){return new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=j;i.src=url})}
async function prepare(){
  const im=await image();
  W=im.naturalWidth||im.width;H=im.naturalHeight||im.height;
  const max=10000000;
  if(W*H>max){const q=Math.sqrt(max/(W*H));W=Math.max(1,Math.round(W*q));H=Math.max(1,Math.round(H*q))}
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const x=c.getContext('2d',{willReadFrequently:true});
  x.drawImage(im,0,0,W,H);imgData=x.getImageData(0,0,W,H);
  const p=imgData.data,N=W*H;
  mask=new Uint8Array(N);
  let hasAlpha=false;
  for(let n=0;n<N;n++)if(p[n*4+3]<245){hasAlpha=true;break}
  if(hasAlpha){
    for(let n=0;n<N;n++)mask[n]=p[n*4+3]>=24?1:0;
    return applyMask();
  }
  // Never mark EVERY border pixel as background: the logo may touch image edges.
  // Find actual border-connected low-contrast background pixels first.
  if(!window.TraceCore?._test?.sourceMask)throw Error('Modul za analizu pozadine nije učitan.');
  const confidence=window.TraceCore._test.sourceMask(imgData,W,H,{bgTolerance:32}).values;
  const bg=new Uint8Array(N),q=new Int32Array(N);
  let head=0,tail=0;
  function seed(n){
    if(!bg[n]&&confidence[n]<112){bg[n]=1;q[tail++]=n}
  }
  for(let col=0;col<W;col++){seed(col);seed((H-1)*W+col)}
  for(let row=1;row<H-1;row++){seed(row*W);seed(row*W+W-1)}
  if(!tail)throw Error('Pozadina nije jednoznačna. Probaj prozirni PNG ili alat Trace Studio za ručni odabir pozadine.');
  while(head<tail){
    const n=q[head++],col=n%W,row=(n/W)|0;
    if(col>0)seed(n-1);
    if(col<W-1)seed(n+1);
    if(row>0)seed(n-W);
    if(row<H-1)seed(n+W);
  }
  for(let n=0;n<N;n++)mask[n]=bg[n]?0:1;
  return applyMask();
}
function applyMask(){const d=new ImageData(new Uint8ClampedArray(imgData.data),W,H),p=d.data;for(let n=0;n<mask.length;n++)p[n*4+3]=mask[n]?255:0;bgCanvas.width=W;bgCanvas.height=H;bgctx.clearRect(0,0,W,H);bgctx.putImageData(d,0,0);cleanPreview.width=W;cleanPreview.height=H;cleanPreview.getContext('2d').putImageData(d,0,0);return d}
removeBg.onclick=async()=>{removeBg.disabled=true;status.classList.remove('hidden');status.textContent='Analiziram vanjsku pozadinu i čuvam zatvorene detalje loga…';try{await prepare();bgCard.classList.remove('hidden');status.textContent='✓ Pozadina uklonjena.';bgCard.scrollIntoView({behavior:'smooth'})}catch(e){console.error(e);status.textContent='Greška pri uklanjanju pozadine.'}finally{removeBg.disabled=false}};$('#downloadPng').onclick=()=>bgCanvas.toBlob(b=>{if(!b)return;const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='logo-transparent.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)});
run.onclick=async()=>{run.disabled=true;status.classList.remove('hidden');status.textContent='Gradim puni SVG iz boja i oblika…';try{if(!imgData||!mask)await prepare();if(typeof window.FullVector!=='function')throw Error('Full vector engine nije učitan');await new Promise(r=>setTimeout(r,40));const b=window.FullVector(mask,imgData,W,H,{
      maxColors:Number($('#vectorColors').value),
      denoise:Number($('#noiseReduction').value),
      ultraCleanup:$('#ultraCleanup').checked,
      minIsland:Number($('#minIsland').value),
      minHole:Number($('#minHole').value),
      segmentScale:Number($('#segmentScale').value)
    });svgText=b.svg;svgResult.innerHTML=svgText;stats.textContent=`${b.colors.toLocaleString()} stvarnih boja • ${b.paths.toLocaleString()} kontura • ${b.segments.toLocaleString()} stvarnih SVG segmenata • ${b.points.toLocaleString()} analiziranih rubnih točaka • ${b.microIslandsRemoved} uklonjenih mrlja • ${b.microHolesFilled} zatvorenih rupica • ${b.microNotchesRepaired} popravljenih mikroudubljenja • ${b.refined} segmenata lokalno obrađeno u visokoj rezoluciji • ${b.fallback} velikih segmenata obrađeno 1× • SVG s Bézierovim krivuljama`;resultCard.classList.remove('hidden');status.textContent='✓ Full vector SVG gotov.';applyZoom();resultCard.scrollIntoView({behavior:'smooth'})}catch(e){console.error(e);status.textContent='Greška pri full vektorizaciji: '+e.message}finally{run.disabled=false}};
function applyZoom(){zoomValue.textContent=zoom.value+'%';const s=svgResult.querySelector('svg');if(s){s.style.width=zoom.value+'%';s.style.height='auto';s.style.maxWidth='none'}}zoom.oninput=applyZoom;function saveFullSVG(){
  if(!svgText){status.classList.remove('hidden');status.textContent='Prvo izradi SVG.';return}
  try{
    const url=URL.createObjectURL(new Blob([svgText],{type:'image/svg+xml;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='logo-full-vector.svg';
    a.style.display='none';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    status.classList.remove('hidden');status.textContent='Preuzimanje je pokrenuto. Provjeri mapu Preuzimanja, ili koristi Spremi / podijeli.';
  }catch(err){status.classList.remove('hidden');status.textContent='Preuzimanje nije uspjelo: '+err.message}
}
$('#downloadSvg').onclick=saveFullSVG;
$('#shareFullSvg').onclick=async()=>{
  if(!svgText)return;
  try{
    const file=new File([svgText],'logo-full-vector.svg',{type:'image/svg+xml'});
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:'Logo Print Lab SVG'});
    }else saveFullSVG();
  }catch(err){
    if(err.name!=='AbortError'){
      status.classList.remove('hidden');
      status.textContent='Dijeljenje nije dostupno: '+err.message+'. Pokušaj Preuzmi SVG u pregledniku.';
    }
  }
};
$('#vectorColors').addEventListener('input',()=>$('#vectorColorsLabel').textContent=$('#vectorColors').value);
$('#noiseReduction').addEventListener('input',()=>$('#noiseReductionLabel').textContent=$('#noiseReduction').value+'%');

function syncCleanupOptions(){
  const on=$('#ultraCleanup').checked;
  $('#minIsland').disabled=!on;
  $('#minHole').disabled=!on;
  $('#segmentScale').disabled=!on;
}
$('#ultraCleanup').addEventListener('change',syncCleanupOptions);
$('#minIsland').addEventListener('input',()=>$('#minIslandLabel').textContent=$('#minIsland').value+' px²');
$('#minHole').addEventListener('input',()=>$('#minHoleLabel').textContent=$('#minHole').value+' px²');
syncCleanupOptions();
