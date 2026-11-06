const $=s=>document.querySelector(s),input=$('#imageInput'),drop=$('#drop'),preview=$('#preview'),previewWrap=$('#previewWrap'),remove=$('#removeImage'),removeBg=$('#removeBg'),run=$('#vectorize'),status=$('#status'),bgCard=$('#bgResultCard'),bgCanvas=$('#bgCanvas'),bgctx=bgCanvas.getContext('2d',{willReadFrequently:true}),cleanPreview=$('#cleanPreview'),resultCard=$('#resultCard'),svgResult=$('#svgResult'),stats=$('#stats'),zoom=$('#zoom'),zoomValue=$('#zoomValue');let url=null,imgData=null,mask=null,W=0,H=0,svgText='';
function load(f){if(!f||!f.type?.startsWith('image/'))return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(f);preview.onload=()=>{drop.classList.add('hidden');previewWrap.classList.remove('hidden');removeBg.disabled=false;run.disabled=false;bgCard.classList.add('hidden');resultCard.classList.add('hidden');status.classList.add('hidden');imgData=mask=null;svgText='';
  $('#exportAllShades').disabled=true;$('#compareSvg').disabled=true;$('#autoTuneSvg').disabled=true;
  };preview.src=url}input.onchange=e=>load(e.target.files?.[0]);remove.onclick=()=>location.reload();async function image(){return new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=j;i.src=url})}
async function prepare(){
  const im=await image();
  W=im.naturalWidth||im.width;H=im.naturalHeight||im.height;
  const max=10000000;
  if(W*H>max)throw Error('Original ima '+W+' × '+H+
    ' piksela (više od 10 MP). Za mikropreciznu vektorizaciju ne smijem ga tiho smanjiti. '+
    'Učitaj manji original ili podijeli sliku u manje dijelove.');
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
removeBg.onclick=async()=>{removeBg.disabled=true;status.classList.remove('hidden');status.textContent='Analiziram vanjsku pozadinu i čuvam zatvorene detalje loga…';try{await prepare();bgCard.classList.remove('hidden');status.textContent='✓ Pozadina uklonjena.';bgCard.scrollIntoView({behavior:'smooth'})}catch(e){console.error(e);status.textContent='Greška pri uklanjanju pozadine: '+e.message}finally{removeBg.disabled=false}};$('#downloadPng').onclick=()=>bgCanvas.toBlob(b=>{if(!b)return;const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='logo-transparent.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)});
function currentVectorOptions(){
  return {
    maxColors:Number($('#vectorColors').value),
    smartShades:$('#smartShades').checked,
    curveTolerance:Number($('#curveTolerance').value)/100,
    denoise:Number($('#noiseReduction').value),
    ultraCleanup:$('#ultraCleanup').checked,
    minIsland:Number($('#minIsland').value),
    minHole:Number($('#minHole').value),
    edgeSmoothness:Number($('#edgeSmoothness').value),
    segmentScale:Number($('#segmentScale').value)
  };
}
function setVectorOptions(settings){
  $('#smartShades').checked=settings.smartShades!==false;
  $('#curveTolerance').value=String(Math.round((settings.curveTolerance==null?.25:settings.curveTolerance)*100));
  $('#curveToleranceLabel').textContent=(Number($('#curveTolerance').value)/100).toFixed(2).replace('.',',')+' px';
  $('#vectorColors').value=String(settings.maxColors);
  $('#noiseReduction').value=String(settings.denoise);
  $('#ultraCleanup').checked=Boolean(settings.ultraCleanup);
  $('#minIsland').value=String(settings.minIsland);
  $('#minHole').value=String(settings.minHole);
  $('#edgeSmoothness').value=String(settings.edgeSmoothness);
  $('#segmentScale').value=String(settings.segmentScale);
  $('#vectorColorsLabel').textContent=$('#vectorColors').value;
  $('#noiseReductionLabel').textContent=$('#noiseReduction').value+'%';
  $('#minIslandLabel').textContent=$('#minIsland').value+' px²';
  $('#minHoleLabel').textContent=$('#minHole').value+' px²';
  $('#edgeSmoothnessLabel').textContent=$('#edgeSmoothness').value+'%';
  syncCleanupOptions();
}
function getVectorReference(){
  if(!imgData||!mask)throw Error('Prvo učitaj i obradi izvornu sliku.');
  const copy=new Uint8ClampedArray(imgData.data);
  for(let i=0;i<mask.length;i++)if(!mask[i])copy[i*4+3]=0;
  return new ImageData(copy,W,H);
}
function showVector(b){
  svgText=b.svg;
  svgResult.innerHTML=svgText;
  const shades=window.VectorSmartColor?
    window.VectorSmartColor.exactShadeCount(imgData.data,mask,180000):null;
  stats.textContent=b.colors.toLocaleString('hr-HR')+' osnovnih boja • '+
    (shades?(shades.lowerBound?'Najmanje ':'')+shades.count.toLocaleString('hr-HR')+
    ' prepoznatih RGBA nijansi • ':'')+
    (b.gradientCount||0)+' pametnih gradijenata • '+
    b.paths.toLocaleString('hr-HR')+' kontura • '+
    b.segments.toLocaleString('hr-HR')+' SVG segmenata • '+
    b.points.toLocaleString('hr-HR')+' rubnih točaka • '+
    b.microIslandsRemoved+' uklonjenih mrlja • '+
    b.microHolesFilled+' zatvorenih rupica • '+
    b.refined+' lokalno obrađenih segmenata';
  $('#diffPanel').classList.add('hidden');
  $('#compareSvg').disabled=false;
  $('#autoTuneSvg').disabled=false;
  $('#exportAllShades').disabled=false;
  resultCard.classList.remove('hidden');
  applyZoom();
}
async function generateVector(){
  if(!imgData||!mask)await prepare();
  if(typeof window.FullVector!=='function')throw Error('Full Vector modul nije učitan.');
  await new Promise(resolve=>setTimeout(resolve,20));
  const b=window.FullVector(mask,imgData,W,H,currentVectorOptions());
  showVector(b);
  return b;
}
run.onclick=async()=>{
  run.disabled=true;
  status.classList.remove('hidden');
  status.textContent='Vektoriziram sve boje i oblike logotipa…';
  try{
    await generateVector();
    status.textContent='✓ SVG je gotov. Ispod rezultata usporedi ga s originalom.';
    resultCard.scrollIntoView({behavior:'smooth'});
  }catch(error){
    console.error(error);status.textContent='Greška pri vektorizaciji: '+error.message;
  }finally{run.disabled=false;}
};

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
$('#exportAllShades').onclick=async()=>{
  if(!imgData||!mask)return;
  const button=$('#exportAllShades');
  button.disabled=true;run.disabled=true;
  status.classList.remove('hidden');
  status.textContent='Izrađujem poseban 1:1 SVG sa svakom RGBA nijansom očišćenog logotipa…';
  await new Promise(resolve=>setTimeout(resolve,30));
  try{
    const originalMask=new Uint8Array(mask);
    // For PNG with transparency, preserve even one-alpha source samples.
    let transparent=false;
    for(let i=0;i<W*H;i++)if(imgData.data[i*4+3]<245){transparent=true;break;}
    if(transparent){
      for(let i=0;i<originalMask.length;i++)originalMask[i]=imgData.data[i*4+3]>0?1:0;
    }
    const result=window.TrueColorVector(originalMask,imgData,W,H,{
      mode:'exact',maxShapes:650000,maxChars:50000000
    });
    const blob=new Blob([result.svg],{type:'image/svg+xml;charset=utf-8'});
    const href=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=href;a.download='logo-sve-nijanse-1-na-1.svg';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(href),60000);
    status.textContent='✓ Izvoz svih '+result.uniqueRGBA.toLocaleString('hr-HR')+
      ' RGBA nijansi pokrenut. Glavni SVG s Bézierovim krivuljama ostao je nepromijenjen.';
  }catch(error){
    console.error(error);
    status.textContent='Izvoz svih nijansi nije moguć na ovom uređaju: '+error.message+
      '. Glavni vektorski SVG nije promijenjen.';
  }finally{button.disabled=false;run.disabled=false;}
};
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
$('#curveTolerance').addEventListener('input',()=>{
  $('#curveToleranceLabel').textContent=(Number($('#curveTolerance').value)/100).toFixed(2).replace('.',',')+' px';
});

function syncCleanupOptions(){
  const on=$('#ultraCleanup').checked;
  $('#minIsland').disabled=!on;
  $('#minHole').disabled=!on;
  $('#edgeSmoothness').disabled=!on;
  $('#segmentScale').disabled=!on;
}
$('#ultraCleanup').addEventListener('change',syncCleanupOptions);
$('#minIsland').addEventListener('input',()=>$('#minIslandLabel').textContent=$('#minIsland').value+' px²');
$('#minHole').addEventListener('input',()=>$('#minHoleLabel').textContent=$('#minHole').value+' px²');
syncCleanupOptions();

$('#edgeSmoothness').addEventListener('input',()=>$('#edgeSmoothnessLabel').textContent=$('#edgeSmoothness').value+'%');


// Full Vector accuracy inspection: compare only the foreground reference
// with the SVG rasterization, never the unremoved JPG background.
const qualityProgress=$('#qualityProgress'),diffPanel=$('#diffPanel');
function drawComparedCanvas(id,source,overlay){
  const el=$(id);el.width=source.width;el.height=source.height;
  const ctx=el.getContext('2d',{willReadFrequently:false});
  ctx.clearRect(0,0,el.width,el.height);
  ctx.drawImage(source,0,0);
  if(overlay)ctx.drawImage(overlay,0,0);
}
function updateDiffZoom(){
  const percent=Number($('#diffZoom').value);
  $('#diffZoomLabel').textContent=percent+'%';
  for(const id of ['#originalDiffPreview','#svgDiffPreview','#colorDiffPreview','#edgeDiffPreview']){
    const canvas=$(id);
    canvas.style.width=percent+'%';
    canvas.style.maxWidth='none';
    canvas.style.maxHeight='none';
  }
}
$('#diffZoom').addEventListener('input',updateDiffZoom);
$('#downloadDiffPng').onclick=()=>{
  const canvas=$('#edgeDiffPreview');
  if(!canvas.width||!canvas.height)return;
  canvas.toBlob(blob=>{
    if(!blob){qualityProgress.textContent='Preuzimanje karte nije uspjelo.';return;}
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='logo-odstupanja-rubova.png';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  },'image/png');
};
function fmtQuality(value,digits=2){
  return Number(value).toLocaleString('hr-HR',{
    maximumFractionDigits:digits,minimumFractionDigits:digits
  });
}
async function compareCurrent(){
  if(!svgText)throw Error('Prvo izradi SVG.');
  const result=await window.VectorDiff.compare(
    getVectorReference(),svgText,W,H,{
      threshold:Number($('#diffThreshold').value),
      edgeTolerance:Number($('#edgeTolerance').value),
      maxPixels:700000
    }
  );
  const m=result.metrics;
  $('#diffStats').textContent=
    'Prosječna pogreška: '+fmtQuality(m.averageError)+
    '/255 · Maksimalna: '+fmtQuality(m.maximumError)+
    '/255 · Različiti pikseli: '+m.differentPixels.toLocaleString('hr-HR')+
    ' ('+fmtQuality(m.differentPercent)+'%) · Odstupanje rubova: '+
    fmtQuality(m.edgeMismatchPercent)+'% · Srednja udaljenost rubova: '+
    fmtQuality(m.meanEdgeDistance)+' px'+
    (result.scaled?' · Analiza umanjena na '+
      result.comparisonWidth+' × '+result.comparisonHeight+
      ' px zbog memorije. SVG ostaje izvorne veličine.':
      ' · Analiza u izvornoj rezoluciji.');
  drawComparedCanvas('#originalDiffPreview',result.sourceCanvas);
  drawComparedCanvas('#svgDiffPreview',result.renderedCanvas);
  drawComparedCanvas('#colorDiffPreview',result.sourceCanvas,result.heatmapCanvas);
  drawComparedCanvas('#edgeDiffPreview',result.sourceCanvas,result.edgeCanvas);
  diffPanel.classList.remove('hidden');
  updateDiffZoom();
  return result;
}
let qualityBusy=false;
$('#compareSvg').onclick=async()=>{
  if(qualityBusy)return;
  qualityBusy=true;
  $('#compareSvg').disabled=true;$('#autoTuneSvg').disabled=true;
  qualityProgress.textContent='Analiziram boje, prozirnost i položaj rubova…';
  try{
    await compareCurrent();
    qualityProgress.textContent='✓ Analiza završena. Karta pokazuje gdje SVG odstupa od originala.';
    diffPanel.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){
    console.error(error);
    qualityProgress.textContent='Usporedba nije uspjela: '+error.message;
  }finally{
    qualityBusy=false;$('#compareSvg').disabled=false;$('#autoTuneSvg').disabled=false;
  }
};
$('#diffThreshold').addEventListener('input',()=>{
  $('#diffThresholdValue').textContent=$('#diffThreshold').value;
});
function showTuningResults(output){
  const el=$('#autoTuneResults');
  el.replaceChildren();
  const intro=document.createElement('p');
  intro.textContent='Najbolji od '+output.attempts.length+' probnih postupaka: '+
    output.best.name+' (ocjena '+fmtQuality(output.best.score,3)+', niže je bolje). '+
    'Postavke su izmjerene na uzorku '+output.sampledWidth+' × '+
    output.sampledHeight+' px i zatim primijenjene na izvornu rezoluciju.';
  el.append(intro);
  const table=document.createElement('table');
  const heading=document.createElement('tr');
  for(const name of ['Postupak','Ocjena ↓','Rubovi','Boje']){
    const cell=document.createElement('th');cell.textContent=name;heading.append(cell);
  }
  table.append(heading);
  for(const trial of output.ranking){
    const row=document.createElement('tr');
    if(trial===output.best)row.className='qualityBest';
    for(const value of [
      trial.name,fmtQuality(trial.score,3),
      fmtQuality(trial.edgeMismatchPercent)+'%',String(trial.colors)
    ]){
      const cell=document.createElement('td');cell.textContent=value;row.append(cell);
    }
    table.append(row);
  }
  el.append(table);el.classList.remove('hidden');
}
$('#autoTuneSvg').onclick=async()=>{
  if(qualityBusy)return;
  qualityBusy=true;run.disabled=true;
  $('#compareSvg').disabled=true;$('#autoTuneSvg').disabled=true;
  qualityProgress.textContent='Pripremam automatsku analizu…';
  try{
    if(!imgData||!mask)await prepare();
    const source=getVectorReference();
    const tuned=await window.VectorAutotune.run(
      source,W,H,currentVectorOptions(),{
        maxPixels:180000,
        threshold:Number($('#diffThreshold').value),
        edgeTolerance:Number($('#edgeTolerance').value),
        onProgress:(index,total,name)=>{
          qualityProgress.textContent='Isprobavam '+Math.min(index+1,total)+
            '/'+total+': '+name+'…';
        }
      }
    );
    setVectorOptions(tuned.best.settings);
    qualityProgress.textContent='Najbolja probna postavka: '+
      tuned.best.name+'. Izrađujem konačni SVG…';
    await generateVector();
    showTuningResults(tuned);
    qualityProgress.textContent='Provjeravam konačni SVG na originalnoj slici…';
    await compareCurrent();
    qualityProgress.textContent='✓ Automatsko podešavanje i usporedba gotovi. '+
      'Odabrane su najbolje izmjerene probne postavke.';
    $('#autoTuneResults').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){
    console.error(error);
    qualityProgress.textContent='Automatsko podešavanje nije uspjelo: '+error.message;
  }finally{
    qualityBusy=false;run.disabled=false;
    $('#compareSvg').disabled=!svgText;
    $('#autoTuneSvg').disabled=!svgText;
  }
};
