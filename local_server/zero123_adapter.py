"""Zero123 adapter for true novel-view generation.

Zero123's official code is MIT licensed. Model weights/dependencies must be
installed locally by the user. This module deliberately keeps the heavy model
out of the GitHub Pages frontend.

Expected flow:
 input image -> Zero123 novel views -> frames/ -> reconstruction engine -> GLB

The legacy official Zero123 demo is GPU-heavy (~22 GB VRAM), so this adapter
checks for a local installation instead of pretending inference happened.
"""
from pathlib import Path
import os, subprocess

ZERO123_DIR = Path(os.environ.get("ZERO123_DIR", "../zero123")).expanduser().resolve()


def installed() -> bool:
    return ZERO123_DIR.exists() and (ZERO123_DIR / "gradio_new.py").exists()


def generate_orbit(image_path: Path, output_dir: Path) -> Path:
    """Generate novel views using a locally installed Zero123 pipeline.

    This is an integration boundary. Zero123's original repository does not
    expose a stable CLI contract for arbitrary orbit export, so a compatible
    runner named export_orbit.py is expected inside ZERO123_DIR. Keeping this
    explicit prevents fake/synthetic placeholder frames from being presented
    as AI output.
    """
    runner = ZERO123_DIR / "export_orbit.py"
    if not installed():
        raise RuntimeError("Zero123 nije instaliran. Postavi ZERO123_DIR na lokalni Zero123 repo.")
    if not runner.exists():
        raise RuntimeError("Nedostaje Zero123 export_orbit.py adapter za izvoz 360° pogleda.")
    output_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "python", str(runner), "--input", str(image_path),
        "--output", str(output_dir), "--views", "24"
    ], cwd=str(ZERO123_DIR), check=True)
    return output_dir
