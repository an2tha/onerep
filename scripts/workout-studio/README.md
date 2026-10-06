# Workout studio

Metric-scale Blender gym for the guided workout creator. The browser loads a real GLB with camera stations, baked diffuse lighting, normal maps, roughness maps and an HDR reflection probe rendered inside this room. Ten emissive blue segments on a suspended ceiling luminaire fill with interview progress. Loading pulses the segments and animates a practical light with a gentle camera move.

Regenerate from the repository root:

```sh
python3 scripts/workout-studio/fetch_materials.py
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/workout-studio/build_room.py
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/workout-studio/render_reflections.py
python3 scripts/workout-studio/package_assets.py
```

`package_assets.py` needs Pillow. Source renders stay locally in the Git-ignored `baked/` directory. Downloaded textures in `textures/` and the generated `studio.blend` are also ignored. Only `studio.glb`, `studio-reflections.hdr` and `studio-poster.webp` are served by the app and tracked as binary assets. Lightmaps travel in glTF's emissive texture slot with `studioLightmap` material metadata. `StudioScene` moves them to the lightMap slot and removes their emissive contribution. Do not remove this conversion.

Architecture and equipment geometry are authored in `build_room.py`. Concrete Wall 009, Rubber Tiles and Fabric Leather 02 are [Poly Haven CC0 assets](https://polyhaven.com/license). The floor uses authored EPDM grain and normal/roughness maps at metric scale; the Rubber Tiles scan can be fetched again with `fetch_materials.py`. Its download URLs are recorded in the generated manifests in `textures/`. Colors are darkened for the graphite room. Equipment microfinish maps are authored procedurally, with restrained tangent-space normal detail and spatial roughness.

The renderer targets 60fps while moving and submits no frames while settled or hidden. One 2048px key-light shadow map is rendered on load and reused during camera movement. It keeps strong equipment silhouettes over the diffuse bake without rerendering the room into a shadow map each frame. The working light is dynamic. LED glow uses ten depth-tested additive quads, with no full-screen postprocessing. This is a performance-conscious realtime scene; visual realism and framerate still depend on device and resolution.

Connect the lightmaps to glTF transport emission only after **all** Cycles bakes finish. Connecting them during the loop makes earlier materials emit extra light into later bakes and washes out contact shadows. The ceiling uses its own scanned concrete material.

## Standalone onboarding pavilion

Onboarding uses its own Blender-authored pavilion with four furnished stations,
low plaster walls, oak vaults and forty physical LED segments. Poly Haven CC0
scans supply concrete, plaster, fine wood grain, rubber, wool, gravel and a
textured potted plant. Modular bench slats, a leather lounge chair and modern
armchairs preserve the detailed source geometry and UVs. Sunset Forest supplies the photographed HDR skybox and
reflection environment. Asset provenance is recorded beside the public files.

Fetch the reproducible source assets first:

```sh
python3 scripts/workout-studio/fetch_pavilion_assets.py
```

Run through live Blender MCP `execute_blender_code`:

```python
__file__ = "/path/to/onerep/scripts/workout-studio/build_pavilion.py"
exec(compile(open(__file__).read(), __file__, "exec"))
```

Then package the fresh export once:

```sh
python3 scripts/workout-studio/package_assets.py ../onboarding-pavilion/pavilion.glb
```

The local source is saved as `pavilion.blend`. Source downloads and Blender
files are ignored and regenerated from these scripts. The public GLB is about
29.3 MB and the HDR is 7.3 MB. Packaging preserves foliage alpha, uses WebP,
and caps color/normal maps at 1024px and roughness maps at 512px.

Four floor AO maps are baked in Cycles and exported in native glTF occlusion
slots with their own UV coordinates. Runtime adds cached 2048px directional
and 1024px spotlight shadows. Scanned base color, normal and roughness maps
remain active in both appearances. Lighting and sky intensity interpolate
with the app appearance; accent lights follow the selected identity.
Rendering stops after motion settles and while hidden, with DPR capped at
1.25. Reduced motion snaps to the selected appearance and station. This is
a real-time approximation, not an offline path-traced render.
