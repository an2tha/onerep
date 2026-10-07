"""OneRep's glass-only asset libraries and matching transparent fallback renders."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'apps/web/static/sculptures'
RENDERS=ROOT/'output/landing-assets/glass'
RENDERS.mkdir(parents=True,exist_ok=True)

def glass(name, tint=(.81,.94,.90), thickness=False):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    node=mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value=(*tint,1)
    node.inputs['Roughness'].default_value=.065
    node.inputs['Metallic'].default_value=0
    node.inputs['Transmission Weight'].default_value=.92
    node.inputs['IOR'].default_value=1.46
    node.inputs['Coat Weight'].default_value=.35
    return mat

def setup(kind):
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'output'/f'onerep-{kind}-studio.blend'))
    scene=bpy.context.scene
    roots={o.name:o for o in scene.objects if o.type=='EMPTY' and o.parent is None}
    for o in roots.values():o.location=(0,0,0);o.rotation_euler=(0,0,0);o.scale=(1,)*3
    clear=glass('Optical clear glass',(.92,.98,.96))
    tint=glass('Tinted glass',(.62,.83,.75))
    for o in scene.objects:
        if o.type!='MESH':continue
        for i,mat in enumerate(o.data.materials):
            o.data.materials[i]=tint if any(word in mat.name.lower() for word in ['enamel','rubber','bark']) else clear
    return scene,roots,clear,tint

def smooth_sphere(parent,loc,scale,mat,name):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=32,location=loc)
    o=bpy.context.object;o.name=name;o.parent=parent;o.scale=scale;o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o

def tube(parent,coords,radius,mat):
    curve=bpy.data.curves.new('Blown glass stem','CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=5
    spline=curve.splines.new('POLY');spline.points.add(len(coords)-1)
    for p,co in zip(spline.points,coords):p.co=(*co,1)
    o=bpy.data.objects.new('Blown glass stem',curve);bpy.context.scene.collection.objects.link(o);o.parent=parent;curve.materials.append(mat)

def replace_botanicals(roots,clear,tint):
    for name in ['Terrain','FirTree']:
        for child in list(roots[name].children):bpy.data.objects.remove(child,do_unlink=True)
    r=roots['Terrain']
    for z,scale in [(-.42,(2.7,1.8,.32)),(-.10,(2.4,1.58,.18)),(.08,(2.05,1.37,.12))]:
        o=smooth_sphere(r,(0,0,z),scale,clear,'Molten glass terrace')
        for v in o.data.vertices:
            a=math.atan2(v.co.y,v.co.x);v.co.x*=1+.045*math.sin(3*a);v.co.y*=1+.045*math.cos(4*a)
    r=roots['FirTree']
    tube(r,[(.09*math.sin(i/24*2),0,i/24*2.1) for i in range(25)],.045,tint)
    for i in range(7):
        side=1 if i%2 else -1;z=.35+i*.23
        o=smooth_sphere(r,(side*.22,0,z),(.30,.09,.15),clear,'Glass botanical leaf')
        o.rotation_euler[1]=-side*.55
        for v in o.data.vertices:v.co.y*=.7+.3*(v.co.x+1)/2

def export(scene,roots,name):
    for parent in roots.values():
        bpy.ops.object.select_all(action='DESELECT')
        children=list(parent.children)
        for o in children:o.select_set(True)
        bpy.context.view_layer.objects.active=children[0]
        bpy.ops.object.convert(target='MESH');bpy.ops.object.join()
    bpy.ops.object.select_all(action='DESELECT')
    for r in roots.values():
        r.select_set(True)
        for o in r.children:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'onerep-{name}-glass.glb'),use_selection=True,export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'output'/f'onerep-{name}-glass.blend'))

def lighting(scene):
    for obj in list(scene.objects):
        if obj.type in ['LIGHT','CAMERA']:bpy.data.objects.remove(obj,do_unlink=True)
    for name,loc,power,size in [('Tall softbox',(-3,-4,6),1100,5),('Edge strip',(4,1,3),1600,3),('Front',(0,-5,1),500,2)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='RECTANGLE';data.size=size;data.size_y=size*2
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
    world=bpy.data.worlds.new('Glass studio');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.6,.69,.66,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.6;scene.world=world
    data=bpy.data.cameras.new('Glass camera');data.type='ORTHO';data.ortho_scale=7
    cam=bpy.data.objects.new('Glass camera',data);scene.collection.objects.link(cam);scene.camera=cam
    cam.location=(0,-10,4);cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.cycles.max_bounces=8;scene.cycles.transmission_bounces=6
    scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.render.film_transparent=True;scene.cycles.film_transparent_glass=True
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'

def render(scene,roots,name,poses,ortho=7):
    for r in roots.values():
        for o in [r,*r.children]:o.hide_render=True
    for key,loc,rot,scale in poses:
        r=roots[key];r.location=loc;r.rotation_euler=rot;r.scale=(scale,)*3
        for o in [r,*r.children]:o.hide_render=False
    scene.camera.data.ortho_scale=ortho;scene.render.filepath=str(RENDERS/f'{name}.png')
    bpy.ops.render.render(write_still=True)

scene,roots,clear,tint=setup('sculptures');replace_botanicals(roots,clear,tint);export(scene,roots,'sculptures');lighting(scene)
# Extra instances are confined to the fallback composition.
for i,(x,z,s) in enumerate([(-2,-1.7,.8),(-1,-1.8,1),(.8,-1.7,.9),(1.9,-1.7,.7)]):
    orig=roots['FirTree'];o=orig.copy();o.name=f'Glass foliage {i}';scene.collection.objects.link(o)
    for child in orig.children:
        c=child.copy();scene.collection.objects.link(c);c.parent=o
    roots[o.name]=o
poses=[('Terrain',(0,0,-1.7),(0,0,0),1.15),('Dumbbell',(.15,-.9,.2),(.15,-.35,-.24),1.05),('WeightPlate',(1.62,.1,.93),(.08,-.2,.12),.66),('Shaker',(-1.38,-.65,-.52),(-.1,-.15,.1),.75),('ProgressRings',(1.25,-.73,-.85),(.1,.2,-.1),.6),('Ball',(-1.45,0,1.05),(0,0,0),.6),('Sun',(-1.4,2.2,1.3),(0,0,0),.75),('Cloud',(1.2,2,1.9),(0,0,0),.65)]
for i,(x,z,s) in enumerate([(-2,-1.7,.8),(-1,-1.8,1),(.8,-1.7,.9),(1.9,-1.7,.7)]):poses.append((f'Glass foliage {i}',(x,.8,z),(0,0,0),s))
render(scene,roots,'nature-poster',poses,7.3)
render(scene,roots,'dumbbell',[('Dumbbell',(0,0,0),(.15,-.45,-.35),1)],4.2)
render(scene,roots,'nutrition',[('Shaker',(.3,0,0),(.08,-.1,-.1),1.2),('Apple',(-.75,-.1,-.7),(.1,0,-.2),1.1)],4.2)
render(scene,roots,'progress',[('ProgressRings',(0,0,0),(.1,.15,-.2),1.35)],4.2)
scene,roots,clear,tint=setup('chapters');export(scene,roots,'chapters');lighting(scene)
compositions={
 'training':[('TrainingPlatform',(0,0,-.5),(0,0,0),1),('Kettlebell',(-1.8,-.4,.15),(0,0,-.2),.8)],
 'nutrition':[('NutritionBowl',(0,-.2,-.6),(0,0,0),1.1),('Pear',(-1.4,-.1,0),(0,0,-.2),.85),('LeafSpray',(1.3,.65,.35),(0,0,-.4),.95)],
 'progress':[('ProgressSteps',(0,0,-.4),(0,0,-.15),1.4)],
 'coach':[('CoachKnot',(0,0,0),(.12,.2,0),1.35),('SignalOrb',(2,-.2,1.5),(0,0,0),.8)],
 'theme':[('ThemeRibbon',(0,0,0),(.10,.2,.10),1.1)],
 'pricing':[('StoneArch',(0,0,0),(0,0,-.15),1.5),('SignalOrb',(.2,-.1,.1),(0,0,0),.7)],
 'final':[('LeafCrown',(0,0,0),(0,0,-.1),1.3)],
}
for name,poses in compositions.items():render(scene,roots,name+'-world',poses)
print('Glass libraries and eleven matching fallback renders complete.')
