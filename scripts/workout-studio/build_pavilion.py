"""Standalone OneRep onboarding pavilion. Execute through the live Blender MCP."""
import bpy, math, os, numpy as np
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.join(ROOT,'apps/mobile/public/onboarding-pavilion')
ASSETS=os.path.join(ROOT,'scripts/workout-studio/pavilion-assets')
os.makedirs(OUT,exist_ok=True)
# A separate scene leaves the user's starting scene intact.
old=bpy.data.scenes.get('OneRep Pavilion')
if old:
 for o in list(old.objects):
  data=o.data if o.type=='MESH' else None
  bpy.data.objects.remove(o,do_unlink=True)
  if data and data.users==0:bpy.data.meshes.remove(data)
 scene=old
else:scene=bpy.data.scenes.new('OneRep Pavilion')
bpy.context.window.scene=scene
for m in list(bpy.data.materials):
 if m.name.startswith("Pavilion") and m.users==0:bpy.data.materials.remove(m)

def pbr(name,color,rough=.6,metal=0,texture=None):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if texture:
  normal,roughmap=texture
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=normal
  n=m.node_tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.35
  m.node_tree.links.new(t.outputs['Color'],n.inputs['Color']);m.node_tree.links.new(n.outputs['Normal'],p.inputs['Normal'])
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=roughmap;m.node_tree.links.new(t.outputs['Color'],p.inputs['Roughness'])
 return m

def scan(m,slug,scale=1):
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 for socket in ['Base Color','Normal','Roughness']:
  for link in list(p.inputs[socket].links):m.node_tree.links.remove(link)
 for kind in ['diff','normal','rough']:
  path=next(os.path.join(ASSETS,f) for f in os.listdir(ASSETS) if f.startswith(slug+'_'+kind+'.'))
  image=bpy.data.images.load(path,check_existing=True);image.colorspace_settings.name='sRGB' if kind=='diff' else 'Non-Color'
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image
  if kind=='normal':
   n=m.node_tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.6;m.node_tree.links.new(t.outputs['Color'],n.inputs['Color']);m.node_tree.links.new(n.outputs['Normal'],p.inputs['Normal'])
  else:m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color' if kind=='diff' else 'Roughness'])
 m['pavilionScan']=slug
 return m
grout=pbr('Pavilion grout',(.20,.20,.17),.9)
stone=pbr('Pavilion limestone',(.64,.59,.48),.82)
wall=pbr('Pavilion plaster',(.79,.75,.65),.86)
oak=pbr('Pavilion oak',(.30,.17,.09),.48)
linen=pbr('Pavilion linen',(.56,.51,.42),.9)
metal=pbr('Pavilion brushed bronze',(.39,.35,.27),.3,.85)
rubber=pbr('Pavilion rubber',(.04,.065,.05),.9)
ceramic=pbr('Pavilion ceramic',(.78,.72,.60),.25)
glass=pbr('Pavilion architectural glass',(.82,.94,.92),.1)
g=next(n for n in glass.node_tree.nodes if n.type=='BSDF_PRINCIPLED');g.inputs['Transmission Weight'].default_value=.92;g.inputs['IOR'].default_value=1.46
leaf=pbr('Pavilion leaf',(.10,.22,.10),.7)
fruit=pbr('Pavilion citrus',(.72,.28,.035),.6)
accent=pbr('Pavilion accent',(.16,.36,.28),.5)
screen=pbr('Pavilion screen',(.025,.07,.05),.3)
glow=pbr('Pavilion screen glow',(.7,.9,.78),.4)
gp=next(n for n in glow.node_tree.nodes if n.type=='BSDF_PRINCIPLED');gp.inputs['Emission Color'].default_value=(.4,.8,.6,1);gp.inputs['Emission Strength'].default_value=.5
scan(stone,'concrete_floor_02');scan(wall,'grey_plaster');scan(oak,'fine_grained_wood');scan(linen,'poly_wool_herringbone');scan(rubber,'rubber_tiles');scan(accent,'rubber_tiles')
# Clean honed concrete keeps fine scanned pores without oversized stained contrast.
p=next(n for n in stone.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
t=p.inputs['Base Color'].links[0].from_node
im=t.image.copy();im.name='Pavilion honed concrete albedo'
pixels=np.array(im.pixels[:],dtype=np.float32).reshape(-1,4)
pixels[:,:3]=np.clip(pixels[:,:3]*.38+np.array([.43,.42,.39]),0,1)
im.pixels.foreach_set(pixels.ravel());im.pack();t.image=im
size=256
rng=np.random.default_rng(41);height=rng.random((size,size)).astype(np.float32)
for material in [rubber,metal]:
 nodes=material.node_tree.nodes;links=material.node_tree.links;p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
 for socket in ['Normal','Roughness']:
  for link in list(p.inputs[socket].links):links.remove(link)
 pixels=np.ones((size,size,4),dtype=np.float32)
 pixels[:,:,0]=.5+(np.roll(height,1,1)-np.roll(height,-1,1))*.22
 pixels[:,:,1]=.5+(np.roll(height,1,0)-np.roll(height,-1,0))*.22;pixels[:,:,2]=1
 image=bpy.data.images.new(material.name+' microfinish',width=size,height=size);image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(pixels.ravel());image.pack()
 uv=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=24;links.new(uv.outputs['UV'],mapping.inputs[0])
 tex=nodes.new('ShaderNodeTexImage');tex.image=image;links.new(mapping.outputs[0],tex.inputs['Vector'])
 normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.35;links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],p.inputs['Normal'])
 p.inputs['Roughness'].default_value=.72 if material==rubber else .38
gravel=scan(pbr('Pavilion garden gravel',(.3,.3,.3),.95),'gravel_floor')
# Coordinates in runtime Y-up convention, converted here for Blender.
def loc(x,y,z):return (x,-z,y)
def finish(o,name,m):
 o.name=name;o.data.materials.append(m)
 return o

def box(x,y,z,w,h,d,m,r=.03,name='Joinery'):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc(x,y,z));o=bpy.context.object;o.dimensions=(w,d,h);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if r:
  mod=o.modifiers.new('Manufactured radius','BEVEL');mod.width=min(r,w/3,h/3,d/3);mod.segments=4;bpy.ops.object.modifier_apply(modifier=mod.name)
  mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
 return finish(o,name,m)
def cyl(x,y,z,r,h,m,top=None):
 bpy.ops.mesh.primitive_cone_add(vertices=48,radius1=r,radius2=top if top is not None else r,depth=h,location=loc(x,y,z));o=bpy.context.object
 mod=o.modifiers.new('Rim','BEVEL');mod.width=min(.008,h/4);mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
 for f in o.data.polygons:f.use_smooth=True
 return finish(o,'Turned furnishing',m)
def sphere(x,y,z,sx,sy,sz,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=loc(x,y,z));o=bpy.context.object;o.scale=(sx,sz,sy)
 for f in o.data.polygons:f.use_smooth=True
 return finish(o,'Soft furnishing',m)
def arc(x,y,z,r,tube,m,start=0,length=math.tau,horizontal=False,name='Vault rib'):
 # Explicit tube sweep supports both half-vaults and segmented ceiling rings.
 vertices=[];faces=[];steps=max(32,int(length*40));sides=20
 for i in range(steps+1):
  a=start+length*i/steps
  for j in range(sides):
   b=j*math.tau/sides;rad=r+math.cos(b)*tube
   pt=(x+math.cos(a)*rad,y+math.sin(b)*tube,z+math.sin(a)*rad) if horizontal else (x+math.cos(a)*rad,y+math.sin(a)*rad,z+math.sin(b)*tube)
   vertices.append(loc(*pt))
 for i in range(steps):
  for j in range(sides):q=i*sides+j;qn=i*sides+(j+1)%sides;faces.append((q,qn,qn+sides,q+sides))
 me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);finish(o,name,m)
 for f in me.polygons:f.use_smooth=True
 return o

def furnishing(slug,x,z,width,keep=None,angle=0,base=0):
 before=set(scene.objects)
 bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS,slug,slug+'.gltf'))
 imported=[o for o in scene.objects if o not in before]
 meshes=[o for o in imported if o.type=='MESH' and (keep is None or o.name.split('.')[0] in keep)]
 for o in meshes:
  matrix=o.matrix_world.copy();o.parent=None;o.matrix_world=matrix
 for o in imported:
  if o not in meshes:bpy.data.objects.remove(o,do_unlink=True)
 points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
 lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
 factor=width/(hi.x-lo.x);center=Vector(((hi.x+lo.x)/2,(hi.y+lo.y)/2,lo.z))
 from mathutils import Matrix
 transform=Matrix.Translation(Vector(loc(x,base,z)))@Matrix.Rotation(angle,4,'Z')@Matrix.Scale(factor,4)@Matrix.Translation(-center)
 for o in meshes:o.matrix_world=transform@o.matrix_world;o.name='Scanned furnishing '+slug

def plant(x,z):
 before=set(scene.objects)
 bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS,'plant/plant.gltf'))
 imported=[o for o in scene.objects if o not in before]
 meshes=[o for o in imported if o.type=='MESH']
 points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
 lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
 factor=1.65/(hi.z-lo.z);offset=Vector((x,-z,0))-Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))*factor
 for o in meshes:
  matrix=o.matrix_world.copy();o.parent=None;o.matrix_world=matrix
  o.location=o.location*factor+offset;o.scale*=factor;o.name='Scanned foliage'
 for o in imported:
  if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)

for zone,x in enumerate([0,13,26,39]):
 floor=box(x,-.125,-1,13,.25,17,stone,name='ContactFloor_'+str(zone))
 floor.data.materials[0]=stone.copy();floor.data.materials[0].name='Pavilion floor '+str(zone)
box(19.5,-.31,-1,64,.08,24,gravel,name='Garden gravel')
for i in range(72):
 x=-8+i*.77;z=-10.3+math.sin(i*2.37)*.35
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=loc(x,-.05,z));o=bpy.context.object;o.scale=(.25+(i%3)*.1,.23+(i%4)*.07,.19+(i%5)*.025)
 for v in o.data.vertices:v.co*=1+math.sin(v.index*3.1+i)*.11
 for f in o.data.polygons:f.use_smooth=True
 finish(o,'Garden border stone',stone)
for x in np.arange(-7,47,1.5):box(x,.001,-1,.004,.004,17,grout,0)
for z in np.arange(-9,8,1.5):box(19.5,.001,z,54,.004,.004,grout,0)
for zone,x in enumerate([0,13,26,39]):
 # Continuous curved plaster with separate flat cap normals.
 verts=[];faces=[];segments=128
 for i in range(segments+1):
  a=math.pi+i*math.pi/segments
  for r,h in [(6,0),(6,.85),(6.16,0),(6.16,.85)]:verts.append(loc(x+1+math.cos(a)*r,h,-2+math.sin(a)*r))
 for i in range(segments):
  q=i*4;faces.extend([(q,q+4,q+5,q+1),(q+2,q+3,q+7,q+6),(q+1,q+5,q+7,q+3)])
 me=bpy.data.meshes.new('Continuous plaster');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Continuous plaster',me);scene.collection.objects.link(o);finish(o,'Continuous plaster',wall)
 for i,f in enumerate(me.polygons):f.use_smooth=(i%3!=2)
 for z in [-5.4,-2.5,.4]:
  arc(x+1,0,z,5.9,.085,oak,length=math.pi)
  for side in [-1,1]:
   foot=x+1+side*5.9
   box(foot,.025,z,.3,.05,.3,metal,.015,name='Rib anchor plate')
   cyl(foot,.14,z,.102,.24,metal)
   for dx in [-.11,.11]:
    for dz in [-.11,.11]:cyl(foot+dx,.06,z+dz,.019,.025,metal)
 for dx in [-2.2,2.2]:
  dz=math.sqrt(3.5**2-dx**2)
  for sign in [-1,1]:
   top=math.sqrt(5.9**2-dx**2)
   cyl(x+1+dx,(top+4.75)/2,-2+sign*dz,.012,top-4.75,metal)
   cyl(x+1+dx,4.77,-2+sign*dz,.04,.05,metal)
 arc(x+1,4.75,-2,3.5,.065,metal,horizontal=True,name='Skylight ring')
 for i in range(10):
  m=pbr('Pavilion LED '+str(zone*10+i),(.4,.8,.6),.3)
  p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Emission Color'].default_value=(.4,.8,.6,1);p.inputs['Emission Strength'].default_value=2
  arc(x+1,4.70,-2,3.5,.036,m,start=i*math.tau/10,length=math.tau/10-.035,horizontal=True,name='PavilionLED_'+str(zone*10+i))
 # Three safety-glass wind screens sit above the low rear parapet.
 for dx in [1.2,3.0,4.8]:
  box(x+dx,1.63,-6.2,1.72,1.5,.018,glass,.007,name='Glass wind screen')
  for edge in [-.76,.76]:
   box(x+dx+edge,.92,-6.2,.045,.18,.075,metal,.008,name='Glass clamp')
  box(x+dx,2.385,-6.2,1.72,.018,.025,metal,.006,name='Glass top edge')
 plant(x+4,-4.8)
furnishing('modular_street_seating',1.4,-2.8,2.8,{'seat','seat_back'},base=.46)
for x in [.25,2.55]:
 box(x,.235,-2.8,.09,.47,.61,metal,.015,name='Bench welded leg')
 box(x,.023,-2.8,.28,.046,.72,metal,.012,name='Bench steel foot')
 box(x,.45,-2.8,.12,.065,.66,metal,.012,name='Seat bracket')
 for dz in [-.25,.25]:cyl(x,.495,-2.8+dz,.012,.015,metal)
box(1.4,.35,-2.85,2.38,.065,.065,metal,.01,name='Bench cross brace')
for x in [.25,2.55]:
 box(x,.8,-3.04,.06,.72,.06,metal,.009,name='Bench back support')
 for y in [.65,.88,1.1]:
  o=cyl(x,y,-3.0,.012,.012,metal);o.rotation_euler[0]=math.pi/2

box(2.5,.008,-.1,2.2,.016,1.1,rubber,.008,name='Mat bound edge')
o=box(2.5,.027,-.1,2.185,.027,1.085,accent,.013,name='Mat textured upper')
for v in o.data.vertices:
 v.co.z+=.006*(v.co.x/1.1)**2*(1+math.sin(v.co.y*8))

# Continuous cast body and handle, blended by a local voxel remesh.
for i in range(3):
 x=1+i*.49;parts=[]
 body=sphere(x,.19,-1,.18,.205,.175,rubber);parts.append(body)
 bpy.context.view_layer.objects.active=body;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for v in body.data.vertices:v.co.z=max(v.co.z,-.18)
 parts.append(arc(x,.36,-1,.115,.037,rubber,start=-.65,length=math.pi+1.3,name='Cast grip'))
 for side in [-1,1]:parts.append(sphere(x+side*.095,.285,-1,.058,.074,.056,rubber))
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
 remesh=body.modifiers.new('Continuous iron casting','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.006;bpy.ops.object.modifier_apply(modifier=remesh.name)
 smooth=body.modifiers.new('Cast fillets','SMOOTH');smooth.factor=.7;smooth.iterations=4;bpy.ops.object.modifier_apply(modifier=smooth.name)
 for f in body.data.polygons:f.use_smooth=True
 # Recess-like contrasting weight marking on the cast body's front face.
 bpy.ops.object.text_add(location=loc(x,.19,-.824));o=bpy.context.object;o.data.body=str(8+i*4);o.data.align_x='CENTER';o.data.size=.057;o.data.extrude=.0003;o.rotation_euler=(math.pi/2,0,0);bpy.ops.object.convert(target='MESH');finish(o,'Cast weight marking',metal)
cyl(15,.55,-2.4,1.35,1.1,oak);cyl(15,1.13,-2.4,1.5,.12,stone)
for i in range(56):a=i*math.tau/56;cyl(15+math.cos(a)*1.36,.55,-2.4+math.sin(a)*1.36,.025,.97,oak)
# A turned bowl with interior and rolled ceramic rim.
profile=[(0,0),(.12,0),(.22,.06),(.31,.20),(.30,.22),(.28,.19),(.20,.08),(.10,.035),(0,.035)]
verts=[];faces=[]
for r,h in profile:
 for i in range(64):a=i*math.tau/64;verts.append(loc(15.1+math.cos(a)*r,1.20+h,-2.4+math.sin(a)*r))
for j in range(len(profile)-1):
 for i in range(64):a=j*64+i;b=j*64+(i+1)%64;faces.append((a,b,b+64,a+64))
me=bpy.data.meshes.new('Ceramic bowl');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Ceramic bowl',me);scene.collection.objects.link(o);finish(o,'Ceramic bowl',ceramic)
for f in me.polygons:f.use_smooth=True
for i in range(3):sphere(15+(i-1)*.12,1.35,-2.4,.10,.10,.10,fruit)
cyl(14.3,1.39,-2.35,.085,.43,accent);cyl(14.3,1.62,-2.35,.06,.04,metal)
for x in [14,16]:cyl(x,.62,-.3,.32,.11,linen);cyl(x,.30,-.3,.055,.58,metal);cyl(x,.025,-.3,.26,.05,metal)
furnishing('mid_century_lounge_chair',27.8,-2,1.35,angle=-.22)
furnishing('modern_arm_chair_01',29.3,-3.6,1.0,angle=.35)
cyl(30,.54,-2.4,.38,.09,stone);cyl(30,.27,-2.4,.12,.5,oak)
for i in range(3):box(30,.64+i*.055,-2.4,.35,.05,.26,linen,.02)
box(41,.91,-2.5,2.9,.13,1.1,oak,.06)
for x in [39.8,42.2]:box(x,.43,-2.5,.12,.86,.85,metal)
box(41.2,1.48,-2.85,1.05,.68,.05,metal);box(41.2,1.48,-2.814,.98,.61,.012,screen)
cyl(41.2,1.12,-2.85,.025,.32,metal);box(41.2,.995,-2.7,.37,.035,.28,metal)
for i in range(4):box(41.2,1.63-i*.1,-2.801,.62-i*.08,.014,.005,glow,0)
box(40.35,1.01,-2.35,.36,.045,.46,linen);cyl(42,1.09,-2.4,.065,.19,ceramic)
furnishing('modern_arm_chair_01',41,-.8,.82,angle=math.pi)
# UVs follow physical dimensions, then batch only within each bay/material.
for o in list(scene.objects):
 if o.type!='MESH':continue
 if o.name.startswith(('PavilionLED_','Scanned foliage','Scanned furnishing')):continue
 uv=o.data.uv_layers.get('UVMap') or o.data.uv_layers.new(name='UVMap')
 for poly in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(poly.normal[i]));a,b=([1,2] if axis==0 else [0,2] if axis==1 else [0,1])
  for li in poly.loop_indices:
   pt=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(pt[a],pt[b])
batches={}
for o in list(scene.objects):
 if o.type=='MESH' and not o.name.startswith(('PavilionLED_','ContactFloor_','Scanned foliage','Scanned furnishing')):
  zone=round(o.location.x/13);batches.setdefault((zone,o.data.materials[0]),[]).append(o)
for (zone,m),objects in batches.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name='Pavilion_'+str(zone)+'_'+m.name
# Cycles contact occlusion goes in UV2. It is not a painted oval or a UI shadow.
try:scene.render.engine='CYCLES'
except TypeError:raise
scene.cycles.samples=24
for o in list(scene.objects):
 if not o.name.startswith('ContactFloor_'):continue
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 o.data.uv_layers.new(name='ContactUV');o.data.uv_layers.active_index=1
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.01);bpy.ops.object.mode_set(mode='OBJECT')
 m=o.data.materials[0];image=bpy.data.images.new(o.name+' occlusion',width=1024,height=1024)
 image.colorspace_settings.name='Non-Color';t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image;m.node_tree.nodes.active=t
 bpy.ops.object.bake(type='AO',margin=8)
 uv=m.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='ContactUV';m.node_tree.links.new(uv.outputs['UV'],t.inputs['Vector'])
 group=bpy.data.node_groups.get('glTF Material Output')
 if not group:
  group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
 output=m.node_tree.nodes.new('ShaderNodeGroup');output.node_tree=group;m.node_tree.links.new(t.outputs['Color'],output.inputs['Occlusion'])
 m['pavilionContactAO']=True;o.data.uv_layers.active_index=0;image.pack()
 print('CONTACT_BAKED',o.name,flush=True)
# Authored preview daylight. Runtime provides smoothly adaptive day/night lights.
world=bpy.data.worlds.new('Pavilion daylight');world.use_nodes=True;scene.world=world
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');env=world.node_tree.nodes.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(os.path.join(OUT,'forest.hdr'),check_existing=True);world.node_tree.links.new(env.outputs['Color'],bg.inputs['Color']);bg.inputs['Strength'].default_value=.6
bpy.ops.object.light_add(type='AREA',location=loc(-3,10,4));sun=bpy.context.object;sun.name='Pavilion daylight';sun.data.energy=2000;sun.data.shape='DISK';sun.data.size=5;sun.rotation_euler=(Vector(loc(1,0,-2))-sun.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=loc(-2.2,2.3,5));camera=bpy.context.object;camera.rotation_euler=(Vector(loc(1.8,1.2,-2.1))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=38;scene.camera=camera
scene.render.resolution_x=1440;scene.render.resolution_y=1000;scene.render.resolution_percentage=75
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type=='MESH':o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'pavilion.glb'),export_format='GLB',use_selection=True,export_apply=True,export_lights=False,export_cameras=False,export_extras=True)
try:scene.render.engine='BLENDER_EEVEE'
except TypeError:pass
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'scripts/workout-studio/pavilion.blend'))
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_perspective='CAMERA'
print('PAVILION_EXPORTED',len(scene.objects),'objects',os.path.getsize(os.path.join(OUT,'pavilion.glb')))
