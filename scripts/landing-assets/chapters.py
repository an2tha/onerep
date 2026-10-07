"""Additional original sculptures for OneRep's product chapters.
Run in a separate background Blender process. The approved hero is untouched.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/web/static/sculptures'
RENDERS = ROOT / 'output/landing-assets/chapters'
OUT.mkdir(parents=True, exist_ok=True)
RENDERS.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'OneRep Chapter Sculptures'
roots = {}

def material(name, colour, metal=0, roughness=.35):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value = (*colour, 1)
    node.inputs['Metallic'].default_value = metal
    node.inputs['Roughness'].default_value = roughness
    return mat

chalk = material('Warm limestone', (.75, .79, .59), roughness=.62)
cream = material('Porcelain', (.87, .88, .74), roughness=.24)
moss = material('Sculpted moss', (.23, .38, .19), roughness=.65)
lime = material('Celadon enamel', (.57, .75, .28), .14, .28)
leaf = material('Leaf green', (.25, .49, .25), roughness=.50)
yellow = material('Pear skin', (.62, .76, .24), roughness=.43)
clay = material('Terracotta', (.66, .30, .20), roughness=.55)
chrome = material('Brushed alloy', (.53, .61, .46), .85, .24)
ink = material('Forest rubber', (.025, .055, .032), .1, .5)


def root(name):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    roots[name] = obj
    return obj

def mesh(name, parent, verts, faces, mat, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.parent = parent
    data.materials.append(mat)
    for polygon in data.polygons: polygon.use_smooth = smooth
    return obj

def finish(obj, parent, mat, smooth=True):
    obj.parent = parent
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons: polygon.use_smooth = smooth
    return obj

def pebble(parent, loc, scale, mat, sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=1, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    return finish(obj, parent, mat, False)

def tube(parent, coords, radius, mat):
    curve = bpy.data.curves.new('Sculpted tube', 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new('POLY')
    spline.points.add(len(coords)-1)
    for p, co in zip(spline.points, coords): p.co = (*co, 1)
    obj = bpy.data.objects.new('Sculpted tube', curve)
    scene.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    return obj

def lathe(parent, profile, mat, segments=48, smooth=True):
    verts = [(r*math.cos(i*2*math.pi/segments), r*math.sin(i*2*math.pi/segments), z)
             for r,z in profile for i in range(segments)]
    faces = []
    for j in range(len(profile)-1):
        for i in range(segments):
            k=j*segments+i; n=j*segments+(i+1)%segments
            faces.append((k,n,n+segments,k+segments))
    return mesh('Lathed sculpture',parent,verts,faces,mat,smooth)

def contour(parent, z, rx, ry, depth, mat):
    n=72
    outline=[]
    for i in range(n):
        t=i*math.tau/n
        wobble=1+.055*math.sin(3*t)+.045*math.sin(5*t+.5)
        outline.append((rx*math.cos(t)*wobble,ry*math.sin(t)*wobble))
    verts=[(x,y,z+d) for d in [0,depth] for x,y in outline]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    obj=mesh('Contour strata',parent,verts,faces,mat)
    bevel=obj.modifiers.new('Soft stone edges','BEVEL');bevel.width=.07;bevel.segments=3
    return obj

def leaf_blade(parent, origin, direction, length, width, mat):
    forward=Vector(direction).normalized()
    across=forward.cross(Vector((0,1,0))).normalized()
    if across.length < .01: across=Vector((1,0,0))
    origin=Vector(origin)
    verts=[]
    for i in range(13):
        t=i/12
        middle=origin+forward*length*t+Vector((0,-.20*math.sin(math.pi*t),.15*math.sin(math.pi*t)))
        edge=width*math.sin(math.pi*t)**.8
        for u in [-1,0,1]: verts.append(tuple(middle+across*u*edge+Vector((0,.08*abs(u),0))))
    faces=[]
    for i in range(12):
        for j in range(2): faces.append((i*3+j,i*3+j+1,(i+1)*3+j+1,(i+1)*3+j))
    obj=mesh('Folded leaf',parent,verts,faces,mat)
    solid=obj.modifiers.new('Leaf thickness','SOLIDIFY');solid.thickness=.025
    return obj

r=root('TrainingPlatform')
for z,rx,ry,depth,mat in [(-.75,2.8,1.55,.28,chalk),(-.42,2.4,1.3,.28,cream),(-.09,1.98,1.05,.25,chalk)]:
    contour(r,z,rx,ry,depth,mat)
for i in range(5):
    t=(i+.25)*.5
    tube(r,[(2.85*math.cos(a),1.7*math.sin(a),-.80) for a in [t+j*.03 for j in range(80)]],.018,moss)

r=root('Kettlebell')
lathe(r,[(0,-.5),(.48,-.5),(.72,-.1),(.67,.45),(.30,.64),(.24,.68)],ink,32)
tube(r,[(.47*math.cos(t),0,.77+.45*math.sin(t)) for t in [i*math.pi/48 for i in range(49)]],.10,chrome)
lathe(r,[(.29,.55),(.29,.70)],lime,32)

r=root('NutritionBowl')
lathe(r,[(.01,-.55),(.50,-.55),(.85,-.25),(1.15,.18),(1.21,.30),(1.16,.36),(1.10,.28),(.78,-.15),(.43,-.39),(.01,-.39)],cream)
for i in range(3): pebble(r,((i-1)*.4,.12,.25),(.30,.30,.31),yellow)
leaf_blade(r,(.15,.25,.28),(.8,.1,.45),.95,.28,leaf)

r=root('Pear')
lathe(r,[(0,-.60),(.34,-.59),(.53,-.40),(.58,-.05),(.46,.26),(.25,.58),(.18,.72),(.10,.80),(0,.83)],yellow,16,False)
tube(r,[(0,0,.78),(.02,0,.95),(.08,0,1.06)],.035,moss)
leaf_blade(r,(.04,0,.91),(.7,0,.25),.65,.17,leaf)

r=root('LeafSpray')
tube(r,[(0,0,-1.0),(.1,0,0),(.45,0,1.6)],.035,moss)
for origin,direction,length,width in [((.02,0,-.4),(-.9,0,.3),1.05,.29),((.1,0,.05),(.8,0,.6),1.2,.32),((.2,0,.50),(-.75,.1,.55),1.08,.26),((.30,0,.85),(.7,.2,.7),.85,.23)]:
    leaf_blade(r,origin,direction,length,width,leaf)

r=root('ProgressSteps')
for i in range(5):
    bpy.ops.mesh.primitive_cube_add(size=1,location=((i-2)*.75,.1,-.75+(i+1)*.24))
    obj=bpy.context.object;obj.scale=(.71,1.3,(i+1)*.48)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(obj,r,cream if i%2 else chalk,False)
    bevel=obj.modifiers.new('Stone bevel','BEVEL');bevel.width=.11;bevel.segments=3
# A thin raised path joins the ascending steps.
tube(r,[((i-2)*.75,-.70,-.73+(i+1)*.48) for i in range(5)],.045,lime)

r=root('CoachKnot')
coords=[]
for i in range(241):
    t=i*math.tau/240
    coords.append(((1.5+.44*math.cos(3*t))*math.cos(2*t),.65*math.sin(3*t), (1.5+.44*math.cos(3*t))*math.sin(2*t)))
tube(r,coords,.20,lime)

r=root('SignalOrb')
pebble(r,(0,0,0),(.47,.47,.47),chrome,3)
for axis in range(3):
    coords=[]
    for i in range(65):
        t=i*math.tau/64
        coords.append((.57*math.cos(t),.57*math.sin(t)*math.cos(axis*.8),.57*math.sin(t)*math.sin(axis*.8)))
    tube(r,coords,.025,cream)

r=root('ThemeRibbon')
n=192; verts=[]
for i in range(n):
    t=i*math.tau/n
    center=Vector((2.25*math.cos(t),.30*math.sin(t*3),2.3*math.sin(t)))
    radial=Vector((math.cos(t),0,math.sin(t)))
    across=radial*math.cos(t)+Vector((0,1,0))*math.sin(t)
    normal=radial.cross(Vector((-math.sin(t),0,math.cos(t)))).normalized()
    for side,depth in [(-1,-1),(1,-1),(1,1),(-1,1)]:
        verts.append(tuple(center+across*(side*.56)+normal*(depth*.07)))
faces=[]
for i in range(n):
    for j in range(4):faces.append((i*4+j,i*4+(j+1)%4,((i+1)%n)*4+(j+1)%4,((i+1)%n)*4+j))
mesh('Folded continuous ribbon',r,verts,faces,lime,True)

r=root('StoneArch')
verts=[];faces=[];n=48
# Arch crown, then two solid legs.
for i in range(n+1):
    t=i*math.pi/n
    for radius,depth in [(1.40,-.35),(.88,-.35),(.88,.35),(1.40,.35)]:
        verts.append((math.cos(t)*radius,depth,.30+math.sin(t)*radius))
for i in range(n):
    for j in range(4):faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
faces.extend([(0,3,2,1),(n*4,n*4+1,n*4+2,n*4+3)])
mesh('Stone crown',r,verts,faces,cream,True)
for x in [-1.14,1.14]:
    bpy.ops.mesh.primitive_cube_add(size=1,location=(x,0,-.38))
    obj=bpy.context.object;obj.scale=(.52,.70,1.40)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(obj,r,cream,False)
    mod=obj.modifiers.new('Stone edge','BEVEL');mod.width=.035;mod.segments=3

r=root('LeafCrown')
for i in range(7):
    t=-1.3+i*.44
    leaf_blade(r,(0,0,-.9),(math.sin(t),.1*math.cos(i),math.cos(t)),2.8,.35,leaf if i%2 else lime)
contour(r,-1.15,1.25,.65,.23,chalk)

# Convert curves/modifiers, merge children per model, and export at the origin.
for parent in roots.values():
    bpy.ops.object.select_all(action='DESELECT')
    children=list(parent.children)
    for obj in children:obj.select_set(True)
    bpy.context.view_layer.objects.active=children[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
bpy.ops.object.select_all(action='DESELECT')
for parent in roots.values():
    parent.select_set(True)
    for obj in parent.children:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'onerep-chapters.glb'),use_selection=True,export_apply=True)

# Transparent fallback renders of the actual sculptures.
def area(name,loc,power,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Softbox',(-3,-4,6),900,5);area('Edge',(4,0,4),700,4)
world=bpy.data.worlds.new('Nature studio');world.use_nodes=True
node=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');node.inputs[0].default_value=(.6,.7,.5,1);node.inputs[1].default_value=.45;scene.world=world
camera=bpy.data.cameras.new('Chapter camera');camera.type='ORTHO';camera.ortho_scale=7.0
cam=bpy.data.objects.new('Chapter camera',camera);scene.collection.objects.link(cam);scene.camera=cam
cam.location=(0,-10,5);cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=20
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
compositions={
    'training-world': [('TrainingPlatform',(0,0,-.5),(0,0,0),1),('Kettlebell',(-1.8,-.4,.15),(0,0,-.2),.8)],
    'nutrition-world': [('NutritionBowl',(0,-.2,-.6),(0,0,0),1.1),('Pear',(-1.4,-.1,.0),(0,0,-.2),.85),('LeafSpray',(1.3,.65,.35),(0,0,-.4),.95)],
    'progress-world': [('ProgressSteps',(0,0,-.4),(0,0,-.15),1.4)],
    'coach-world': [('CoachKnot',(0,0,0),(.12,.2,0),1.35),('SignalOrb',(2,-.2,1.5),(0,0,0),.8)],
    'theme-world': [('ThemeRibbon',(0,0,0),(.10,.2,.10),1.1)],
    'pricing-world': [('StoneArch',(0,0,0),(0,0,-.15),1.5),('SignalOrb',(.2,-.1,.1),(0,0,0),.7)],
    'final-world': [('LeafCrown',(0,0,0),(0,0,-.1),1.3)],
}
for name,poses in compositions.items():
    for obj in roots.values():
        for item in [obj,*obj.children]:item.hide_render=True
    for key,loc,rot,scale in poses:
        obj=roots[key];obj.location=loc;obj.rotation_euler=rot;obj.scale=(scale,)*3
        for item in [obj,*obj.children]:item.hide_render=False
    scene.render.filepath=str(RENDERS/(name+'.png'))
    bpy.ops.render.render(write_still=True)
# The editable file contains the library laid out for easy inspection.
for i,obj in enumerate(roots.values()):
    obj.location=((i%5)*6,(i//5)*7,0);obj.rotation_euler=(0,0,0);obj.scale=(1,)*3
    for item in [obj,*obj.children]:item.hide_render=False
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'output/onerep-chapters.blend'))
print('Exported',len(roots),'original chapter assets and seven posters')
