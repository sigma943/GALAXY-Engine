import {describe,it,expect} from 'vitest';
import manifestJson from '../packages/assets/manifest.json';
import type {AssetManifest,SceneType} from '../packages/core/src/types';
import {UniverseGenerator,DEFAULT_CONFIG,configure,SeededRandom} from '../packages/generator/src/index';
import {HardConstraintsValidator,DiversityMemory} from '../packages/composition/src/index';
import {MeteorEngine,METEOR_INTERVALS} from '../packages/renderer/src/MeteorEngine';
const manifest=manifestJson as AssetManifest;
const generator=new UniverseGenerator(manifest);
describe('100 independent seeds',()=>{
 it('reproduces objects, scores, stars and selection exactly',()=>{
  const types=new Set<string>(),assets=new Set<string>();let accepted=0;
  for(let i=0;i<100;i++) {
   const a=generator.generate(i,DEFAULT_CONFIG),b=generator.generate(i,DEFAULT_CONFIG);
   expect(a.scene).toEqual(b.scene);expect(a.scene.score.violations).toEqual([]);expect(a.scene.score.total).toBeGreaterThanOrEqual(85);
   expect(a.candidates.length).toBe(20);accepted++;types.add(a.scene.type);assets.add(a.scene.objects.find(o=>o.dominant)!.assetId);
  }
  expect(accepted).toBe(100);expect(types.size).toBe(6);expect(assets.size).toBeGreaterThan(10);
 });
 it('satisfies constraints for portrait and landscape in all scene styles',()=>{
  for(const aspect of [.46,.65,1.7])for(const sceneType of Object.keys(DEFAULT_CONFIG.sceneProbabilities) as SceneType[]) {
   const result=generator.generate('orientation:'+sceneType+aspect,configure(DEFAULT_CONFIG,{aspect,sceneType}));
   expect(result.scene.score.accepted).toBe(true);
  }
 });
 it('rejects missing textures, clipping, occlusion, invalid masks and budgets',()=>{
  const s=generator.generate('constraints',configure(DEFAULT_CONFIG,{sceneType:'planetary-vista'})).scene;
  const validator=new HardConstraintsValidator();
  const missing=structuredClone(s);missing.objects[0]!.assetId='missing';expect(validator.validate(missing,manifest,DEFAULT_CONFIG)).toContain('missing-asset');
  const clipped=structuredClone(s);clipped.objects.find(o=>o.kind==='planet')!.x=0;expect(validator.validate(clipped,manifest,DEFAULT_CONFIG)).toContain('planet-clipped');
  expect(validator.validate(s,manifest,{...DEFAULT_CONFIG,memoryBudgetMB:.1})).toContain('texture-budget');
  expect(validator.validate(s,manifest,{...DEFAULT_CONFIG,safeZones:[{x:0,y:0,width:1,height:1}]})).toContain('focal-obscured');
  const invalid=structuredClone(manifest);invalid.assets.forEach(a=>a.mask.edgeAlphaMax=1);expect(validator.validate(s,invalid,DEFAULT_CONFIG)).toContain('unapproved-mask');
 });
 it('handles disabled content and custom weights honestly',()=>{
  const c=configure(DEFAULT_CONFIG,{sceneType:'planetary-vista',planets:{enabled:false},nebulae:{enabled:false}}),s=generator.generate('disabled',c).scene;
  expect(s.objects.some(o=>o.kind==='planet'||o.kind==='nebula')).toBe(false);
  const a=generator.generate('weights',DEFAULT_CONFIG).scene;
  const total=Object.values(a.score.breakdown).reduce((n,v)=>n+v,0);expect(a.score.total).toBeCloseTo(total,0);
  expect(()=>configure(DEFAULT_CONFIG,{weights:{...DEFAULT_CONFIG.weights,focal:-1}})).toThrow();
 });
 it('detects repeated scenes without changing explicit seed replay',()=>{const memory=new DiversityMemory();const s=generator.generate('memory',DEFAULT_CONFIG).scene;expect(memory.similarity(s)).toBe(0);memory.remember(s);expect(memory.similarity(s)).toBeCloseTo(1);expect(generator.generate('memory',DEFAULT_CONFIG).scene).toEqual(s);});
});
describe('Meteors',()=>{
 it('respects specified intervals, durations and safe zones',()=>{
  expect(METEOR_INTERVALS.normal).toEqual([6,14]);expect(METEOR_INTERVALS.low).toEqual([20,35]);
  const scene=generator.generate('meteors',DEFAULT_CONFIG).scene,m=new MeteorEngine();m.reset('meteors');
  for(let i=0;i<50;i++){m.trigger(scene,420,900);if(m.meteor){expect(m.meteor.duration).toBeGreaterThanOrEqual(.4);expect(m.meteor.duration).toBeLessThanOrEqual(1.2);}}
  m.meteor=null;m.safeZones=[{x:-5,y:-5,width:10,height:10}];m.trigger(scene,420,900);expect(m.meteor).toBeNull();
  m.safeZones=[];m.trigger(scene,420,900);m.update(.1,scene,420,900,true);expect(m.meteor).toBeNull();
 });
 it('has reproducible random sequences',()=>{const a=new SeededRandom(12),b=new SeededRandom(12);expect(Array.from({length:100},()=>a.next())).toEqual(Array.from({length:100},()=>b.next()));});
});
