"""Fetch two CC0 Poly Haven PBR sets used by the authored room."""
from pathlib import Path
import json,subprocess
out=Path(__file__).resolve().parent/'textures';out.mkdir(exist_ok=True)
for slug in ['rubber_tiles','concrete_wall_009','fabric_leather_02']:
 manifest=out/(slug+'.json')
 subprocess.run(['curl','-sSfL','-A','OneRep-Studio/1.0','https://api.polyhaven.com/files/'+slug,'-o',str(manifest)],check=True)
 data=json.loads(manifest.read_text())
 for kind in ['diff','nor_gl','arm']:
  item=data['Diffuse' if kind=='diff' else kind]['2k']['jpg' if kind=='diff' else 'png']
  target=out/(slug+'_'+kind+('.jpg' if kind=='diff' else '.png'))
  if target.exists():continue
  subprocess.run(['curl','-sSfL',item['url'],'-o',str(target)],check=True)
  origin={'source':'https://polyhaven.com/a/'+slug,'license':'CC0','download':item['url'],'prompt':'Downloaded PBR material, not AI generated.'}
  target.with_suffix(target.suffix+'.json').write_text(json.dumps(origin,indent=2)+'\n')
 print('Downloaded',slug)
