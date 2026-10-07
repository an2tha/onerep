"""Small original abstract sculptures for the OneRep scroll journey."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'apps/web/static/sculptures';RENDERS=ROOT/'output/landing-assets/abstract'
RENDERS.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;roots={}
def material(name,color):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes['Principled BSDF']
    n.inputs['Base Color'].default_value=(*color,1)
    n.inputs['Metallic'].default_value=0;n.inputs['Roughness'].default_value=.08
    n.inputs['Transmission Weight'].default_value=.95;n.inputs['IOR'].default_value=1.46
    n.inputs['Coat Weight'].default_value=1;n.inputs['Coat Roughness'].default_value=.06
    return m
accent=material('Accent glass',(.68,.82,.47))
pearl=material('Clear glass',(.94,.98,.90))
def root(name):
    o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);roots[name]=o;return o

def sweep(parent,curve,width=.3,depth=.15,twist=0,mat=accent,n=128,closed=True,phase=0):
    verts=[];faces=[];sides=16
    for i in range(n if closed else n+1):
        t=i/n*math.tau;p=Vector(curve(t));tangent=(Vector(curve(t+.001))-Vector(curve(t-.001))).normalized()
        a=tangent.cross(Vector((0,1,0))).normalized();b=tangent.cross(a).normalized()
        angle=t*twist+phase;across=a*math.cos(angle)+b*math.sin(angle);normal=-a*math.sin(angle)+b*math.cos(angle)
        w=width(t) if callable(width) else width
        for j in range(sides):
            u=j/sides*math.tau;v=p+across*(math.cos(u)*w)+normal*(math.sin(u)*depth)
            verts.append(tuple(v))
    rings=n if closed else n+1
    for i in range(n):
        for j in range(sides):
            faces.append((i*sides+j,i*sides+(j+1)%sides,((i+1)%rings)*sides+(j+1)%sides,((i+1)%rings)*sides+j))
    if not closed:faces.extend([tuple(range(sides-1,-1,-1)),tuple(n*sides+j for j in range(sides))])
    mesh=bpy.data.meshes.new(parent.name+' continuous surface');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(parent.name+' surface',mesh);scene.collection.objects.link(o);o.parent=parent;mesh.materials.append(mat)
    for p in mesh.polygons:p.use_smooth=True
    return o

def loop(parent,rx,rz,offset=(0,0,0),tilt=0,width=.3,depth=.15,twist=1,mat=accent):
    def curve(t):
        x=rx*math.cos(t);z=rz*math.sin(t)
        return (offset[0]+x*math.cos(tilt)-z*math.sin(tilt),offset[1]+.2*math.sin(t*2),offset[2]+x*math.sin(tilt)+z*math.cos(tilt))
    return sweep(parent,curve,width,depth,twist,mat)

r=root('Tension')
loop(r,1.0,1.48,(-.55,.12,0),-.55,.32,.15,1,accent)
loop(r,1.0,1.48,(.55,-.12,0),.55,.24,.14,1,pearl)
r=root('Nourish')
sweep(r,lambda t:(1.12*math.cos(t)*(1+.19*math.sin(t)),.25*math.sin(t*2),1.28*math.sin(t)),lambda t:.28+.22*(.5+.5*math.sin(t)),.3,1,accent)
loop(r,.45,.75,(.92,-.25,-.7),-.55,.23,.15,1,pearl)
r=root('Rise')
sweep(r,lambda t:(1.22*math.cos(t*1.65),.68*math.sin(t*1.65),-1.5+3*t/math.tau),lambda t:.18+.1*math.sin(t/2),.13,.3,accent,160,False)
sweep(r,lambda t:(1.22*math.cos(t*1.65+.65),.68*math.sin(t*1.65+.65),-1.55+3*t/math.tau),.055,.055,0,pearl,160,False)
r=root('Connection')
sweep(r,lambda t:((1.45+.25*math.cos(3*t))*math.cos(2*t),.52*math.sin(3*t),(1.45+.25*math.cos(3*t))*math.sin(2*t)),.24,.21,1,accent,192)
r=root('Ribbon')
loop(r,2.05,2.05,twist=1,width=.42,depth=.11)
r=root('Balance')
loop(r,1.05,1.55,(-.5,0,0),-.7,.24,.12,1,accent)
loop(r,1.05,1.55,(.5,.15,0),.7,.18,.12,1,pearl)
r=root('Bloom')
for i in range(3):loop(r,.75,1.8,((i-1)*.48,i*.12,0),(i-1)*.62,.26,.13,1,accent if i!=1 else pearl)

bpy.ops.object.select_all(action='DESELECT')
for r in roots.values():
    r.select_set(True)
    for o in r.children:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'onerep-abstract.glb'),use_selection=True,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'output/onerep-abstract.blend'))
# Matching fallback imagery contains the same forms, with no literal props.
for name,loc,power,size in [('Key',(-3,-4,6),850,5),('Rim',(4,1,3),1200,3),('Fill',(1,-6,1),250,3)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='RECTANGLE';data.size=size;data.size_y=size*2
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
w=bpy.data.worlds.new('Glass studio');w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(.24,.29,.24,1);w.node_tree.nodes['Background'].inputs[1].default_value=.6;scene.world=w
camera=bpy.data.cameras.new('Camera');camera.type='ORTHO';camera.ortho_scale=5.3
cam=bpy.data.objects.new('Camera',camera);scene.collection.objects.link(cam);scene.camera=cam;cam.location=(0,-10,2);cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.film_transparent_glass=True;scene.cycles.film_transparent_roughness=.15;scene.cycles.use_denoising=True
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
for key,name in [('training','Tension'),('nutrition','Nourish'),('progress','Rise'),('coach','Connection'),('theme','Ribbon'),('pricing','Balance'),('final','Bloom')]:
    for r in roots.values():
        for o in r.children:o.hide_render=r.name!=name
    scene.render.filepath=str(RENDERS/(key+'-world.png'));bpy.ops.render.render(write_still=True)
for r in roots.values():
    for o in r.children:o.hide_render=r.name not in ['Tension','Nourish','Rise']
roots['Tension'].location=(-.55,0,.55);roots['Tension'].scale=(1.0,)*3
roots['Nourish'].location=(1.7,.2,1.1);roots['Nourish'].scale=(.55,)*3
roots['Rise'].location=(1.1,-.4,-1.65);roots['Rise'].scale=(.65,)*3
camera.ortho_scale=6.7;scene.render.filepath=str(RENDERS/'hero.png');bpy.ops.render.render(write_still=True)
print('Seven abstract forms and eight matching renders exported.')
