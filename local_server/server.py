from pathlib import Path
import tempfile, zipfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from zero123_adapter import installed as views_installed, generate_orbit

app=FastAPI(title="3D Models Local AI")
app.add_middleware(CORSMiddleware,allow_origins=["https://zvonebeslic.github.io","http://localhost:8000","http://127.0.0.1:8000"],allow_credentials=False,allow_methods=["GET","POST"],allow_headers=["*"])

@app.get('/health')
def health():
    return {"ok":True,"novel_views":views_installed(),"model":"Zero123" if views_installed() else "AI engine not installed"}

def save_upload(data:bytes)->tuple[Path,Path]:
    work=Path(tempfile.mkdtemp(prefix='models3d_')); inp=work/'input.png'; inp.write_bytes(data); return work,inp

@app.post('/views')
async def views(image:UploadFile=File(...)):
    if not image.content_type or not image.content_type.startswith('image/'):
        raise HTTPException(400,'Datoteka mora biti slika.')
    work,inp=save_upload(await image.read()); frames=work/'views'
    try: generate_orbit(inp,frames)
    except Exception as e: raise HTTPException(503,str(e))
    imgs=sorted([p for p in frames.iterdir() if p.suffix.lower() in {'.png','.jpg','.jpeg','.webp'}])
    if len(imgs)<2: raise HTTPException(500,'AI nije proizveo dovoljno pogleda.')
    archive=work/'views.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for p in imgs:z.write(p,p.name)
    return FileResponse(archive,media_type='application/zip',filename='views.zip')

def generate_model(image_path:Path, output_path:Path):
    raise RuntimeError('GLB rekonstrukcija još zahtijeva zaseban lokalni 3D engine; /views je spreman za stvarne AI 360° poglede.')

@app.post('/generate')
async def generate(image:UploadFile=File(...)):
    if not image.content_type or not image.content_type.startswith('image/'):
        raise HTTPException(400,'Datoteka mora biti slika.')
    work,inp=save_upload(await image.read()); out=work/'model.glb'
    try: generate_model(inp,out)
    except Exception as e: raise HTTPException(503,str(e))
    if not out.exists(): raise HTTPException(500,'AI nije proizveo GLB datoteku.')
    return FileResponse(out,media_type='model/gltf-binary',filename='model.glb')
