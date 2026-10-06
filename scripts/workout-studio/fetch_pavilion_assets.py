"""Download CC0 source scans and HDR environment from Poly Haven."""
from pathlib import Path
import json, subprocess, concurrent.futures
root=Path(__file__).resolve().parents[2]
source=root/'scripts/workout-studio/pavilion-assets'; source.mkdir(exist_ok=True)
public=root/'apps/mobile/public/onboarding-pavilion'; public.mkdir(parents=True,exist_ok=True)
def get(url,path):
 path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():subprocess.run(['curl','-sSfL','-A','Mozilla/5.0',url,'-o',str(path)],check=True)
def manifest(slug):
 path=source/(slug+'.json');get('https://api.polyhaven.com/files/'+slug,path);return json.loads(path.read_text())
def texture(slug):
 d=manifest(slug)
 for kind,key in [('diff','Diffuse'),('normal','nor_gl'),('rough','Rough')]:
  formats=d[key]['2k'];item=formats.get('jpg') or formats.get('png')
  get(item['url'],source/(slug+'_'+kind+'.'+item['url'].split('.')[-1]))
 return slug
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 print(list(pool.map(texture,['concrete_floor_02','grey_plaster','gravel_floor','rubber_tiles','fine_grained_wood','poly_wool_herringbone'])))
d=manifest('sunset_forest');get(d['hdri']['2k']['hdr']['url'],public/'forest.hdr')
d=manifest('potted_plant_02');item=d['gltf']['1k']['gltf'];get(item['url'],source/'plant/plant.gltf')
for path,resource in item.get('include',{}).items():get(resource['url'],source/'plant'/path)
print('Pavilion sources downloaded')

for slug in ['modular_street_seating','modern_arm_chair_01','mid_century_lounge_chair']:
 d=manifest(slug);item=d['gltf']['1k']['gltf'];get(item['url'],source/slug/(slug+'.gltf'))
 for path,resource in item.get('include',{}).items():get(resource['url'],source/slug/path)
