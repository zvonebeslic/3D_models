# Lokalni AI server

Frontend na GitHub Pages je besplatan, ali generativni 3D modeli trebaju GPU. Ovaj direktorij je most između weba i lokalnog image-to-3D enginea.

## Zašto lokalno
GitHub Pages ne izvršava Python/CUDA. Lokalni server omogućuje da nema plaćenog API-ja i da slika ostane na računalu.

## API ugovor
- `GET /health` provjerava server.
- `POST /generate` prima multipart polje `image` i mora vratiti `model/gltf-binary` GLB.

## Pokretanje bridgea
```bash
python -m venv .venv
# aktiviraj virtualno okruženje
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 7861
```

## 3D engine
`server.py` namjerno ne vraća lažni model. U `generate_model()` treba spojiti instalirani image-to-3D engine. TRELLIS.2 je glavni kandidat za kvalitetu, ali zahtijeva snažan NVIDIA GPU i Linux/CUDA okruženje. Alternativni engine možemo adapterom spojiti na isti frontend bez promjene web stranice.

Napomena: HTTPS GitHub Pages preglednici mogu blokirati HTTP localhost pozive ovisno o sigurnosnim pravilima preglednika. Za razvoj se frontend može pokrenuti lokalno (`python -m http.server 8000`), a za udaljeni pristup backend treba siguran HTTPS endpoint.
