"""Package authored Blender textures as WebP inside the GLB, preserving UVs."""
from pathlib import Path
import struct,json,io
from PIL import Image
root=Path(__file__).resolve().parents[2]
out=root/'apps/mobile/public/workout-studio'
p=out/'studio.glb';data=p.read_bytes();length=struct.unpack_from('<I',data,12)[0]
doc=json.loads(data[20:20+length]);binary=data[28+length:]
images={image['bufferView']:image for image in doc.get('images',[])}
packed=bytearray()
for index,view in enumerate(doc['bufferViews']):
 start=view.get('byteOffset',0);chunk=binary[start:start+view['byteLength']]
 if index in images:
  image=images[index];im=Image.open(io.BytesIO(chunk)).convert('RGB');stream=io.BytesIO()
  is_normal=any(key in image.get('name','').lower() for key in ['normal','nor_gl'])
  small_map=is_normal or image.get('name','').endswith('_arm') or image.get('name','') in ['dense-plate-rubber-light','powder-coated-graphite-light']
  if small_map and max(im.size)>1024:im.thumbnail((1024,1024),Image.Resampling.LANCZOS)
  im.save(stream,format='WEBP',quality=98 if is_normal else 92,method=6)
  chunk=stream.getvalue();image['mimeType']='image/webp'
 while len(packed)%4:packed.append(0)
 view['byteOffset']=len(packed);view['byteLength']=len(chunk);packed.extend(chunk)
for texture in doc['textures']:
 source=texture.pop('source',None)
 if source is not None:texture.setdefault('extensions',{})['EXT_texture_webp']={'source':source}
for key in ['extensionsUsed','extensionsRequired']:
 doc.setdefault(key,[])
 if 'EXT_texture_webp' not in doc[key]:doc[key].append('EXT_texture_webp')
while len(packed)%4:packed.append(0)
doc['buffers'][0]['byteLength']=len(packed)
header=json.dumps(doc,separators=(',',':')).encode()
header+=b' '*((-len(header))%4)
p.write_bytes(struct.pack('<III',0x46546c67,2,28+len(header)+len(packed))+struct.pack('<II',len(header),0x4e4f534a)+header+struct.pack('<II',len(packed),0x004e4942)+packed)
Image.open(root/'scripts/workout-studio/baked/studio-poster.png').save(out/'studio-poster.webp',quality=90,method=6)
for image in list(out.iterdir())+list((root/'scripts/workout-studio/baked').iterdir()):
 if image.suffix.lower() in ['.png','.webp','.hdr']:
  origin='Authored and rendered in Blender Cycles from scripts/workout-studio/build_room.py. Concrete and leather scans: Poly Haven CC0 (concrete_wall_009, fabric_leather_02). Rubber granules and equipment finishes are authored.'
  image.with_suffix(image.suffix+'.json').write_text(json.dumps({'origin':origin,'source':'scripts/workout-studio/build_room.py','asset':image.name,'prompt':origin},indent=2)+'\n')
print(f'Packaged GLB: {len(data)/1e6:.1f} MB -> {p.stat().st_size/1e6:.1f} MB')
