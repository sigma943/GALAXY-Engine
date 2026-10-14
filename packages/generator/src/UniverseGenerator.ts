import type {AssetManifest,AstroAsset,GenerationResult,GeneratorConfig,SceneObject,SceneType,UniverseScene} from '../../core/src/types';
import {UniverseCompositionEvaluator,bounds} from '../../composition/src/index';
import {SeededRandom} from './SeededRandom';
import {generateStars} from './StarGenerator';
import {MultiScaleUniverseComposer} from '../../composition/src/MultiScaleUniverseComposer';
import {ProceduralAstronomicalSynthesisEngine} from './synthesis/ProceduralAstronomicalSynthesisEngine';
export const GENERATOR_VERSION='6.0.0';
export class UniverseGenerator {
 readonly evaluator=new UniverseCompositionEvaluator();
 constructor(readonly manifest:AssetManifest){}
 generate(seed:string|number,config:GeneratorConfig):GenerationResult {
  const key=String(seed),c=structuredClone(config),rng=new SeededRandom(key+':type');
  let type=c.sceneType==='random'?this.selectType(rng,c):c.sceneType;
  if(type==='planetary-vista'&&!c.planets.enabled)type='galaxy-showcase';
  if(type==='nebula-landscape'&&!c.nebulae.enabled)type='galaxy-showcase';
  const stars=generateStars(key,c.stars.density,c.stars.brightness),candidates:UniverseScene[]=[];let improvements=0;
  for(let i=0;i<c.candidates;i++){
   const scene=this.candidate(key,type,i,c,stars);scene.score=this.evaluator.evaluate(scene,this.manifest,c,false);
   if(!scene.score.accepted){for(let n=0;n<3;n++){const variant=structuredClone(scene);for(const o of variant.objects)if(o.kind==='nebula'){o.brightness=Math.min(1,o.brightness*1.12);o.size*=1.035;}variant.score=this.evaluator.evaluate(variant,this.manifest,c,false);if(variant.score.violations.length<=scene.score.violations.length&&variant.score.total>scene.score.total){Object.assign(scene,variant);improvements++;}}}
   candidates.push(scene);
  }
  const shortlist=candidates.filter(s=>!s.score.violations.length).sort((a,b)=>b.score.total-a.score.total).slice(0,5);
  for(const s of shortlist){s.score=this.evaluator.evaluate(s,this.manifest,c,true);}
  shortlist.sort((a,b)=>b.score.total-a.score.total);
  const scene=shortlist.find(s=>s.score.accepted);if(!scene||!scene.score.accepted)throw new Error(`Seed ${key}: scene does not meet measured coverage/detail constraints; previous scene retained`);
  scene.stars=generateStars(key,c.stars.density,c.stars.brightness,scene.objects,c.aspect);
  scene.score=this.evaluator.evaluate(scene,this.manifest,c,true);
  if(!scene.score.accepted)throw new Error(`Seed ${key}: populated scene failed quality constraints`);
  return {scene,candidates:shortlist.concat(candidates.filter(s=>!shortlist.includes(s))),rejected:candidates.filter(s=>!s.score.accepted).length,improvements};
 }
 private selectType(r:SeededRandom,c:GeneratorConfig):SceneType{const rows=Object.entries(c.sceneProbabilities) as [SceneType,number][];let p=r.next()*rows.reduce((n,[,v])=>n+v,0);for(const[t,v]of rows){p-=v;if(p<0)return t;}return rows[0]![0];}
 private choose(kind:AstroAsset['kind'],r:SeededRandom,c:GeneratorConfig,exclude:string[],dominant:boolean):AstroAsset{
  let list=this.manifest.assets.filter(a=>a.kind===kind&&!exclude.includes(a.id)&&a.mask.approved);
  const prefs=kind==='planet'?c.planets.preferredTypes:kind==='galaxy'?c.galaxies.preferredTypes:[];
  if(prefs.length){const filtered=list.filter(a=>prefs.includes(a.subtype)||prefs.includes(a.id));if(filtered.length)list=filtered;}
  if(kind==='galaxy'&&dominant&&!prefs.length){const hero=list.filter(a=>['m51','m101'].includes(a.id));if(hero.length)list=hero;}
  return r.pick(list);
 }
 private fitPlanet(o:SceneObject,c:GeneratorConfig):void{const a=this.manifest.assets.find(a=>a.id===o.assetId)!;const b=bounds(o,c.aspect,a);o.x=Math.max(b.width/2+.035,Math.min(1-b.width/2-.035,o.x));o.y=Math.max(b.height/2+.035,Math.min(1-b.height/2-.035,o.y));}
 private candidate(seed:string,type:SceneType,i:number,c:GeneratorConfig,stars:UniverseScene['stars']):UniverseScene{
  const r=new SeededRandom(`${seed}:candidate:${i}`),objects:SceneObject[]=[];
  const add=(kind:AstroAsset['kind'],size:number,x:number,y:number,dominant=false,brightness=1,rotation=0,assetId?:string)=>{
   const a=assetId?this.manifest.assets.find(a=>a.id===assetId)!:this.choose(kind,dominant?new SeededRandom(seed+':focal'):r,c,objects.filter(o=>o.kind===kind).map(o=>o.assetId),dominant);
   const o:SceneObject={assetId:a.id,kind,size,x,y,dominant,brightness,rotation,depth:kind==='nebula'?.2:kind==='galaxy'?.55:.9,blendMode:kind==='planet'?'normal':'screen'};
   if(kind==='planet')this.fitPlanet(o,c);objects.push(o);return o;
  };
  // A connected photographic landscape spans the frame instead of isolated stickers.
  if(c.nebulae.enabled&&r.next()<c.nebulae.frequency){
   const isLandscape=type==='nebula-landscape';
   const top=add('nebula',r.range(1.65,2.0),r.range(.02,.22),r.range(.28,.42),isLandscape,c.nebulae.brightness*r.range(.52,.72),r.range(.85,1.25),'veil');
   if(isLandscape){top.dominant=false;}
   add('nebula',r.range(1.3,1.6),r.range(.72,.95),r.range(.56,.7),isLandscape,c.nebulae.brightness*r.range(.62,.86),r.range(-.3,.24),(isLandscape?new SeededRandom(seed+':focal'):r).pick(['orion','eagle','lagoon']));
   add('nebula',r.range(1.55,1.8),r.range(.18,.42),r.range(.9,1.0),false,c.nebulae.brightness*c.nebulae.intensity*r.range(.3,.52),r.range(-.45,-.08),r.pick(['tarantula','carina','ngc3324']));
  }
  if(type==='planetary-vista'){
   add('planet',Math.min(c.planets.maxSize,r.range(.45,.59)),r.range(.35,.62),r.range(.4,.54),true);
   add('galaxy',r.range(.74,.95),r.range(.52,.76),r.range(.16,.25),false,c.galaxies.brightness*.9,r.range(-.35,.35));
  }else if(type!=='nebula-landscape'){
   add('galaxy',r.range(1.08,1.32)*c.galaxies.scale,r.range(.54,.67),r.range(.2,.3),true,c.galaxies.brightness,r.range(-.28,.28));
  }
  if(type==='nebula-landscape'&&!objects.some(o=>o.dominant))add('galaxy',1.1,.55,.28,true);
  if(type!=='planetary-vista'&&r.next()<c.galaxies.frequency){add('galaxy',r.range(.5,.74),r.range(.28,.52),r.range(.67,.79),false,c.galaxies.brightness*.83,r.range(-.7,-.3));}
  if(['galaxy-planet','cinematic-space'].includes(type)&&c.planets.enabled&&r.next()<c.planets.frequency){add('planet',Math.min(c.planets.maxSize,r.range(.28,.39)),r.range(.65,.76),r.range(.78,.88),false,.95,r.range(-.25,.05));}
  if(type==='cinematic-space'&&r.next()<.6){add('galaxy',.27,r.range(.15,.3),.5,false,.7,.28);}
  if(c.synthesis.mode!=='photographic'){
   new MultiScaleUniverseComposer().compose(objects,type,c,r);
   const synthesis=new ProceduralAstronomicalSynthesisEngine(),sceneHue=new SeededRandom(seed+':palette').next();
   const light:[number,number,number]=[-.64,-.35,.68];
   const length=Math.hypot(...light);for(let n=0;n<3;n++)light[n]=light[n]!/length;
   objects.forEach((o,n)=>{
    if(o.kind==='planet'&&(c.synthesis.planets==='photographic'||(c.synthesis.planets==='mixed'&&(c.planets.preferredTypes.length||r.next()<.5))))return;
    const co=Math.cos(o.rotation),si=Math.sin(o.rotation);
    const localLight:[number,number,number]=[light[0]*co+light[1]*si,-light[0]*si+light[1]*co,light[2]];
    o.procedural=synthesis.recipe(o.kind,`${seed}:structure:${i}:${n}`,c.synthesis,localLight,c.galaxies.preferredTypes[0]);
    if(o.kind==='nebula')o.procedural.hue=sceneHue;
    if(o.kind==='planet')this.fitPlanet(o,c);
   });
  }
  objects.sort((a,b)=>a.depth-b.depth);
  return {schemaVersion:1,generatorVersion:GENERATOR_VERSION,assetVersion:this.manifest.version,seed,type,aspect:c.aspect,objects,stars,palette:[0x010208,0x244f83,0x903d6b],config:c,candidateIndex:i,score:{total:0,breakdown:c.weights,maximum:c.weights,violations:[],accepted:false,referenceSimilarity:0,preview:{darkFraction:0,contrast:0,mean:0}}};
 }
}
