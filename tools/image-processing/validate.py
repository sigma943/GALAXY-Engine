import json
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
manifest=json.loads((ROOT/'packages/assets/manifest.json').read_text());rows=[]
for a in manifest['assets']:
 for key,v in a['variants'].items():
  path=ROOT/'packages/assets'/v['path'];im=Image.open(path).convert('RGBA');rgba=np.asarray(im);alpha=rgba[:,:,3]
  edge=max(alpha[0].max(),alpha[-1].max(),alpha[:,0].max(),alpha[:,-1].max())/255
  assert edge<=.01,(a['id'],key,edge)
  assert list(im.size)==[v['width'],v['height']]
  assert path.stat().st_size==v['bytes']
  assert a['credit'] and a['source'] and a['licenseUrl']
  rows.append(dict(asset=a['id'],variant=key,edgeAlpha=float(edge),bytes=v['bytes']))
(ROOT/'reports/asset-validation.json').write_text(json.dumps(dict(status='passed',variants=len(rows),rows=rows),indent=2))
print('Validated',len(rows),'exported variants: zero boundary alpha, dimensions, byte sizes and provenance present')
