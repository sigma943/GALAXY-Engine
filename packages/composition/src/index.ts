import {CRITERIA, type AssetManifest, type AstroAsset, type GeneratorConfig, type Rect, type SceneObject, type Score, type UniverseScene, type Weights, type ImageMetrics} from '../../core/src/types';
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export function bounds(o:SceneObject, aspect:number, a:AstroAsset):Rect {
  const ratio=a.variants.large.height/a.variants.large.width;
  const w=o.size*Math.min(1,1/aspect),h=o.size*Math.min(1,aspect)*ratio;
  const c=Math.abs(Math.cos(o.rotation)),s=Math.abs(Math.sin(o.rotation));
  const rw=w*c+h/aspect*s,rh=h*c+w*aspect*s;
  return {x:o.x-rw/2,y:o.y-rh/2,width:rw,height:rh};
}
export function overlap(a:Rect,b:Rect):number {
  return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
}
export class HardConstraintsValidator {
  validate(scene:UniverseScene, manifest:AssetManifest, c:GeneratorConfig):string[] {
    const errors:string[]=[], dominant=scene.objects.filter(o=>o.dominant), used=new Set<string>();
    if(!dominant.length)errors.push('no-focal-object');
    let memory=0;
    for(const o of scene.objects) {
      const a=manifest.assets.find(a=>a.id===o.assetId);
      if(!a){errors.push('missing-asset');continue;}
      if(!a.mask.approved || a.mask.edgeAlphaMax>0.01)errors.push('unapproved-mask');
      if(![o.x,o.y,o.size,o.rotation,o.brightness].every(Number.isFinite)||o.size<=0)errors.push('invalid-geometry');
      if(o.dominant && used.has(o.assetId))errors.push('duplicate-focal');
      if(o.dominant)used.add(o.assetId);
      const b=bounds(o,scene.aspect,a);
      if(o.kind==='planet' && (b.x<0||b.y<0||b.x+b.width>1||b.y+b.height>1))errors.push('planet-clipped');
      const visible=overlap(b,{x:0,y:0,width:1,height:1})/Math.max(0.0001,b.width*b.height);
      if(o.dominant && visible<(o.kind==='nebula'?.38:.62))errors.push('focal-clipped');
      const covered=c.safeZones.reduce((sum,z)=>sum+overlap(b,z)*(z.weight??1),0)/Math.max(0.0001,b.width*b.height);
      if(o.dominant && covered>0.78)errors.push('focal-obscured');
      const variant=o.dominant?a.variants.large:a.variants.medium;memory+=variant.width*variant.height*4*1.34/1048576;
    }
    if(memory>c.memoryBudgetMB)errors.push('texture-budget');
    return [...new Set(errors)];
  }
}
/** Low-resolution proxy assembled from actual offline luminance maps, never full texture decoding. */
export function rasterPreview(scene:UniverseScene,manifest:AssetManifest,width=48,height=72):number[] {
  const pixels=new Array<number>(width*height).fill(0.007);
  for(const o of scene.objects) {
    const a=manifest.assets.find(a=>a.id===o.assetId); if(!a)continue;
    const w=o.size*Math.min(1,1/scene.aspect),h=o.size*Math.min(1,scene.aspect)*a.variants.large.height/a.variants.large.width;
    const co=Math.cos(-o.rotation),si=Math.sin(-o.rotation);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const dx=(x/width-o.x)*scene.aspect,dy=y/height-o.y;
      const u=(dx*co-dy*si)/(w*scene.aspect)+0.5,v=(dx*si+dy*co)/h+0.5;
      if(u<0||v<0||u>=1||v>=1)continue;
      const l=a.metrics.luminance[Math.floor(v*16)*16+Math.floor(u*16)]??0;
      const i=y*width+x;pixels[i]=clamp(pixels[i]!+l*o.brightness);
    }
  }
  for(const s of scene.stars) {const i=Math.min(pixels.length-1,Math.floor(s.y*height)*width+Math.floor(s.x*width));pixels[i]=clamp(pixels[i]!+s.brightness*s.size*s.size*.012);}
  return pixels;
}
export class ReferenceImageQualityEvaluator {
  compare(pixels:number[], reference:ImageMetrics):number {
    const bins=new Array<number>(16).fill(0);
    for(const p of pixels)bins[Math.min(15,Math.floor(p*16))]!+=1/pixels.length;
    const distance=bins.reduce((n,v,i)=>n+Math.abs(v-(reference.histogram[i]??0)),0)/2;
    return clamp(1-distance);
  }
}
export class DiversityMemory {
  private scenes: UniverseScene[]=[];
  similarity(scene:UniverseScene):number {
    return this.scenes.reduce((best,prev)=>{
      const focal=scene.objects.find(o=>o.dominant),p=prev.objects.find(o=>o.dominant);
      if(!focal||!p)return best;
      const sameAsset=focal.assetId===p.assetId?0.5:0;
      const position=Math.max(0,1-Math.hypot(focal.x-p.x,focal.y-p.y)*3)*0.3;
      return Math.max(best,sameAsset+position+(scene.type===prev.type?0.2:0));
    },0);
  }
  remember(scene:UniverseScene):void {this.scenes.push(scene);if(this.scenes.length>8)this.scenes.shift();}
}
export class UniverseCompositionEvaluator {
  readonly validator=new HardConstraintsValidator();
  evaluate(scene:UniverseScene, manifest:AssetManifest, c:GeneratorConfig, preview=false):Score {
    const assets=scene.objects.map(o=>manifest.assets.find(a=>a.id===o.assetId)).filter((a):a is AstroAsset=>!!a);
    const focal=scene.objects.find(o=>o.dominant),fa=assets.find(a=>a.id===focal?.assetId);
    const fb=focal&&fa?bounds(focal,scene.aspect,fa):{x:0,y:0,width:0,height:0};
    const thirds=focal?Math.min(...[1/3,2/3].flatMap(x=>[1/3,2/3].map(y=>Math.hypot(focal.x-x,focal.y-y)))):1;
    let collisions=0,coverage=0,sx=0,sy=0,mass=0,occlusion=0;
    scene.objects.forEach((o,i)=>{
      const a=assets.find(a=>a.id===o.assetId);if(!a)return;
      const b=bounds(o,scene.aspect,a),weight=b.width*b.height*o.brightness*(0.25+a.metrics.contrast);
      coverage+=b.width*b.height*(o.kind==='nebula'?0.65:0.55);sx+=o.x*weight;sy+=o.y*weight;mass+=weight;
      c.safeZones.forEach(z=>occlusion+=overlap(b,z)*o.brightness*(z.weight??1));
      scene.objects.slice(i+1).forEach(p=>{const pa=assets.find(a=>a.id===p.assetId);if(pa&&o.kind!=='nebula'&&p.kind!=='nebula')collisions+=overlap(b,bounds(p,scene.aspect,pa))/Math.max(0.01,b.width*b.height);});
    });
    const visible=overlap(fb,{x:0,y:0,width:1,height:1})/Math.max(0.0001,fb.width*fb.height);
    const balance=mass?Math.hypot(sx/mass-0.5,sy/mass-0.5):1;
    const target=scene.type==='nebula-landscape'?0.7:0.5;
    const ratios:Weights={
      composition:clamp(1-thirds*0.9-collisions*0.35),
      coherence:clamp(1-collisions*0.3),
      naturalness:clamp(.94-collisions*.35),
      balance:clamp(1-Math.abs(balance-0.18)*0.85),
      focal:clamp(visible*(focal?1-Math.max(0,0.28-focal.size)*2:0)*(fa?0.78+Math.min(0.22,fa.metrics.detail*4):0)),
      readability:clamp(1-occlusion*2),
      depth:clamp(0.72+new Set(scene.objects.map(o=>o.depth)).size*0.065+(scene.stars.length>1800?0.12:0)),
      harmony:clamp(0.98-assets.reduce((n,a)=>n+Math.max(0,(a.metrics.color[1]??0)-(a.metrics.color[2]??0)-0.15),0)*0.5),
      negativeSpace:clamp(1-Math.abs(Math.min(1,coverage*.65)-target)*.7)
    };
    const pixels=preview?rasterPreview(scene,manifest):[];
    const mean=pixels.length?pixels.reduce((a,b)=>a+b,0)/pixels.length:0;
    const contrast=pixels.length?Math.sqrt(pixels.reduce((n,p)=>n+(p-mean)**2,0)/pixels.length):0;
    const darkFraction=pixels.length?pixels.filter(p=>p<0.055).length/pixels.length:0;
    const similarity=preview?new ReferenceImageQualityEvaluator().compare(pixels,manifest.reference):0;
    const structureCoverage=preview?1-darkFraction:Math.min(1,coverage*.45);
    const occupancy=clamp(structureCoverage/.48);
    ratios.negativeSpace=clamp(1-Math.abs(structureCoverage-.5)*1.6);
    ratios.depth=clamp(.25+occupancy*.5+(preview?clamp(contrast/.14):.85)*.25);
    ratios.focal=clamp(ratios.focal*(.65+.35*occupancy));
    ratios.coherence*=.7+.3*occupancy;
    ratios.naturalness*=.8+.2*occupancy;
    const maximum={...c.weights},breakdown={} as Weights;
    for(const k of CRITERIA)breakdown[k]=Math.round(ratios[k]*maximum[k]*100)/100;
    const sum=Object.values(maximum).reduce((a,b)=>a+b,0);
    const total=Math.round(Object.values(breakdown).reduce((a,b)=>a+b,0)/sum*1000)/10;
    const violations=this.validator.validate(scene,manifest,c);
    if(preview&&c.nebulae.enabled&&structureCoverage<.27)violations.push('insufficient-visible-structure');
    if(preview&&c.nebulae.enabled&&contrast<.055)violations.push('flat-photographic-landscape');
    return {total,breakdown,maximum,violations,accepted:!violations.length&&total>=c.minScore,referenceSimilarity:similarity,preview:{darkFraction,contrast,mean}};
  }
}
