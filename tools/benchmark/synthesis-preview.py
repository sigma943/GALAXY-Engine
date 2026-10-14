"""Composite the actual TS field samples. Offline approximation, not a GPU screenshot."""
import json,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageChops
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'reports/synthesis-preview'
assets={a['id']:a for a in json.loads((ROOT/'packages/assets/manifest.json').read_text())['assets']}
scenes=json.loads((OUT/'scenes.json').read_text())
W,H=390,600
sheet=Image.new('RGB',(W*5,(H+48)*4),'#081120')
for seed,scene in enumerate(scenes):
 im=Image.new('RGBA',(W,H),(2,4,11,255))
 def stars():
  d=ImageDraw.Draw(im)
  for s in scene['stars']:
   rgb=tuple(round(((s['color']>>shift)&255)*s['brightness']) for shift in [16,8,0]);x=s['x']*W;y=s['y']*H;radius=max(.4,s['size']*.55)
   d.ellipse((x-radius,y-radius,x+radius,y+radius),fill=rgb+(255,))
 added=False
 for n,o in enumerate(scene['objects']):
  if o['kind']!='nebula' and not added:stars();added=True
  if o.get('procedural'):src=Image.frombytes('RGBA',(256,256),(OUT/f'{seed}-{n}.rgba').read_bytes())
  else:src=Image.open(ROOT/'packages/assets'/assets[o['assetId']]['variants']['medium']['path']).convert('RGBA')
  width=max(1,round(o['size']*min(W,H)));height=max(1,round(width*src.height/src.width))
  src=src.resize((width,height),Image.Resampling.LANCZOS);src.putalpha(src.getchannel('A').point(lambda p:round(p*min(1,o['brightness']))))
  src=src.rotate(-o['rotation']*180/math.pi,Image.Resampling.BICUBIC,expand=True)
  layer=Image.new('RGBA',(W,H));layer.alpha_composite(src,(round(o['x']*W-src.width/2),round(o['y']*H-src.height/2)))
  if o.get('blendMode')=='screen':
   black=Image.new('RGBA',(W,H),(0,0,0,255));black.alpha_composite(layer);im=ImageChops.screen(im,black)
  else:im.alpha_composite(layer)
 if not added:stars()
 im.convert('RGB').save(OUT/f'seed-{seed:02d}.jpg',quality=92)
 x=seed%5*W;y=seed//5*(H+48);sheet.paste(im.convert('RGB'),(x,y));ImageDraw.Draw(sheet).text((x+10,y+H+8),f"Seed {seed} | {scene['type']} | OFFLINE",fill='#d1dded')
sheet.save(OUT/'contact-sheet.jpg',quality=92)
print('Saved contact sheet and 20 offline approximations.')
