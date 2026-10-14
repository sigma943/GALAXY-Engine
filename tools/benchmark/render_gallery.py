"""Offline composition previews for review. These are NOT WebGL screenshots or FPS tests."""
import json, math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2]
manifest=json.loads((ROOT/'packages/assets/manifest.json').read_text())
assets={a['id']:a for a in manifest['assets']}
scenes=json.loads((ROOT/'reports/gallery/scenes.json').read_text())
W,H=390,600
for scene in scenes:
 im=Image.new('RGBA',(W,H),(2,4,11,255));d=ImageDraw.Draw(im)
 for star in scene['stars']:
  color=star['color'];c=tuple(int(((color>>shift)&255)*star['brightness']) for shift in [16,8,0]);x=star['x']*W;y=star['y']*H;size=max(.5,star['size']*.8)
  d.ellipse((x-size/2,y-size/2,x+size/2,y+size/2),fill=c+(255,))
 for o in scene['objects']:
  a=assets[o['assetId']];src=Image.open(ROOT/'packages/assets'/a['variants']['medium']['path']).convert('RGBA')
  width=round(o['size']*min(W,H));height=round(width*src.height/src.width);src=src.resize((width,height),Image.Resampling.LANCZOS)
  src.putalpha(src.getchannel('A').point(lambda p:int(p*min(1,o['brightness']))));src=src.rotate(-o['rotation']*180/math.pi,resample=Image.Resampling.BICUBIC,expand=True)
  from PIL import ImageChops
  layer=Image.new('RGBA',(W,H));layer.alpha_composite(src,(round(o['x']*W-src.width/2),round(o['y']*H-src.height/2)))
  if o.get('blendMode')=='screen':
   black=Image.new('RGBA',(W,H),(0,0,0,255));black.alpha_composite(layer);im=ImageChops.screen(im,black)
  else:im.alpha_composite(layer)
 im.convert('RGB').save(ROOT/f"reports/gallery/offline-seed-{int(scene['seed']):02d}.jpg",quality=91)
sheet=Image.new('RGB',(W*5,(H+70)*4),'#081120');d=ImageDraw.Draw(sheet)
for i,s in enumerate(scenes):
 x=i%5*W;y=i//5*(H+70);im=Image.open(ROOT/f"reports/gallery/offline-seed-{int(s['seed']):02d}.jpg");sheet.paste(im,(x,y));d.text((x+15,y+H+12),f"SEED {s['seed']}  /  {s['score']['total']}/100",fill='#caf5e1');d.text((x+15,y+H+35),s['type']+' | OFFLINE PREVIEW',fill='#8ca2c0')
sheet.save(ROOT/'reports/gallery-20-offline.jpg',quality=92)
cards=[]
for s in scenes:
 credits='; '.join(assets[o['assetId']]['credit'] for o in s['objects'])
 cards.append(f"<article><img src='gallery/offline-seed-{int(s['seed']):02d}.jpg'><b>Seed {s['seed']} · {s['score']['total']}/100</b><p>{s['type']}</p><small>{credits}</small></article>")
(ROOT/'reports/gallery.html').write_text("<!doctype html><meta charset='utf-8'><title>Galaxy Engine · 20 offline previews</title><style>body{background:#050b17;color:#dcecff;font-family:system-ui;padding:24px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}img{width:100%}article{background:#101c2d;padding:12px;border-radius:12px}small{font-size:9px;color:#92a6bf}</style><h1>Galaxy Engine 5.1 · 20 kolejnych seedów</h1><p>Podglądy kompozycji wygenerowane offline. To nie są zrzuty WebGL ani testy GPU.</p><section>"+''.join(cards)+'</section>')
