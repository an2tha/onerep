"""Build a separate, detailed studio library while preserving the low poly assets.
Run with Blender --background --python scripts/landing-assets/studio.py.
"""
import bpy, math, random
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/web/static/sculptures'


def export_library(namespace, name):
    roots = namespace['roots']
    for parent in roots.values():
        bpy.ops.object.select_all(action='DESELECT')
        children = list(parent.children)
        for obj in children: obj.select_set(True)
        bpy.context.view_layer.objects.active = children[0]
        bpy.ops.object.convert(target='MESH')
        bpy.ops.object.join()
        obj = bpy.context.object
        # A UV set for the browser's microscopic surface textures.
        if not obj.data.uv_layers:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.01)
            bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    for parent in roots.values():
        parent.select_set(True)
        for child in parent.children: child.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + '.glb')), use_selection=True, export_apply=True)
    for i, parent in enumerate(roots.values()):
        parent.location = ((i % 5) * 7, (i // 5) * 7, 0)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'output' / (name + '.blend')))


# Reuse the original equipment construction, retaining brand engravings and dimensions.
bpy.ops.wm.read_factory_settings(use_empty=True)
source = (ROOT / 'scripts/landing-assets/create.py').read_text().split('# Apply bevels and merge')[0]
source = source.replace('major_segments=48, minor_segments=8', 'major_segments=96, minor_segments=16')
ns = {'__file__': str(ROOT / 'scripts/landing-assets/create.py')}
exec(compile(source, 'create.py', 'exec'), ns)
roots, scene = ns['roots'], ns['scene']


def clear_children(parent):
    for child in list(parent.children): bpy.data.objects.remove(child, do_unlink=True)


def finish(obj, parent, mat):
    obj.parent = parent
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons: polygon.use_smooth = True
    return obj


def sphere(parent, mat, loc, scale, name):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=40, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    finish(obj, parent, mat)
    return obj


def blade(parent, origin, direction, length, width, mat):
    origin, forward = Vector(origin), Vector(direction).normalized()
    side = forward.cross(Vector((0,1,0))).normalized()
    verts, faces = [], []
    for i in range(25):
        t = i/24
        middle = origin + forward*length*t + Vector((0, -.12*math.sin(t*math.pi), .1*math.sin(t*math.pi)))
        for j in range(9):
            u = (j-4)/4
            verts.append(tuple(middle + side*(u*width*math.sin(math.pi*t)**.7) + Vector((0, .08*u*u*math.sin(t*math.pi),0))))
    for i in range(24):
        for j in range(8):
            k = i*9+j
            faces.append((k,k+1,k+10,k+9))
    mesh = bpy.data.meshes.new('Curved leaf surface'); mesh.from_pydata(verts, [], faces); mesh.update()
    obj = bpy.data.objects.new('Leaf lamina', mesh); scene.collection.objects.link(obj)
    finish(obj, parent, mat)
    solid = obj.modifiers.new('Leaf thickness', 'SOLIDIFY'); solid.thickness=.006
    # A raised central vein follows the curvature of the blade.
    curve = bpy.data.curves.new('Leaf vein', 'CURVE'); curve.dimensions='3D'; curve.bevel_depth=.008; curve.bevel_resolution=2
    spline=curve.splines.new('POLY'); spline.points.add(24)
    for i,p in enumerate(spline.points):
        v=Vector(verts[i*9+4]);v.y-=.009;p.co=(*v,1)
    obj=bpy.data.objects.new('Leaf vein',curve);scene.collection.objects.link(obj);obj.parent=parent;curve.materials.append(ns['forest_light'])


apple = roots['Apple']; clear_children(apple)
obj = sphere(apple, ns['red'], (0,0,0), (1,1,1), 'Dimpled apple skin')
for vertex in obj.data.vertices:
    v = vertex.co.copy(); theta=math.atan2(v.y,v.x)
    radial=.44*(1+.035*math.cos(5*theta)*abs(v.z)**3)
    vertex.co.x=v.x*radial;vertex.co.y=v.y*radial
    vertex.co.z=v.z*.43 - .085*math.exp(-((v.x*v.x+v.y*v.y)/.10))*(1 if v.z>0 else -.4)
ns['cylinder']('Apple stem', apple, .026, .20, (0,0,.42), ns['wood'], bevel=.008, vertices=20)
blade(apple,(0,0,.49),(.8,0,.25),.42,.13,ns['forest'])

# Fir branches have hundreds of individually tapered needle clusters, one mesh.
tree = roots['FirTree']; clear_children(tree)
ns['cylinder']('Tapered bark trunk',tree,.075,2.2,(0,0,1.1),ns['wood'],bevel=.025,vertices=24)
rng=random.Random(47)
verts, faces=[],[]
for layer in range(13):
    z=.35+layer*.15; radius=.78*(1-layer/14)
    for arm in range(9):
        a=arm*math.tau/9+layer*.77
        start=Vector((0,0,z)); end=Vector((math.cos(a)*radius,math.sin(a)*radius,z-.1))
        for tuft in range(9):
            t=(tuft+1)/10; center=start.lerp(end,t)
            for needle in range(6):
                b=a+needle*math.tau/6+rng.uniform(-.25,.25)
                length=.11+rng.random()*.10
                tip=center+Vector((math.cos(b)*length,math.sin(b)*length,.08+rng.random()*.06))
                side=Vector((-math.sin(b)*.012,math.cos(b)*.012,0))
                k=len(verts);verts.extend([tuple(center-side),tuple(center+side),tuple(tip),tuple(center+Vector((0,0,.012)))])
                faces.extend([(k,k+1,k+2),(k+1,k+3,k+2),(k+3,k,k+2)])
mesh=bpy.data.meshes.new('Individual evergreen needles');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('Evergreen branches',mesh);scene.collection.objects.link(obj);finish(obj,tree,ns['forest'])
mesh.materials.append(ns['forest_light'])
for p in mesh.polygons: p.material_index=1 if rng.random()<.14 else 0

# Round the landscape and give rocks an irregular, eroded surface.
for name in ['Terrain','Boulder','Cloud','Sun','Flower']:
    for obj in roots[name].children:
        if obj.type!='MESH': continue
        for p in obj.data.polygons:
            p.use_smooth=True
            if name == 'Terrain':p.material_index=0 if p.material_index<5 else 5
        if name in ['Terrain','Boulder','Cloud','Sun']:
            mod=obj.modifiers.new('Eroded smooth surface','SUBSURF');mod.levels=2;mod.render_levels=2
        if name in ['Terrain','Boulder']:
            texture=bpy.data.textures.new(name+' mineral relief','CLOUDS');texture.noise_scale=.18
            mod=obj.modifiers.new('Natural surface relief','DISPLACE');mod.texture=texture;mod.strength=.045;mod.texture_coords='GLOBAL'
export_library(ns, 'onerep-sculptures-studio')

# Chapter library: smooth organic forms, turned porcelain and continuous ribbons.
bpy.ops.wm.read_factory_settings(use_empty=True)
source=(ROOT/'scripts/landing-assets/chapters.py').read_text().split('# Convert curves/modifiers')[0]
source=source.replace('segments=48, smooth=True','segments=96, smooth=True')
source=source.replace('yellow,16,False','yellow,64,True').replace('ink,32','ink,96').replace('lime,32','lime,96')
source=source.replace('bevel_resolution = 3','bevel_resolution = 6')
source=source.replace("normal=radial.cross(Vector((-math.sin(t),0,math.cos(t)))).normalized()", "normal=radial*(-math.sin(t))+Vector((0,1,0))*math.cos(t)")
source=source.replace('mat, False)','mat, True)').replace('sub=2','sub=3')
ns={'__file__':str(ROOT/'scripts/landing-assets/chapters.py')}
exec(compile(source,'chapters.py','exec'),ns)
for parent in ns['roots'].values():
    for obj in parent.children:
        if obj.type != 'MESH':continue
        if obj.name.startswith(('Folded leaf','Folded continuous','Lathed')):
            for p in obj.data.polygons:p.use_smooth=True
            sub=obj.modifiers.new('Continuous organic surface','SUBSURF');sub.levels=2;sub.render_levels=2
        elif 'stone' not in obj.name.lower():
            for p in obj.data.polygons:p.use_smooth=True
export_library(ns,'onerep-chapters-studio')
print('Both detailed studio libraries exported. Original low poly GLBs preserved.')
