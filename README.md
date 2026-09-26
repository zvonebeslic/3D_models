# 3D Models Lab

Eksperimentalni image-to-3D projekt.

## Trenutno
- responsive web UI
- upload i preview fotografije
- drag & drop
- GLB/GLTF 3D viewer s rotacijom, zoomom i AR podrškom gdje je dostupna
- pripremljen pipeline UI

## Planirani pipeline
1. input image
2. foreground/background segmentation
3. consistent multi-view generation
4. camera/view estimation
5. 3D reconstruction
6. mesh cleanup
7. texture refinement
8. GLB export
9. browser rendering

GitHub Pages služi statički frontend i 3D modele. Teški AI inference ne može se pouzdano izvoditi na GitHub Pages server-side, pa AI sloj treba biti lokalni/browser model ili zasebno besplatno compute okruženje.
