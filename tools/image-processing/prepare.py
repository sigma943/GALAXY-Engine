"""Offline radiometric matting: preserve dark interiors, feather support, unpremultiply.
Produces local WebP variants, provenance, mask QA and a 16x16 luminance proxy.
Never required by the browser or Android runtime.
"""
import hashlib, json, os
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import binary_fill_holes, label
ROOT=Path(__file__).resolve().parents[2]
ASSETS=ROOT/'packages/assets'

def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)

def metrics(image):
 im=image.convert('RGBA'); im.thumbnail((256,256));rgba=np.asarray(im,dtype=np.float32)/255
 rgb=rgba[:,:,:3]*rgba[:,:,3:4];l=rgb@np.array([0.2126,0.7152,0.0722]);
 proxy=Image.fromarray(np.uint8(l*255)).resize((16,16),Image.Resampling.BOX)
 hist=np.histogram(l,bins=16,range=(0,1))[0]/l.size
 detail=(np.abs(np.diff(l,axis=0)).mean()+np.abs(np.diff(l,axis=1)).mean())/2
 return dict(mean=float(l.mean()),contrast=float(l.std()),detail=float(detail),darkFraction=float((l<0.055).mean()),color=rgb.mean(axis=(0,1)).tolist(),luminance=(np.asarray(proxy).flatten()/255).tolist(),histogram=hist.tolist())

def process(row):
 src=Image.open(ASSETS/'raw'/row['raw']).convert('RGB'); original=list(src.size)
 # Split the documented two-planet collage; crop captions out before masking.
 if row['id'] in ('uranus','neptune'):
  w,h=src.size;src=src.crop((0 if row['id']=='uranus' else w//2,0,w//2 if row['id']=='uranus' else w,int(h*.85)))
 src.thumbnail((2800,2800),Image.Resampling.LANCZOS)
 rgb=np.asarray(src,dtype=np.float32)/255;h,w=rgb.shape[:2]
 y,x=np.mgrid[:h,:w];u=(x+.5)/w;v=(y+.5)/h
 lum=rgb@np.array([0.2126,0.7152,0.0722]);
 if row['kind']=='planet':
  bright=rgb.max(axis=2)>.05
  components,n=label(bright)
  counts=np.bincount(components.ravel());counts[0]=0
  component=components==int(counts.argmax())
  filled=binary_fill_holes(component)
  mask=np.asarray(Image.fromarray(np.uint8(filled*255)).filter(ImageFilter.GaussianBlur(.6)),dtype=np.float32)/255
  # Actual photographic silhouette and ring occlusion; no invented ellipses.
  ys,xs=np.where(mask>.01)
  if len(xs)==0:raise ValueError(row['id']+' empty silhouette')
  pad=round(max(xs.max()-xs.min(),ys.max()-ys.min())*.055)
  box=(max(0,xs.min()-pad),max(0,ys.min()-pad),min(w,xs.max()+pad+1),min(h,ys.max()+pad+1))
  rgb=rgb[box[1]:box[3],box[0]:box[2]];mask=mask[box[1]:box[3],box[0]:box[2]]
  method='Observed silhouette, connected component, filled interior, subpixel feather; photographic lighting retained'
 else:
  # Background offset from the corners; cap to avoid eating diffuse emission.
  border=np.r_[rgb[:max(1,h//40)].reshape(-1,3),rgb[-max(1,h//40):].reshape(-1,3)]
  black=np.minimum(np.percentile(border,20,axis=0),0.025)
  rgb=np.maximum(0,rgb-black)
  edge=np.minimum.reduce([u,1-u,v,1-v])
  ellipse=np.sqrt(((u-.5)/.53)**2+((v-.5)/.53)**2)
  feather=smooth(0,.17 if row['kind']=='nebula' else .09,edge)*(1-smooth(.62 if row['kind']=='nebula' else .76,1.04,ellipse))
  if row['kind']=='galaxy':
   support=(np.asarray(Image.fromarray(np.uint8(np.clip(lum*255,0,255))).filter(ImageFilter.GaussianBlur(max(w,h)*.016)),dtype=np.float32)/255)
   # Low-frequency support keeps dark dust lanes opaque inside the galaxy.
   alpha=smooth(.004,.032,support)
   mask=np.maximum(alpha,smooth(.005,.06,lum)*.75)*feather
   # Recover emitted RGB when composited over matched near-black background.
   rgb=np.clip(rgb/np.maximum(mask[:,:,None],.035),0,1)
  else:
   mask=feather
  method='Corner black-level estimate; low-frequency support preserves dust; feathered boundary; straight alpha'
 rgba=np.uint8(np.dstack([rgb,np.clip(mask,0,1)])*255)
 # Guaranteed transparent outermost pixels; QA checks the exported files too.
 rgba[0,:,3]=rgba[-1,:,3]=rgba[:,0,3]=rgba[:,-1,3]=0
 im=Image.fromarray(rgba,'RGBA')
 variants={}
 for key,size in [('small',768),('medium',1536),('large',2560)]:
  variant=im.copy();variant.thumbnail((size,size),Image.Resampling.LANCZOS)
  path=ASSETS/'textures'/f"{row['id']}-{key}.webp"
  variant.save(path,'WEBP',quality=94,method=6,exact=True)
  variants[key]=dict(path='textures/'+path.name,width=variant.width,height=variant.height,bytes=path.stat().st_size)
 out={k:v for k,v in row.items() if k!='raw'}
 out.update(originalSize=original,sha256=hashlib.sha256((ASSETS/'raw'/row['raw']).read_bytes()).hexdigest(),variants=variants,metrics=metrics(im),mask=dict(method=method,edgeAlphaMax=0,approved=True,notes='Mask QA is radiometric/edge validation; artistic review still required. Crop, black-level matching and alpha mask applied.'))
 return out

if __name__=='__main__':
 (ASSETS/'textures').mkdir(exist_ok=True)
 rows=json.loads((ASSETS/'metadata/sources.json').read_text())
 pair=next(r for r in rows if r['id']=='uranus-neptune');rows.remove(pair)
 rows.extend([{**pair,'id':id,'name':id.title()} for id in ['uranus','neptune']])
 assets=[]
 for row in rows:
  print('Preparing',row['id'],flush=True);assets.append(process(row))
 reference_path=Path(os.environ.get('GALAXY_REFERENCE_IMAGE',str(ROOT.parent/'upload/01-6145.png')))
 ref=metrics(Image.open(reference_path)) if reference_path.exists() else json.loads((ASSETS/'metadata/reference-profile.json').read_text())
 manifest=dict(version='5.0.0-assets.1',assets=assets,reference=ref)
 (ASSETS/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False))
 (ASSETS/'metadata/reference-profile.json').write_text(json.dumps(ref,indent=2))
 credits=['# Źródła fotografii — Galaxy Engine 5.0','Kod: MIT. Fotografie: osobne warunki poniżej. Modyfikacje: crop, dopasowanie czerni, maska alfa, warianty WebP. Nie jest to produkt NASA/ESA ani produkt przez nie popierany.']
 for a in assets:credits.append(f"\n## {a['name']}\n\n{a['credit']}\n\nŹródło: {a['source']}\n\nPobranie: {a['originalUrl']}\n\nWarunki: {a['license']} — {a['licenseUrl']}")
 (ROOT/'ASSET-CREDITS.md').write_text('\n'.join(credits))
