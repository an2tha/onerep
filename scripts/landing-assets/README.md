# Original OneRep landing assets

The assets are authored procedurally in Blender with Python. No stock models or external generators are used. `create.py` creates a separate scene and exports the GLB before arranging any poster poses. Each model has a named root and merged mesh children to reduce browser draw calls.

The library includes a branded dumbbell, plate, shaker, ball, orbit, progress rings, phone shell, apple, floating terrain, fir tree, boulder, cloud, sun, and wildflower. Three.js assembles the landscape from instances and adds the real app screen textures.

## Regenerate

Run from a clean Blender session using Blender's Python console:

```python
from pathlib import Path
root = Path('/Users/ananth/Documents/Code/onerep')
for name in ['create.py', 'render.py']:
    source = root / 'scripts/landing-assets' / name
    exec(compile(source.read_text(), str(source), 'exec'), {'__file__': str(source)})
```

Change `root` for your checkout. This exports `apps/web/static/sculptures/onerep-sculptures.glb`, renders four transparent PNGs into `output/landing-assets`, and saves the editable landscape as `output/onerep-sculptures.blend`.

Convert the rendered PNGs to browser WebP assets with Pillow:

```python
from pathlib import Path
from PIL import Image
root = Path('/Users/ananth/Documents/Code/onerep')
for name in ['nature-poster', 'dumbbell', 'nutrition', 'progress']:
    Image.open(root / 'output/landing-assets' / f'{name}.png').save(
        root / 'apps/web/static/sculptures' / f'{name}.webp',
        quality=88, method=6,
    )
```

Commit the generator scripts, GLB, and WebP assets. Native Blender files and intermediate renders live in the ignored `output` directory. The runtime paths and responsive composition are in `apps/web/src/landing-scene.ts`.

## Product chapter sculptures

`chapters.py` is a separate generator so the approved hero is preserved. It produces 11 additional original sculptures, seven transparent poster compositions, and an editable asset library.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/landing-assets/chapters.py
for art in output/landing-assets/chapters/*-world.png; do
  cwebp -quiet -q 88 -m 6 "$art" -o "apps/web/static/sculptures/$(basename "${art%.png}").webp"
done
```

The generator saves `output/onerep-chapters.blend` and `static/sculptures/onerep-chapters.glb`. `apps/web/src/chapter-world.ts` arranges the live compositions, sets their section clipping planes, and changes the theme ribbon's material. `sculpture-backgrounds.css` controls their foreground and fallback layers. The existing motion pause and reduced-motion preference apply to every decorative sculpture.

## Detailed studio variants

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/landing-assets/studio.py
```

The generator reuses the equipment construction and adds detailed foliage, shaped fruit, smooth organic geometry and UVs for microscopic surface relief. It writes `onerep-sculptures-studio.glb` and `onerep-chapters-studio.glb` beside the original files, plus editable `.blend` libraries under `output`. It does not overwrite the low poly exports or posters. These libraries now serve as source geometry for the glass-only presentation. They are no longer loaded by the landing page.

## Earlier literal glass presentation

Run `studio.py` first if the native studio libraries do not exist, then:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/landing-assets/glass.py
```

This creates two separate `*-glass.glb` libraries, editable `.blend` files under `output`, and eleven transparent PNG posters under `output/landing-assets/glass`. Convert the posters with Pillow to `static/sculptures/glass/*.webp` using quality 86 and method 2. The glass generator replaces the faceted landscape and needle-heavy trees with smooth terraces and sculpted glass botanicals. Earlier libraries remain as source history only.

That earlier version loaded the glass GLBs and glass fallback images. `glass-materials.ts` owns the optical properties; `glass-environment.ts` authors the studio reflection environment; `glass-backdrop.ts` supplies section colours to the offscreen refraction pass without covering the DOM.

## Current abstract presentation

The current page uses `abstract.py`, replacing all literal decorative props and the glass rendering pipeline:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/landing-assets/abstract.py
```

It independently builds seven smooth forms (Tension, Nourish, Rise, Connection, Ribbon, Balance and Bloom), writes `static/sculptures/onerep-abstract.glb`, and saves the editable native file at `output/onerep-abstract.blend`. Eight PNG posters are written to `output/landing-assets/abstract`. Convert those to `static/sculptures/abstract/*.webp` with Pillow, quality 86, method 2.

Only this compact library and its posters load on the page. The older workflows above remain documented as source history. `landing-scene.ts` owns the single-pass translucent materials, restrained deformation and scroll positioning. `sculpture-environment.ts` supplies the fixed studio reflection environment.

The abstract forms use tinted transparent surfaces, with view-angle opacity and studio reflections in the live renderer. Blender uses transmissive glass and transparent-glass film for the matching fallback images. The live renderer composites directly over the page without a refraction framebuffer, keeping theme changes immediate.
