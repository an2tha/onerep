"""OneRep studio: authored metric-scale gym, GLB and a rendered fallback.
Run with Blender 5.2: blender -b --python scripts/workout-studio/build_room.py
Architecture and equipment are authored here. Wall/floor PBR scans: Poly Haven CC0.
"""
import bpy, math, os, random
import numpy as np
from mathutils import Vector
random.seed(8)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
PUBLIC=os.path.join(ROOT,'apps/mobile/public/workout-studio')
OUT=os.path.join(ROOT,'scripts/workout-studio/baked')
os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for data in bpy.data.materials: bpy.data.materials.remove(data)

def mat(name,color,rough=.5,metal=0,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m
steel=mat('Powder coated graphite',(0.035,.041,.046),.42,.12)
chrome=mat('Brushed steel',(.42,.46,.49),.24,.94)
rubber=mat('Dense plate rubber',(.017,.02,.021),.72,.02)
leather=mat('Black upholstery',(.026,.028,.027),.65)
concrete=mat('Charcoal cast concrete',(.105,.116,.12),.88)
floor=mat('Speckled recycled rubber',(.12,.13,.14),.83)
ceiling=mat('Textured ceiling concrete',(.075,.082,.09),.92)
seam=mat('Tile joints',(.013,.015,.016),.96)
bronze=mat('Anodised champagne',(.34,.27,.16),.37,.82)
white=mat('Paint',(.68,.7,.68),.6)
sign=mat('Wall lettering',(.27,.29,.30),.5,.3)
light=mat('Warm diffuser',(1,.84,.61),.32,0,5)
coollight=mat('Ceiling diffuser',(.78,.88,1),.32,0,4)
mirror=mat('Smoked wall glass',(.16,.19,.20),.18,.88)
# Bake seamless material color, roughness and normal detail into one reusable
# 512px data texture each. Noise stays physical and subtle at metric scale.
for material,scale,amount in [(floor,145,.026),(concrete,5,.048),(rubber,110,.012),(leather,190,.024),(steel,180,.009)]:
 nodes=material.node_tree.nodes;links=material.node_tree.links;p=nodes.get('Principled BSDF')
 noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=scale;noise.inputs['Detail'].default_value=3
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.24;bump.inputs['Distance'].default_value=amount
 links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],p.inputs['Normal'])
 # Exported maps use deterministic photographic-scale grain, microfibres and
 # broad concrete mottling. Flat normal maps are not substituted for detail.
 size=512;im=bpy.data.images.new(material.name+' surface',width=size,height=size)
 base=p.inputs['Base Color'].default_value[:3];pixels=[]
 for y in range(size):
  for x in range(size):
   n=random.random();wave=(math.sin(x*.071)+math.cos(y*.057)+math.sin((x+y)*.031))/3
   variation=(n-.5)*.19 + (wave*.13 if material==concrete else 0)
   fleck=random.uniform(.12,.38) if material==floor and n>.94 else 0
   pixels.extend([max(0,min(1,c*(1+variation)+fleck)) for c in base]+[1])
 im.pixels=pixels;im.filepath_raw=os.path.join(OUT,material.name.replace(' ','-').lower()+'.png');im.file_format='PNG';im.save()
 tex=nodes.new('ShaderNodeTexImage');tex.image=im;links.new(tex.outputs['Color'],p.inputs['Base Color'])
 # Spatial roughness variation, packed in glTF's G channel, with metallic B.
 rough=p.inputs['Roughness'].default_value;metal=p.inputs['Metallic'].default_value
 packed=bpy.data.images.new(material.name+' microsurface',width=size,height=size)
 packed.colorspace_settings.name='Non-Color';roughpixels=[]
 for y in range(size):
  for x in range(size):
   broad=(math.sin(x*.027)+math.cos(y*.039)+math.sin((x-y)*.019))/3
   fine=(random.random()-.5)*.035
   roughpixels.extend([1,max(.05,min(.95,rough+broad*.065+fine)),metal,1])
 packed.pixels=roughpixels;packed.filepath_raw=os.path.join(OUT,material.name.replace(' ','-').lower()+'-roughness.png');packed.file_format='PNG';packed.save()
 packedtex=nodes.new('ShaderNodeTexImage');packedtex.image=packed
 uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
 links.new(uv.outputs['UV'],tex.inputs['Vector']);links.new(uv.outputs['UV'],packedtex.inputs['Vector'])
 # Tangent-space microtexture survives glTF, unlike Blender procedural bumps.
 normal=bpy.data.images.new(material.name+' grain normal',width=size,height=size)
 normal.colorspace_settings.name='Non-Color';normalpixels=[]
 for y in range(size):
  for x in range(size):
   nx=(random.random()-.5)*(.22 if material==concrete else .12)
   ny=(random.random()-.5)*(.22 if material==concrete else .12)
   normalpixels.extend([.5+nx,.5+ny,math.sqrt(max(0,1-4*nx*nx-4*ny*ny))*.5+.5,1])
 normal.pixels=normalpixels;normal.filepath_raw=os.path.join(OUT,material.name.replace(' ','-').lower()+'-normal.png');normal.file_format='PNG';normal.save()
 normaltex=nodes.new('ShaderNodeTexImage');normaltex.image=normal;links.new(uv.outputs['UV'],normaltex.inputs['Vector'])
 normalnode=nodes.new('ShaderNodeNormalMap');links.new(normaltex.outputs['Color'],normalnode.inputs['Color']);links.new(normalnode.outputs['Normal'],p.inputs['Normal'])
 split=nodes.new('ShaderNodeSeparateColor');links.new(packedtex.outputs['Color'],split.inputs['Color'])
 links.new(split.outputs['Green'],p.inputs['Roughness']);links.new(split.outputs['Blue'],p.inputs['Metallic'])


# Satin steel: directional brushing, with subtle roughness variation rather
# than a perfectly smooth chrome shader. Normal amplitude is intentionally tiny.
nodes=chrome.node_tree.nodes;links=chrome.node_tree.links;p=nodes.get('Principled BSDF')
size=1024
roughimage=bpy.data.images.new('Satin steel microsurface',width=size,height=size);roughimage.colorspace_settings.name='Non-Color'
normalimage=bpy.data.images.new('Satin steel normal',width=size,height=size);normalimage.colorspace_settings.name='Non-Color'
roughpixels=[];normalpixels=[]
lines=[random.uniform(-1,1) for i in range(size)]
for y in range(size):
 for x in range(size):
  grain=lines[y]*.028;wear=math.sin(x*.015)*math.cos(y*.027)*.025
  roughpixels.extend([1,.23+grain+wear,.94,1]);normalpixels.extend([.5,.5+lines[y]*.014,1,1])
for image,pixels,suffix in [(roughimage,roughpixels,'roughness'),(normalimage,normalpixels,'normal')]:
 image.pixels=pixels;image.filepath_raw=os.path.join(OUT,'satin-steel-'+suffix+'.png');image.file_format='PNG';image.save()
 tex=nodes.new('ShaderNodeTexImage');tex.image=image
 if suffix=='roughness':
  split=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],split.inputs['Color']);links.new(split.outputs['Green'],p.inputs['Roughness']);links.new(split.outputs['Blue'],p.inputs['Metallic'])
 else:
  normal=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],p.inputs['Normal'])

# Scanned material detail replaces procedural grain on large architectural
# surfaces. Download provenance and CC0 license live beside the source maps.
for material,slug,tint in [(concrete,'concrete_wall_009',.24),(ceiling,'concrete_wall_009',.18),(leather,'fabric_leather_02',.08)]:
 nodes=material.node_tree.nodes;links=material.node_tree.links;p=nodes.get('Principled BSDF')
 folder=os.path.join(ROOT,'scripts/workout-studio/textures')
 uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
 diff=bpy.data.images.load(os.path.join(folder,slug+'_diff.jpg'))
 pixels=np.array(diff.pixels[:],dtype=np.float32).reshape(-1,4);pixels[:,:3]*=tint
 if material==leather:pixels[:,:3]=pixels[:,:3].mean(axis=1,keepdims=True)
 diff.pixels.foreach_set(pixels.ravel());diff.filepath_raw=os.path.join(OUT,material.name.replace(' ','-').lower()+'-albedo.png');diff.file_format='PNG';diff.save()
 tex=nodes.new('ShaderNodeTexImage');tex.image=diff;links.new(uv.outputs['UV'],tex.inputs['Vector']);links.new(tex.outputs['Color'],p.inputs['Base Color'])
 arm=bpy.data.images.load(os.path.join(folder,slug+'_arm.png'));arm.colorspace_settings.name='Non-Color'
 tex=nodes.new('ShaderNodeTexImage');tex.image=arm;links.new(uv.outputs['UV'],tex.inputs['Vector'])
 split=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],split.inputs['Color']);links.new(split.outputs['Green'],p.inputs['Roughness']);links.new(split.outputs['Blue'],p.inputs['Metallic'])
 normal=bpy.data.images.load(os.path.join(folder,slug+'_nor_gl.png'));normal.colorspace_settings.name='Non-Color'
 tex=nodes.new('ShaderNodeTexImage');tex.image=normal;links.new(uv.outputs['UV'],tex.inputs['Vector'])
 node=nodes.new('ShaderNodeNormalMap');node.inputs['Strength'].default_value=.45 if material!=leather else .7
 links.new(tex.outputs['Color'],node.inputs['Color']);links.new(node.outputs['Normal'],p.inputs['Normal'])

def apply(o,m):o.data.materials.append(m);return o

def box(name,loc,size,m,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);apply(o,m)
 if bevel:
  mod=o.modifiers.new('Machined edges','BEVEL');mod.width=bevel;mod.segments=5
  bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
  mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
  bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

def cyl(name,loc,r,depth,m,axis='z',vertices=40,bevel=.002):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc);o=bpy.context.object;o.name=name
 if axis=='x':o.rotation_euler[1]=math.pi/2
 if axis=='y':o.rotation_euler[0]=math.pi/2
 apply(o,m)
 if bevel:
  mod=o.modifiers.new('Rolled edge','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 for p in o.data.polygons:p.use_smooth=True
 return o

def torus(name,loc,major,minor,m,axis='z'):
 bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=8,location=loc,major_radius=major,minor_radius=minor);o=bpy.context.object;o.name=name
 if axis=='x':o.rotation_euler[1]=math.pi/2
 if axis=='y':o.rotation_euler[0]=math.pi/2
 apply(o,m)
 for p in o.data.polygons:p.use_smooth=True
 return o

def text(body,loc,size,m,rotation=(math.pi/2,0,0)):
 curve=bpy.data.curves.new('engraving','FONT');curve.body=body;curve.size=size;curve.extrude=.0005;curve.align_x='CENTER'
 o=bpy.data.objects.new('Mark '+body,curve);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=rotation;apply(o,m)
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);return o

def barbell(x,y,z):
 cyl('Olympic shaft',(x,y,z),.014,2.2,chrome,'x')
 for sign in [-1,1]:
  cyl('Sleeve',(x+sign*.83,y,z),.025,.43,chrome,'x')
  for i,r in enumerate([.225,.212,.183]):
   px=x+sign*(.73+i*.065)
   cyl('Bumper plate',(px,y,z),r,.055,rubber,'x',64,.005)
   for rad in [r-.012,r-.025,.072]:torus('Embossed plate ring',(px+sign*.028,y,z),rad,.0025,steel,'x')
   cyl('Steel centre',(px+sign*.03,y,z),.047,.008,chrome,'x')
  cyl('Locking collar',(x+sign*.96,y,z),.045,.038,bronze,'x')
  for offset in range(16):torus('Knurling',(x+sign*(.2+offset*.012),y,z),.0144,.0006,steel,'x')

def rack(x,y):
 for sx in [-.72,.72]:
  for sy in [0,1.1]:
   box('Rack foot',(x+sx,y+sy,.035),(.28,.32,.07),steel,.008)
   box('Upright',(x+sx,y+sy,1.23),(.075,.075,2.4),steel,.005)
   for z in [.18+i*.1 for i in range(21)]:
    cyl('Adjustment hole',(x+sx,y+sy-.04,z),.009,.002,seam,'y',12,0)
   for a in [-.08,.08]:cyl('Anchor bolt',(x+sx+a,y+sy-.07,.073),.012,.011,chrome,vertices=6)
  box('Top cross member',(x+sx,y+.55,2.38),(.07,1.2,.07),steel,.004)
  box('Safety spotter',(x+sx,y-.22,.69),(.05,.52,.07),steel,.004)
  box('Safety pad',(x+sx,y-.22,.733),(.057,.48,.014),rubber,.004)
  box('J cup',(x+sx,y-.07,1.51),(.075,.17,.045),chrome,.004)
 box('Rack top',(x,y+1.1,2.38),(1.52,.075,.075),steel,.004)
 cyl('Pullup bar',(x,y,2.32),.016,1.5,chrome,'x')
 barbell(x,y-.10,1.55)
 # Storage horns and spare plates.
 for z in [.35,.85]:
  cyl('Storage peg',(x+.91,y+1.1,z),.016,.35,chrome,'x')
  for i in range(2):cyl('Stored plate',(x+.87+i*.06,y+1.1,z),.22,.047,rubber,'x',48,.004)

# Architecture: room extends behind the near camera, never a floating diorama.
box('Subfloor',(0,1.7,-.08),(14,12,.12),seam)
for x in range(-7,7):
 for y in range(-4,8):box('Rubber tile',(x+.5,y+.5,-.012),(.994,.994,.03),floor,.004)
box('Back wall',(0,7,2.5),(14,.2,5),concrete,.015)
box('Left wall',(-7,1.5,2.5),(.2,11,5),concrete,.015)
box('Right wall',(7,1.5,2.5),(.2,11,5),concrete,.015)
box('Ceiling',(0,1.5,4.8),(14,11,.18),ceiling)
for x in [-6,-3,0,3,6]:
 box('Roof beam',(x,1.5,4.57),(.14,11,.2),steel,.008)
 for y in [-1,3,6]:
  box('Light housing',(x,y,4.4),(.10,1.7,.09),steel,.01)
  box('Diffuser',(x,y,4.345),(.065,1.62,.012),coollight,.004)
for z in [4.15,4.3]:cyl('HVAC pipe',(0,6.68,z),.06,13.8,steel,'x')
for x in [-6.9,6.9]:box('Skirting',(x,1.5,.055),(.04,11,.11),steel,.005)
for x in [-5.4,-2.7,0,2.7,5.4]:
 box('Wall panel',(x,6.87,2.2),(2.65,.04,3.9),concrete,.005)
 for z in [.32,4.06]:
  for dx in [-1.22,1.22]:cyl('Panel fixing',(x+dx,6.84,z),.016,.005,steel,'y',8,0)
for x in [-5.9,5.9]:
 box('Wall light channel',(x,6.78,2.4),(.05,.09,3.2),steel,.009)
 box('Wall wash strip',(x,6.71,2.4),(.018,.012,3.1),light,.003)
# A ceiling-mounted progress luminaire, aimed forward into the room. The
# emissive strips remain separate meshes so the app can fill them smoothly.
box('Progress ceiling housing',(0,6.45,3.98),(12.3,.19,.22),steel,.012)
for x in [-5.8,0,5.8]:cyl('Progress ceiling suspension',(x,6.45,4.37),.008,.74,steel)
for i in range(10):
 led=mat('Progress blue '+str(i),(.008,.18,1),.3,0,5)
 box('ProgressLED_'+str(i),(-5.49+i*1.22,6.342,3.96),(1.18,.028,.115),led,.009)
# Smoked mirror behind the dumbbells, split vertically, with a metal edge.
for x in [2.5,3.7,4.9]:
 box('Mirror frame',(x,6.68,1.65),(1.18,.06,2.9),steel,.008)
 box('Smoked mirror',(x,6.635,1.65),(1.13,.012,2.85),mirror,.006)
text('O N E R E P',(-2.2,6.73,3.27),.34,sign)
text('S T R E N G T H   S T U D I O',(-2.2,6.72,2.98),.064,bronze)
rack(-2.25,3.45)
# Adjustable bench with hinge, rail, frame, feet, seams and rubber end caps.
x=.45;y=2.15
box('Bench base',(x,y,.18),(.10,1.62,.11),steel,.013)
for sy in [-.6,.55]:
 box('Bench stabiliser',(x,y+sy,.08),(.70,.075,.075),steel,.012)
 for sx in [-.31,.31]:box('Bench foot',(x+sx,y+sy,.05),(.12,.095,.10),rubber,.012)
 box('Bench support',(x,y+sy,.30),(.075,.075,.38),steel,.006)
box('Seat backing',(x,y-.42,.46),(.31,.44,.035),steel,.011)
box('Seat cushion',(x,y-.42,.51),(.34,.45,.085),leather,.033)
back=box('Backrest',(x,y+.25,.61),(.34,1.03,.09),leather,.032);back.rotation_euler[0]=math.radians(13)
def cushion_seam(name,center,length,tilt=0):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=.0018;curve.bevel_resolution=2
 spline=curve.splines.new('POLY');points=[]
 width=.32;r=.027
 for cx,cy,start in [(width/2-r,length/2-r,0),(-width/2+r,length/2-r,90),(-width/2+r,-length/2+r,180),(width/2-r,-length/2+r,270)]:
  for i in range(9):
   a=math.radians(start+i*90/8);points.append((cx+r*math.cos(a),cy+r*math.sin(a),0,1))
 spline.points.add(len(points)-1)
 for p,co in zip(spline.points,points):p.co=co
 spline.use_cyclic_u=True
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.location=center;o.rotation_euler[0]=tilt;apply(o,leather)
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
cushion_seam('Seat stitched piping',(x,y-.42,.542),.425)
cushion_seam('Backrest stitched piping',(x,y+.25,.642),1.005,math.radians(13))
rail=box('Adjustment rail',(x,y+.2,.46),(.09,.95,.06),steel,.008);rail.rotation_euler[0]=math.radians(13)
for sy in [.0,.16,.32,.48,.64]:cyl('Bench adjustment',(x+.07,y+sy,.38),.012,.015,chrome,'x',16,0)
cyl('Bench hinge',(x,y-.1,.41),.035,.42,chrome,'x')
for sx in [-.18,.18]:cyl('Transport wheel',(x+sx,y+.79,.11),.075,.045,rubber,'x')
# Dumbbell rack, three tiers. Each head has actual bevelled hexagonal geometry.
for x in [2.7,5.2]:
 for y in [4.55,5.15]:box('Dumbbell rack leg',(x,y,.57),(.075,.075,1.05),steel,.006)
for tier,z in enumerate([.45,.81,1.17]):
 y=4.66+tier*.12
 for dy in [-.13,.13]:box('Dumbbell cradle',(3.95,y+dy,z),(2.72,.065,.05),steel,.004)
 for i in range(6):
  x=2.84+i*.44;r=.09+i*.007
  cyl('Dumbbell grip',(x,y,z+.13),.016,.20,chrome,'y',24,.002)
  for sign in [-1,1]:
   cyl('Hex dumbbell',(x,y+sign*.14,z+.13),r,.10,rubber,'y',6,.01)
   text(str(6+i*2),(x,y-.196,z+.10),.038,white)
# Quiet floor zone: rolled mats, towel shelf, water bottle, kettlebells.
for i in range(3):
 cyl('Rolled training mat',(-5.4+i*.23,5.8,.31),.09,.60,rubber,'z',32)
 for r in [.04,.065,.083]:torus('Mat spiral',(-5.4+i*.23,5.8,.615),r,.003,steel)
for i in range(3):
 x=-4.8+i*.4;y=2.2
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=.14,location=(x,y,.14));apply(bpy.context.object,steel)
 for polygon in bpy.context.object.data.polygons:polygon.use_smooth=True
 torus('Kettlebell handle',(x,y,.34),.095,.022,steel,'y')
box('Training mat',(-4.8,.25,.016),(1.2,2.2,.022),rubber,.018)
box('Towel shelf',(5.9,2.0,1.0),(.7,.42,.045),steel,.008)
for i in range(3):box('Folded towel',(5.88,2,1.05+i*.045),(.44,.28,.048),concrete,.021)
cyl('Bottle',(5.92,1.91,1.3),.04,.24,steel);cyl('Bottle lid',(5.92,1.91,1.43),.033,.026,bronze)
# Wall clock is a real mesh with named hands for the duration question.
cyl('Clock frame',(.5,6.7,2.65),.23,.065,steel,'y',64)
cyl('Clock face',(.5,6.658,2.65),.208,.008,rubber,'y',64)
for i in range(12):
 a=i*math.pi/6
 marker=box('Clock index',(.5+math.sin(a)*.183,6.65,2.65+math.cos(a)*.183),(.009,.006,.026),white,.001);marker.rotation_euler[1]=a
hand=box('ClockMinute',(.5,6.637,2.73),(.010,.007,.17),bronze,.002)
hand2=box('ClockHour',(.55,6.631,2.65),(.11,.007,.012),white,.002)
cyl('Clock pin',(.5,6.625,2.65),.018,.011,chrome,'y')
# Join static geometry by material: handful of draw calls rather than hundreds.
bpy.ops.object.select_all(action='DESELECT')
for m in list(bpy.data.materials):
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==m and not o.name.startswith('ClockM') and not o.name.startswith('ClockH') and not o.name.startswith('ProgressLED_')]
 if not objects:continue
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name='Room_'+m.name
 bpy.ops.object.select_all(action='DESELECT')
# Apply metric planar UVs to the scanned surfaces, avoiding stretched pores.
for o in bpy.context.scene.objects:
 if o.type!='MESH' or not o.data.materials or o.data.materials[0] not in [concrete,ceiling,floor,leather]:continue
 uv=o.data.uv_layers.get('UVMap')
 if not uv:continue
 for polygon in o.data.polygons:
  normal=polygon.normal;axis=max(range(3),key=lambda i:abs(normal[i]))
  a,b=([1,2] if axis==0 else [0,2] if axis==1 else [0,1])
  for loop in polygon.loop_indices:
   point=o.matrix_world @ o.data.vertices[o.data.loops[loop].vertex_index].co
   scale=.45 if o.data.materials[0]==leather else .75 if o.data.materials[0]==floor else 1.8
   uv.data[loop].uv=(point[a]/scale,point[b]/scale)
# Punctual sources export to glTF and match the web scene. Blender area lights
# remain for the high quality fallback render only.
def area(name,loc,energy,color,size,target):
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='DISK';d.size=size
 o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Rack softbox',(-2,2.4,4.2),750,(.79,.87,1),.65,(-2,3.8,1))
area('Dumbbell softbox',(4,3.7,4.2),750,(1,.82,.61),.8,(4,4.8,.7))
area('Front bounce',(-1,-2,3.5),100,(.80,.86,1),4,(0,3,1))
area('Rear rim',(-4,6.3,3.4),110,(.85,.91,1),1,(-2,3,1))
bpy.ops.object.camera_add(location=(-.65,-3.7,2.05));camera=bpy.context.object
camera.rotation_euler=(Vector((-2.25,3.4,1.22))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=27;camera.data.sensor_fit="VERTICAL"
bpy.context.scene.camera=camera
scene=bpy.context.scene;scene.world.color=(.055,.06,.07)
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(OUT,'studio-poster.png')
# Bake diffuse irradiance once in Cycles. The browser keeps the real 3D camera
# and specular materials, but no longer pays for per-pixel static lights/shadows.
scene.cycles.samples=32
scene.render.bake.use_pass_direct=True
scene.render.bake.use_pass_indirect=True
scene.render.bake.use_pass_color=False
scene.render.bake.margin=8
baked=[]
for o in list(scene.objects):
 if o.type!='MESH' or not o.name.startswith('Room_'):continue
 m=o.data.materials[0];p=m.node_tree.nodes.get('Principled BSDF')
 if m in [chrome,bronze,mirror,light,coollight]:continue
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 o.data.uv_layers.new(name='LightUV');o.data.uv_layers.active_index=len(o.data.uv_layers)-1
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
 bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.012)
 bpy.ops.object.mode_set(mode='OBJECT')
 size=2048 if m in [floor,concrete,ceiling,steel,rubber] else 512
 image=bpy.data.images.new(m.name+' irradiance',width=size,height=size,float_buffer=True)
 node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;m.node_tree.nodes.active=node
 bpy.ops.object.bake(type='DIFFUSE')
 import numpy as np
 pixels=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4);pixels[:,:3]/=8;image.pixels.foreach_set(pixels.ravel())
 image.filepath_raw=os.path.join(OUT,m.name.replace(' ','-').lower()+'-light.png');image.file_format='PNG';image.save()
 uv=m.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='LightUV';m.node_tree.links.new(uv.outputs['UV'],node.inputs['Vector'])
 # Emissive is a glTF transport channel for the lightmap's UV and color space.
 # StudioScene moves this texture into MeshStandardMaterial.lightMap.
 m['studioLightmap']=8;baked.append((m,node))
 o.data.uv_layers.active_index=0
 print('BAKED',m.name,flush=True)
# Connect transport emission only AFTER every bake. Otherwise earlier
# lightmaps become extra emitters and erase later surfaces' contact shadows.
transport_links=[]
for m,node in baked:
 p=m.node_tree.nodes.get('Principled BSDF')
 link=m.node_tree.links.new(node.outputs['Color'],p.inputs['Emission Color'])
 p.inputs['Emission Strength'].default_value=1;transport_links.append((m,link))
bpy.ops.export_scene.gltf(filepath=os.path.join(PUBLIC,'studio.glb'),export_format='GLB',export_lights=False,export_cameras=False,export_apply=True,export_image_format='AUTO',export_yup=True,export_extras=True)
for m,link in transport_links:
 m.node_tree.links.remove(link);m.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=0
scene.cycles.samples=64
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'scripts/workout-studio/studio.blend'))
bpy.ops.render.render(write_still=True)
print('STUDIO_READY')
