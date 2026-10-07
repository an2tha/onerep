"""Original folded-glass brain, with compatible topic and breathing shapes."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/web/static/sculptures'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
root = bpy.data.objects.new('Brain', None)
scene.collection.objects.link(root)

def glass(name, color):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    node = material.node_tree.nodes['Principled BSDF']
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = .12
    node.inputs['Transmission Weight'].default_value = .92
    node.inputs['IOR'].default_value = 1.46
    node.inputs['Coat Weight'].default_value = 1
    return material

materials = [glass('Accent cerebral glass', (.52, .72, .88)),
             glass('Clear cerebral glass', (.82, .92, 1))]
LAT, LON = 56, 104

def surface(theta, phi, side, mode=0):
    # A medial cleft, broad crown and tapered lower lobes give a cerebral
    # silhouette. Warped folds avoid both an anatomical replica and a grid.
    u = math.sin(theta) * math.cos(phi)
    v = math.sin(theta) * math.sin(phi)
    w = math.cos(theta)
    phase = .55 if mode == 1 else -.45 if mode == 2 else .18 if mode == 3 else 0
    folds = (.063 * math.cos(12 * theta + 2.2 * math.sin(3 * phi) + phase)
             + .034 * math.sin(10 * phi + 2.1 * math.sin(4 * theta) - phase))
    folds *= math.sin(theta) ** .65
    radius = 1 + folds
    # Flatten the medial walls so the two lobes share one silhouette, with a
    # narrow central cleft instead of looking like two disconnected volumes.
    x = side * (.045 + 1.62 * max(u, 0) * radius)
    y = 1.07 * v * radius
    z = 1.19 * w * radius + .12 - .12 * v
    x *= 1 - .12 * max(-w, 0)
    if mode == 1:
        x *= 1.12
        z *= .88
        y += .12 * math.sin(theta * 2 + side * phi)
    elif mode == 2:
        x *= .88
        z *= 1.1
        y += .19 * math.sin(theta * 2) * side
    elif mode == 3:
        x *= 1.035
        z *= 1.04
        y += .06 * math.sin(phi * 2 + theta * 3)
    return x, y, z

for index, side in enumerate([-1, 1]):
    params = [(i / LAT * math.pi, j / LON * math.tau)
              for i in range(LAT + 1) for j in range(LON)]
    vertices = [surface(t, p, side) for t, p in params]
    faces = []
    for i in range(LAT):
        for j in range(LON):
            # Open medial shells keep the center optically clear. A flat
            # closing wall would become a bright slab through the glass.
            if math.cos((j + .5) / LON * math.tau) < 0:
                continue
            a, b = i * LON + j, i * LON + (j + 1) % LON
            face = (a, b, b + LON, a + LON)
            faces.append(face if side == -1 else tuple(reversed(face)))
    mesh = bpy.data.meshes.new('Cerebral folds')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('Left hemisphere' if side < 0 else 'Right hemisphere', mesh)
    scene.collection.objects.link(obj)
    obj.parent = root
    mesh.materials.append(materials[index])
    for face in mesh.polygons:
        face.use_smooth = True
    obj.shape_key_add(name='Basis')
    for mode, name in [(1, 'Nourish'), (2, 'Focus'), (3, 'Breathe')]:
        shape = obj.shape_key_add(name=name)
        for i, (theta, phi) in enumerate(params):
            shape.data[i].co = surface(theta, phi, side, mode)

bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for obj in root.children:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'coach-brain.glb'), use_selection=True,
                         export_morph=True, export_morph_normal=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'output/coach-brain.blend'))

# A matching transparent poster remains available without WebGL.
for name, location, power, size in [('Key', (-3, -4, 5), 1100, 4),
                                    ('Rim', (4, 1, 3), 1500, 3),
                                    ('Fill', (0, -5, 0), 500, 3)]:
    light = bpy.data.lights.new(name, 'AREA')
    light.energy, light.size = power, size
    obj = bpy.data.objects.new(name, light)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (-obj.location).to_track_quat('-Z', 'Y').to_euler()
world = bpy.data.worlds.new('Pearl studio')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.3, .4, .53, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .55
scene.world = world
camera = bpy.data.cameras.new('Camera')
camera.type, camera.ortho_scale = 'ORTHO', 4.5
cam = bpy.data.objects.new('Camera', camera)
scene.collection.objects.link(cam)
scene.camera = cam
cam.location = (3.2, -8, 2.7)
cam.rotation_euler = (Vector((0, 0, .1)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.cycles.film_transparent_glass = True
scene.cycles.film_transparent_roughness = .2
scene.render.resolution_x = scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = str(ROOT / 'output/coach-brain.png')
bpy.ops.render.render(write_still=True)
