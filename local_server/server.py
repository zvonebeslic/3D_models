"""Local GPU bridge for 3D Models Lab.
Install FastAPI deps, then connect a local image-to-3D engine in generate_model().
The browser frontend expects GET /health and POST /generate returning a GLB.
"""
from pathlib import Path
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app=FastAPI(title="3D Models Local AI")
app.add_middleware(CORSMiddleware,allow_origins=["https://zvonebeslic.github.io","http://localhost:8000","http://127.0.0.1:8000"],allow_credentials=False,allow_methods=["GET","POST"],allow_headers=["*"])

@app.get('/health')
def health():
    return {"ok":True,"model":"engine not installed"}

def generate_model(image_path:Path, output_path:Path):
    # Adapter point. We intentionally do not fake 3D output.
    # Recommended engine: TRELLIS.2 where hardware/license requirements fit.
    # The engine must write a valid binary GLB to output_path.
    raise RuntimeError("3D engine is not installed yet. See local_server/README.md")

@app.post('/generate')
async def generate(image:UploadFile=File(...)):
    if not image.content_type or not image.content_type.startswith('image/'):
        raise HTTPException(400,'Datoteka mora biti slika.')
    work=Path(tempfile.mkdtemp(prefix='models3d_'))
    inp=work/'input.png'; out=work/'model.glb'
    inp.write_bytes(await image.read())
    try: generate_model(inp,out)
    except Exception as e: raise HTTPException(503,str(e))
    if not out.exists(): raise HTTPException(500,'AI nije proizveo GLB datoteku.')
    return FileResponse(out,media_type='model/gltf-binary',filename='model.glb')
