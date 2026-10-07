"""OneRep's original landing sculptures. Run with Blender's Python API.
Creates a separate scene, exports a compact GLB library and a transparent poster.
No downloaded or generated assets. The original open scene is preserved.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/web/static/sculptures'
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new('OneRep Sculptures')
bpy.context.window.scene = scene

def material(name, colour, metal=0.0, roughness=0.3):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*colour, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = roughness
    mat.diffuse_color = (*colour, 1)
    return mat

chrome = material('Brushed titanium', (0.52, 0.57, 0.51), 0.92, 0.22)
ink = material('Forest rubber', (0.022, 0.045, 0.028), 0.15, 0.42)
lime = material('Volt enamel', (0.64, 0.91, 0.12), 0.22, 0.23)
chalk = material('Warm chalk ceramic', (0.88, 0.88, 0.77), 0.05, 0.3)
orange = material('Clay enamel', (0.83, 0.27, 0.1), 0.12, 0.28)

roots = {}
def root(name):
    previous = bpy.data.objects.get(name)
    if previous and previous.users == 0: previous.name = name + ' previous export'
    obj = bpy.data.objects.new(name, None)
    obj['onerep_sculpture'] = True
    scene.collection.objects.link(obj)
    roots[name] = obj
    return obj

def finish(obj, name, parent, mat, bevel=0):
    obj.name = name
    obj.parent = parent
    if mat: obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Machined edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
    if obj.type == 'MESH':
        for face in obj.data.polygons: face.use_smooth = True
        mod = obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
    return obj

def cylinder(name, parent, radius, depth, loc, mat, axis='Z', bevel=0.035, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    if axis == 'X': obj.rotation_euler[1] = math.pi/2
    if axis == 'Y': obj.rotation_euler[0] = math.pi/2
    return finish(obj, name, parent, mat, bevel)

def box(name, parent, size, loc, mat, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, parent, mat, bevel)

def torus(name, parent, radius, tube, loc, mat, front=False):
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=8, location=loc, major_radius=radius, minor_radius=tube)
    obj=bpy.context.object
    if front: obj.rotation_euler[0] = math.pi/2
    return finish(obj, name, parent, mat)

def label(name, parent, text, size, loc, mat, rot=(math.pi/2,0,0)):
    curve=bpy.data.curves.new(name, 'FONT')
    curve.body=text
    curve.size=size
    curve.align_x='CENTER'
    curve.align_y='CENTER'
    curve.extrude=0.003
    curve.bevel_depth=0.001
    obj=bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    obj.location=loc
    obj.rotation_euler=rot
    obj.parent=parent
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj

# A plate-loaded dumbbell with real collars, grip grooves and embossed endcaps.
r=root('Dumbbell')
cylinder('Titanium grip',r,0.13,1.55,(0,0,0),chrome,'X',0.015)
for i in range(27):
    obj=torus('Grip knurl %02d'%i,r,0.132,0.008,(-0.55+i*0.042,0,0),ink)
    obj.rotation_euler[1]=math.pi/2
for sign in [-1,1]:
    cylinder('Steel collar',r,0.25,0.15,(sign*0.7,0,0),chrome,'X')
    for i,rad in enumerate([0.69,0.76,0.70]):
        cylinder('Weight stack',r,rad,0.20,(sign*(0.85+i*0.23),0,0),ink,'X',0.045)
    cylinder('Volt end cap',r,0.59,0.055,(sign*1.43,0,0),lime,'X',0.025)
    cylinder('End bolt',r,0.105,0.065,(sign*1.47,0,0),chrome,'X',0.015)
    label('Endcap brand',r,'ONE REP',0.13,(sign*1.466,0,0.30),ink,(0,sign*math.pi/2,0))
    label('Endcap weight',r,'12.5',0.16,(sign*1.466,0,-0.28),ink,(0,sign*math.pi/2,0))

# Annular weight plate with an open bore and concentric cast edges.
r=root('WeightPlate')
verts=[]; faces=[]
profile=[(0.20,-0.12),(0.87,-0.12),(0.94,-0.07),(0.94,0.07),(0.87,0.12),(0.20,0.12)]
for rad,z in profile:
    for i in range(96):
        a=2*math.pi*i/96
        verts.append((rad*math.cos(a),z,rad*math.sin(a)))
for p in range(len(profile)):
    for i in range(96):
        j=(i+1)%96; q=(p+1)%len(profile)
        faces.append((p*96+i,p*96+j,q*96+j,q*96+i))
mesh=bpy.data.meshes.new('Cast annular plate');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('Plate',mesh);scene.collection.objects.link(obj)
finish(obj,'Plate',r,lime,0.015)
for rad in [0.28,0.76,0.84]: torus('Raised rim',r,rad,0.014,(0,-0.13,0),ink,True)
label('Plate brand',r,'ONE REP',0.15,(0,-0.14,0.53),ink)
label('Plate weight',r,'20 KG',0.13,(0,-0.14,-0.52),ink)
for x in [-0.54,0.54]:box('Plate grip',r,(0.035,0.025,0.21),(x,-0.14,0),ink,0.009)

# Tapered bottle, a ribbed screw lid and flip spout.
r=root('Shaker')
bpy.ops.mesh.primitive_cone_add(vertices=80,radius1=0.41,radius2=0.48,depth=1.52,location=(0,0,-0.06))
finish(bpy.context.object,'Bottle body',r,chalk,0.055)
cylinder('Bottle foot',r,0.405,0.06,(0,0,-0.84),ink)
cylinder('Lid',r,0.49,0.26,(0,0,0.81),lime)
for i in range(40):
    a=i*2*math.pi/40
    obj=box('Lid rib',r,(0.025,0.045,0.16),(0.489*math.cos(a),0.489*math.sin(a),0.81),lime,0.01)
    obj.rotation_euler[2]=a
cylinder('Spout',r,0.14,0.20,(0,-0.22,1.02),ink)
box('Flip cap',r,(0.30,0.48,0.07),(0,-0.11,1.14),lime,0.035)
label('Bottle wordmark',r,'ONE\nREP',0.26,(0,-0.47,0.07),ink)
label('Bottle volume',r,'600 ML',0.075,(0,-0.444,-0.54),ink)
for i in range(5):box('Volume tick',r,(0.09 if i%2==0 else 0.05,0.012,0.013),(0.27,-0.365,-0.43+i*0.17),ink,0.005)

# Three concentric activity arcs, each with a machined rounded end.
r=root('ProgressRings')
def arc(name, radius, tube, end, mat):
    verts=[];faces=[]
    n=96; sides=10
    for i in range(n+1):
        a=math.radians(25)+(end-math.radians(25))*i/n
        for j in range(sides):
            b=2*math.pi*j/sides
            verts.append(((radius+tube*math.cos(b))*math.cos(a),tube*math.sin(b),(radius+tube*math.cos(b))*math.sin(a)))
    for i in range(n):
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);finish(obj,name,r,mat)
    for a in [math.radians(25),end]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=tube,location=(radius*math.cos(a),0,radius*math.sin(a)))
        finish(bpy.context.object,'Rounded arc end',r,mat)
for rad,end,mat in [(0.94,345,lime),(0.70,300,chalk),(0.46,250,orange)]:arc('Activity arc',rad,0.085,math.radians(end),mat)

# Brushed loop and a soft weighted ball add scale and depth around the equipment.
r=root('Orbit')
obj=torus('Elliptical titanium loop',r,1.65,0.085,(0,0,0),chrome,True)
obj.scale=(1,1,1.18)
r=root('Ball')
bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,radius=0.36)
finish(bpy.context.object,'Lacrosse ball',r,orange)
for z in [-0.12,0.12]:torus('Ball seam',r,math.sqrt(0.36**2-z*z),0.006,(0,0,z),ink)

# Blank device shell. Three.js adds a real captured screen, never invented UI.
r=root('Phone')
box('Titanium device',r,(1.36,0.12,2.89),(0,0,0),chrome,0.12)
box('Black bezel',r,(1.30,0.035,2.82),(0,-0.069,0),ink,0.1)
box('Power button',r,(0.035,0.055,0.31),(0.69,0,0.47),chrome,0.015)
for z in [0.40,0.08]:box('Volume button',r,(0.035,0.055,0.20),(-0.69,0,z),chrome,0.012)

# Low-poly nature kit, authored from simple meshes with flat face colours.
import random
rng = random.Random(7)
forest = material('Pine needles', (0.055, 0.19, 0.08), 0, 0.85)
forest_light = material('New pine growth', (0.13, 0.30, 0.10), 0, 0.9)
wood = material('Warm bark', (0.19, 0.09, 0.045), 0, 0.95)
rock = material('River stone', (0.31, 0.36, 0.28), 0, 0.9)
red = material('Apple skin', (0.66, 0.11, 0.055), 0, 0.5)
sky = material('Cloud chalk', (0.91, 0.93, 0.85), 0, 1)
gold = material('Afternoon sun', (0.92, 0.65, 0.19), 0, 0.9)
grass_mats=[material('Meadow facet '+str(i),(0.22+i*0.025,0.34+i*0.027,0.12+i*0.015),0,1) for i in range(5)]
earth_mats=[material('Earth facet '+str(i),(0.17+i*0.025,0.23+i*0.02,0.12+i*0.014),0,1) for i in range(4)]
r=root('Terrain')
vertices=[(0,0,0.21)]
for ring in range(3):
    for i in range(16):
        a=2*math.pi*i/16
        radius=[1.4,2.65,1.35][ring]*(1+rng.uniform(-0.1,0.1))
        z=[0.10,-0.02,-1.0][ring]+rng.uniform(-0.12,0.12)
        vertices.append((radius*math.cos(a),radius*math.sin(a)*0.72,z))
vertices.append((0,0,-1.5))
faces=[]
for i in range(16):faces.append((0,1+i,1+(i+1)%16))
for ring in range(2):
    for i in range(16):
        a=1+ring*16+i;b=1+ring*16+(i+1)%16;c=a+16;d=b+16
        faces.extend([(a,c,b),(b,c,d)])
for i in range(16):faces.append((33+i,49,33+(i+1)%16))
mesh=bpy.data.meshes.new('Triangulated floating meadow');mesh.from_pydata(vertices,[],faces);mesh.update()
obj=bpy.data.objects.new('Floating meadow',mesh);scene.collection.objects.link(obj);obj.parent=r
for mat in grass_mats+earth_mats:mesh.materials.append(mat)
for i,face in enumerate(mesh.polygons):face.material_index=rng.randrange(5) if i<48 else 5+rng.randrange(4)
r=root('FirTree')
cylinder('Tree trunk',r,0.13,1.0,(0,0,0.50),wood,bevel=0,vertices=7)
for i,(rad,z,depth) in enumerate([(0.70,1.0,1.25),(0.56,1.5,1.1),(0.38,1.95,1.0)]):
    bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=rad,radius2=0,depth=depth,location=(0,0,z))
    finish(bpy.context.object,'Pine tier',r,forest if i%2==0 else forest_light)
r=root('Boulder')
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=0.50)
obj=bpy.context.object;obj.scale=(1.2,0.9,0.7);finish(obj,'Faceted river stone',r,rock)
r=root('Apple')
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=0.44,location=(0,0,0))
obj=bpy.context.object;obj.scale=(1,1,0.95);finish(obj,'Apple body',r,red)
cylinder('Apple stem',r,0.038,0.22,(0,0,0.46),wood,bevel=0,vertices=6)
verts=[(0,0,0.47),(0.24,0.01,0.66),(0.40,0,0.55),(0.22,-0.12,0.52)]
mesh=bpy.data.meshes.new('Apple leaf');mesh.from_pydata(verts,[],[(0,1,2),(0,2,3)]);mesh.update()
obj=bpy.data.objects.new('Apple leaf',mesh);scene.collection.objects.link(obj);obj.parent=r;mesh.materials.append(forest_light)
r=root('Cloud')
for loc,scale in [((-0.42,0,0),(0.65,0.32,0.36)),((0,0,0.17),(0.64,0.4,0.48)),((0.48,0,0),(0.59,0.34,0.33))]:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=loc)
    obj=bpy.context.object;obj.scale=scale;finish(obj,'Cloud facet',r,sky)
r=root('Sun')
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=0.72)
finish(bpy.context.object,'Sun',r,gold)
r=root('Flower')
cylinder('Flower stem',r,0.015,0.30,(0,0,0.15),forest,bevel=0,vertices=5)
for i in range(5):
    a=i*2*math.pi/5
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=0.07,location=(0.065*math.cos(a),0.065*math.sin(a),0.34))
    finish(bpy.context.object,'Wildflower petal',r,chalk)
for name in ['Terrain','FirTree','Boulder','Apple','Cloud','Sun','Flower']:
    for obj in roots[name].children:
        if obj.type=='MESH':
            for face in obj.data.polygons:face.use_smooth=False

# Apply bevels and merge each sculpture to keep browser draw calls low.
for parent in roots.values():
    bpy.ops.object.select_all(action='DESELECT')
    children = [obj for obj in parent.children if obj.type == 'MESH']
    for obj in children: obj.select_set(True)
    bpy.context.view_layer.objects.active = children[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()

# Export before arranging the sculptures. The roots stay at their local origin.
bpy.ops.object.select_all(action='DESELECT')
for parent in roots.values():
    parent.select_set(True)
    for obj in parent.children: obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'onerep-sculptures.glb'),use_selection=True,export_apply=True)
print('EXPORTED',OUT/'onerep-sculptures.glb')

# Art-directed still, also used when WebGL or JavaScript is unavailable.
poses={
'Dumbbell':((0.22,-0.35,0.0),(0.2,-0.35,-0.48),(1.1,1.1,1.1)),
'WeightPlate':((1.40,0.42,1.35),(0.15,-0.25,-0.2),(0.78,0.78,0.78)),
'Shaker':((-1.32,-0.20,-0.86),(-0.12,-0.22,0.25),(0.75,0.75,0.75)),
'ProgressRings':((1.37,-0.02,-1.16),(-0.15,0.2,-0.2),(0.64,0.64,0.64)),
'Orbit':((0,0.85,0),(0.25,0.25,-0.2),(1.12,1.12,1.12)),
'Ball':((-1.56,0.02,1.05),(0,0,0),(0.80,0.80,0.80)),
'Phone':((0,4,0),(0,0,0),(1,1,1))}
for obj in [roots['Phone'], *roots['Phone'].children]: obj.hide_render=True
for name in ['Terrain','FirTree','Boulder','Apple','Cloud','Sun','Flower']:
    for obj in [roots[name],*roots[name].children]: obj.hide_render=True
for name,(loc,rot,scale) in poses.items():
    roots[name].location=loc;roots[name].rotation_euler=rot;roots[name].scale=scale

def area(name,loc,power,size,colour):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=colour
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Large softbox',(-3,-4,6),1100,5,(1,1,0.90))
area('Right strip',(4,-1,2),900,3,(0.82,1,0.78))
area('Back edge',(0,3,3),1300,3,(1,1,1))
world=bpy.data.worlds.new('Chalk studio');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(0.5,0.55,0.46,1);bg.inputs[1].default_value=0.45
scene.world=world
cam_data=bpy.data.cameras.new('Sculpture camera');cam=bpy.data.objects.new('Sculpture camera',cam_data);scene.collection.objects.link(cam)
cam.location=(0,-9,3.2);cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam_data.type='ORTHO';cam_data.ortho_scale=5.6;scene.camera=cam
try:scene.render.engine='CYCLES'
except TypeError:pass
scene.cycles.samples=24
scene.render.resolution_x=1200;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.film_transparent=True
formats=[i.identifier for i in scene.render.image_settings.bl_rna.properties['file_format'].enum_items]
if 'PNG' in formats:scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.render.filepath=str(OUT/'sculptures-poster.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'output/onerep-sculptures.blend'))
print('SCENE READY',len(scene.objects),'objects')
