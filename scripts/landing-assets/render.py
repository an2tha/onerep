"""Render transparent landscape and prop fallback images after create.py."""
import bpy
import math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/landing-assets'
OUT.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
names=['Dumbbell','WeightPlate','Shaker','ProgressRings','Orbit','Ball','Phone','Terrain','FirTree','Boulder','Apple','Cloud','Sun','Flower']
roots={name:scene.objects.get(name) for name in names}
def visible(names):
    for name,root in roots.items():
        for obj in [root,*root.children]:obj.hide_render=name not in names
    for obj in scene.objects:
        if obj.name.startswith('Nature instance'):obj.hide_render=False if 'Terrain' in names else True

def pose(name,loc,rot=(0,0,0),scale=1):
    o=roots[name];o.location=loc;o.rotation_euler=rot;o.scale=(scale,scale,scale)

def instance(name,loc,scale=1):
    orig=roots[name]
    obj=orig.copy();obj.name='Nature instance '+name;scene.collection.objects.link(obj)
    obj.location=loc;obj.rotation_euler=(0,0,0);obj.scale=(scale,scale,scale)
    for child in orig.children:
        copy=child.copy();copy.name='Nature instance mesh';scene.collection.objects.link(copy);copy.parent=obj;copy.hide_render=False
    return obj

visible(['Dumbbell','WeightPlate','Shaker','ProgressRings','Ball','Terrain','FirTree','Boulder','Sun','Cloud'])
pose('Terrain',(0,0,-1.9),scale=1.15)
pose('FirTree',(-1.8,.85,-1.85),scale=.85)
for loc,scale in [((-.8,1.1,-1.85),1),((.8,1.2,-1.85),.85),((1.9,.7,-1.85),.75)]:instance('FirTree',loc,scale)
pose('Boulder',(-1.4,-1,-1.6),scale=.65)
for loc,scale in [((1.6,-.9,-1.75),.75),((.7,-1.3,-1.7),.6)]:instance('Boulder',loc,scale)
pose('Dumbbell',(.15,-.9,.20),(.15,-.35,-.24),1.05)
pose('WeightPlate',(1.62,.10,.93),(.08,-.20,.12),.66)
pose('Shaker',(-1.38,-.65,-.52),(-.1,-.15,.1),.75)
pose('ProgressRings',(1.25,-.73,-.85),(.1,.2,-.1),.60)
pose('Ball',(-1.45,.0,1.05),scale=.6)
pose('Sun',(-1.4,2.2,1.3),scale=.75)
pose('Cloud',(1.2,2.0,1.9),scale=.65)
instance('Cloud',(-2.0,1.3,.5),.55)
scene.camera.location=(0,-10,3.1);scene.camera.rotation_euler=(Vector((0,0,-.1))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera.data.ortho_scale=7.3
scene.render.resolution_x=1200;scene.render.resolution_y=1200
scene.render.filepath=str(OUT/'nature-poster.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'output/onerep-sculptures.blend'))
bpy.ops.render.render(write_still=True)
scene.camera.location=(0,-9,2.4);scene.camera.rotation_euler=(Vector((0,0,0))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera.data.ortho_scale=4.2
scene.render.resolution_x=1000;scene.render.resolution_y=1000
visible(['Dumbbell']);pose('Dumbbell',(0,0,0),(.15,-.45,-.35),1)
scene.render.filepath=str(OUT/'dumbbell.png');bpy.ops.render.render(write_still=True)
visible(['Shaker','Apple']);pose('Shaker',(.3,0,0),(.08,-.1,-.1),1.2);pose('Apple',(-.75,-.1,-.7),(.1,0,-.2),1.1)
scene.render.filepath=str(OUT/'nutrition.png');bpy.ops.render.render(write_still=True)
visible(['ProgressRings']);pose('ProgressRings',(0,0,0),(.1,.15,-.2),1.35)
scene.render.filepath=str(OUT/'progress.png');bpy.ops.render.render(write_still=True)
print('Rendered four fallback assets')
