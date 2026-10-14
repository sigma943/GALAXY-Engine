"""Download observed astronomy only; full per-image credit from official page.
Network is needed only here, never in Galaxy Lab. Python 3 + beautifulsoup4.
"""
import concurrent.futures, json, re, urllib.request
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'packages/assets/raw'
SOURCES = [
 ('m51','Messier 51','galaxy','spiral','esahubble.org','heic0506a'),
 ('m101','Messier 101','galaxy','spiral','esahubble.org','heic0602a'),
 ('ngc1300','NGC 1300','galaxy','barred','esahubble.org','opo0501a'),
 ('m104','Messier 104','galaxy','edge-on','esahubble.org','heic2506a'),
 ('ngc3982','NGC 3982','galaxy','spiral','esahubble.org','heic0311a'),
 ('carina','Carina Nebula','nebula','emission','esahubble.org','heic0707a'),
 ('orion','Orion Nebula','nebula','emission','esahubble.org','heic0601a'),
 ('eagle','Eagle Nebula','nebula','emission','esahubble.org','heic1501a'),
 ('lagoon','Lagoon Nebula','nebula','emission','esahubble.org','heic1808a'),
 ('veil','Veil Nebula','nebula','remnant','esahubble.org','heic1520a'),
 ('tarantula','Tarantula Nebula','nebula','emission','esawebb.org','weic2212a'),
 ('ngc3324','NGC 3324 · Cosmic Cliffs','nebula','emission','esawebb.org','weic2205a'),
 # Saturn is supplied by the Cassini photojournal entry below.
 ('jupiter','Jupiter','planet','gas','esahubble.org','heic2017a'),
 ('mars','Mars','planet','rocky','esahubble.org','heic1814c'),
 ('uranus-neptune','Uranus / Neptune','planet','ice','esahubble.org','heic2209a'),
]

def get(url):
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'GalaxyLab/5.0 asset preparation'}),timeout=90).read()

def fetch(row):
 id,name,kind,subtype,host,image_id=row
 page=f'https://{host}/images/{image_id}/'
 html=get(page); soup=BeautifulSoup(html,'html.parser')
 credit_label=soup.find(string=lambda t:t and t.strip()=='Credit:')
 if not credit_label: raise ValueError(f'{id}: credit absent')
 parent=credit_label.parent
 # Credit heading followed by the complete paragraph (acknowledgements included).
 lines=[]
 for e in parent.next_siblings:
  text=e.get_text(' ',strip=True) if hasattr(e,'get_text') else str(e).strip()
  if 'Usage of' in text or 'Are you a journalist' in text: break
  if text: lines.append(text)
 credit=' '.join(lines).strip()
 if not credit: credit=parent.parent.get_text(' ',strip=True).split('Credit:',1)[1].split('Usage of',1)[0].strip()
 links=[a.get('href') for a in soup.find_all('a') if 'Publication JPEG' in a.get_text()]
 if not links: links=[a.get('href') for a in soup.find_all('a') if 'Large JPEG' in a.get_text()]
 if not links: raise ValueError(f'{id}: no download')
 url=links[0]
 if url.startswith('/'): url=f'https://{host}'+url
 path=RAW/f'{id}.jpg'
 if not path.exists(): path.write_bytes(get(url))
 (RAW/f'{id}.html').write_bytes(html)
 return dict(id=id,name=name,kind=kind,subtype=subtype,source=page,originalUrl=url,credit=credit,license='CC BY 4.0',licenseUrl=f'https://{host}/copyright/',raw=path.name)

if __name__=='__main__':
 RAW.mkdir(parents=True,exist_ok=True)
 rows=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  for row in pool.map(fetch,SOURCES):
   rows.append(row); print(row['id'],row['credit'],flush=True)
 # NASA spacecraft observations, no third-party credit in their source caption.
 extras=[
  ('saturn','Saturn','https://science.nasa.gov/photojournal/the-greatest-saturn-portrait-yet/','NASA/JPL/Space Science Institute','PIA06193'),
  ('venus','Venus','https://science.nasa.gov/image-detail/venus-mariner-10-pia23791-fig2-2/','NASA/JPL-Caltech','pia23791'),
  ('earth','Earth','https://www.nasa.gov/image-article/blue-marble-image-of-earth-from-apollo-17/','NASA','blue')
 ]
 for id,name,page,credit,hint in extras:
  html=get(page); soup=BeautifulSoup(html,'html.parser')
  if id=='saturn':
   urls=[a.get('href') for a in soup.find_all('a') if '.jpg' in a.get('href','') and 'PIA06193' in a.get('href','').upper()]
  elif id=='venus':
   urls=[a.get('href') for a in soup.find_all('a') if a.get_text(strip=True)=='Download']
  else:
   urls=[img.get('src') for img in soup.find_all('img') if 'earth' in str(img).lower() and ('blue' in str(img).lower() or 'apollo' in str(img).lower())]
  if not urls: raise ValueError(id+' image URL missing')
  url=urls[0]; (RAW/f'{id}.jpg').write_bytes(get(url)); (RAW/f'{id}.html').write_bytes(html)
  rows.append(dict(id=id,name=name,kind='planet',subtype='ringed' if id=='saturn' else 'rocky',source=page,originalUrl=url,credit=credit,license='NASA media usage guidelines; JPL image use policy for Venus',licenseUrl='https://www.nasa.gov/nasa-brand-center/images-and-media/',raw=f'{id}.jpg'))
 (ROOT/'packages/assets/metadata/sources.json').write_text(json.dumps(rows,indent=2,ensure_ascii=False))
