import type {AssetManifest, AstroAsset, GenerationResult, GeneratorConfig, SceneObject, SceneType, UniverseScene} from '../../core/src/types';
import {UniverseCompositionEvaluator,bounds} from '../../composition/src/index';
import {SeededRandom} from './SeededRandom';
import {generateStars} from './StarGenerator';
export const GENERATOR_VERSION='5.0.0';
export class UniverseGenerator {
  readonly evaluator=new UniverseCompositionEvaluator();
  constructor(readonly manifest:AssetManifest){}
  generate(seed:string|number,config:GeneratorConfig):GenerationResult {
    const key=String(seed),r=new SeededRandom(key+':type');
    const c=structuredClone(config);
    let type:SceneType=c.sceneType==='random'?this.selectType(r,c):c.sceneType;
    if(type==='planetary-vista'&&!c.planets.enabled)type='galaxy-showcase';
    if(type==='nebula-landscape'&&!c.nebulae.enabled)type='galaxy-showcase';
    const stars=generateStars(key,c.stars.density,c.stars.brightness);
    const candidates:UniverseScene[]=[]; let improvements=0;
    for(let i=0;i<c.candidates;i++) {
      const scene=this.candidate(key,type,i,c,stars);
      scene.score=this.evaluator.evaluate(scene,this.manifest,c);
      if(!scene.score.accepted) {
        for(let n=0;n<4;n++) {
          const variant=structuredClone(scene);
          const o=variant.objects.find(o=>o.dominant);
          if(!o)break;
          o.x+=((i%2?2/3:1/3)-o.x)*0.08;o.y+=(1/3-o.y)*0.2;
          this.fit(o,c.aspect);
          variant.score=this.evaluator.evaluate(variant,this.manifest,c);
          if(variant.score.violations.length<scene.score.violations.length||(!variant.score.violations.length&&variant.score.total>scene.score.total)) {Object.assign(scene,variant);improvements++;}
        }
      }
      candidates.push(scene);
    }
    const shortlist=candidates.filter(s=>!s.score.violations.length).sort((a,b)=>b.score.total-a.score.total).slice(0,5);
    for(const scene of shortlist)scene.score=this.evaluator.evaluate(scene,this.manifest,c,true);
    const best=shortlist.sort((a,b)=>b.score.total-a.score.total)[0];
    if(!best||!best.score.accepted)throw new Error(`No accepted composition for seed ${key}; previous scene retained`);
    return {scene:best,candidates:[...candidates].sort((a,b)=>b.score.total-a.score.total),rejected:candidates.filter(s=>!s.score.accepted).length,improvements};
  }
  private selectType(r:SeededRandom,c:GeneratorConfig):SceneType {
    const rows=Object.entries(c.sceneProbabilities) as [SceneType,number][];
    let p=r.next()*rows.reduce((n,[,v])=>n+v,0);
    for(const [t,v] of rows){p-=v;if(p<0)return t;}
    return rows[0]![0];
  }
  private choose(kind:AstroAsset['kind'],r:SeededRandom,c:GeneratorConfig,exclude:string[]=[]):AstroAsset {
    let list=this.manifest.assets.filter(a=>a.kind===kind&&!exclude.includes(a.id)&&a.mask.approved);
    const prefs=kind==='planet'?c.planets.preferredTypes:kind==='galaxy'?c.galaxies.preferredTypes:[];
    if(prefs.length){const preferred=list.filter(a=>prefs.includes(a.subtype)||prefs.includes(a.id));if(preferred.length)list=preferred;}
    return r.pick(list);
  }
  private fit(o:SceneObject,aspect:number):void {
    const a=this.manifest.assets.find(a=>a.id===o.assetId)!;
    const b=bounds(o,aspect,a);
    const mx=Math.min(0.48,b.width/2+0.035),my=Math.min(0.48,b.height/2+0.035);
    o.x=Math.max(mx,Math.min(1-mx,o.x));o.y=Math.max(my,Math.min(1-my,o.y));
  }
  private candidate(seed:string,type:SceneType,i:number,c:GeneratorConfig,stars:UniverseScene['stars']):UniverseScene {
    const r=new SeededRandom(`${seed}:candidate:${i}`),objects:SceneObject[]=[];
    const add=(kind:AstroAsset['kind'],size:number,dominant:boolean,x?:number,y?:number)=>{
      const a=this.choose(kind,r,c,objects.filter(o=>o.kind===kind).map(o=>o.assetId));
      const o:SceneObject={assetId:a.id,kind,size,x:x??r.range(0.28,0.72),y:y??r.range(0.23,0.7),rotation:kind==='planet'?r.range(-0.15,0.15):r.range(-0.45,0.45),brightness:kind==='nebula'?c.nebulae.brightness:kind==='galaxy'?c.galaxies.brightness:1,depth:kind==='planet'?0.9:kind==='galaxy'?0.5:0.2,dominant};
      this.fit(o,c.aspect);objects.push(o);
    };
    if(type==='planetary-vista')add('planet',r.range(0.45,c.planets.maxSize),true,r.range(0.35,0.65),r.range(0.3,0.65));
    else if(type==='nebula-landscape')add('nebula',r.range(0.85,1.2),true,0.5,r.range(0.35,0.6));
    else add('galaxy',type==='deep-space'?r.range(0.3,0.43):r.range(0.78,1.0)*c.galaxies.scale,true,r.range(0.38,0.62),r.range(0.27,0.46));
    if(['galaxy-planet','cinematic-space'].includes(type)&&c.planets.enabled)add('planet',Math.min(c.planets.maxSize,r.range(0.26,0.38)),false,r.range(0.3,0.68),r.range(0.7,0.8));
    if(type==='planetary-vista'&&r.next()<c.galaxies.frequency)add('galaxy',r.range(0.18,0.3),false,r.range(0.2,0.8),r.range(0.15,0.25));
    if(type==='deep-space') {add('galaxy',r.range(0.12,0.22),false,r.range(0.2,0.7),0.75);}
    if(type!=='nebula-landscape'&&c.nebulae.enabled&&r.next()<c.nebulae.frequency) {add('nebula',r.range(1.1,1.45),false,r.next()<0.5?0.25:0.75,r.range(0.55,0.8));objects[objects.length-1]!.brightness*=c.nebulae.intensity*0.85;}
    if(type==='cinematic-space'&&r.next()<c.galaxies.frequency)add('galaxy',0.18,false,0.22,0.75);
    if(!['planetary-vista','galaxy-planet','cinematic-space'].includes(type)&&c.planets.enabled&&r.next()<c.planets.frequency*0.2)add('planet',0.17,false,0.75,0.8);
    objects.sort((a,b)=>a.depth-b.depth);
    return {schemaVersion:1,generatorVersion:GENERATOR_VERSION,assetVersion:this.manifest.version,seed,type,aspect:c.aspect,objects,stars,palette:[0x03050e,0x284576,0x7e405e],config:c,candidateIndex:i,score:{total:0,breakdown:c.weights,maximum:c.weights,violations:[],accepted:false,referenceSimilarity:0,preview:{darkFraction:0,contrast:0,mean:0}}};
  }
}
