import {describe,it,expect} from 'vitest';
import manifestJson from '../packages/assets/manifest.json';
import type {AssetManifest} from '../packages/core/src/types';
import {DEFAULT_CONFIG,configure,UniverseGenerator,ProceduralAstronomicalSynthesisEngine,sampleStructure,proceduralMetrics,NASAStylePhotometricRenderer,validRecipe} from '../packages/generator/src/index';
import {HardConstraintsValidator,VisualQualityIntelligence} from '../packages/composition/src/index';
const manifest=manifestJson as AssetManifest,g=new UniverseGenerator(manifest),synthesis=new ProceduralAstronomicalSynthesisEngine();
describe('Astronomical synthesis',()=>{
 it('creates reproducible fields with new structures for new seeds and morphologies',()=>{
  const a=synthesis.recipe('galaxy','one',DEFAULT_CONFIG.synthesis,[-.6,0,.8]),b=synthesis.recipe('galaxy','one',DEFAULT_CONFIG.synthesis,[-.6,0,.8]);
  expect(a).toEqual(b);expect(proceduralMetrics(a)).toEqual(proceduralMetrics(b));
  expect(proceduralMetrics(a).luminance).not.toEqual(proceduralMetrics(synthesis.recipe('galaxy','two',DEFAULT_CONFIG.synthesis,[-.6,0,.8])).luminance);
  const maps=new Set(['spiral','barred','elliptical','lenticular','irregular','edge-on','interacting'].map(m=>JSON.stringify(proceduralMetrics({...a,morphology:m as typeof a.morphology}).luminance)));
  expect(maps.size).toBe(7);
 });
 it('fades field borders and shades a sphere from the shared light direction',()=>{
  for(const kind of ['galaxy','nebula'] as const){const p=synthesis.recipe(kind,kind,DEFAULT_CONFIG.synthesis,[-.6,0,.8]);expect(sampleStructure(p,0,.5).rgb).toEqual([0,0,0]);}
  const p={...synthesis.recipe('planet','planet',DEFAULT_CONFIG.synthesis,[-1,0,0]),surface:'ice' as const,rings:false};
  expect(sampleStructure(p,.25,.5).rgb.reduce((a,b)=>a+b)).toBeGreaterThan(sampleStructure(p,.75,.5).rgb.reduce((a,b)=>a+b)*3);
  expect(sampleStructure(p,0,0).alpha).toBeLessThan(.001);
 });
 it('supports pure synthesis, observed planets and photographic compatibility',()=>{
  const pure=g.generate('synthesis',configure(DEFAULT_CONFIG,{synthesis:{mode:'procedural',planets:'procedural'},sceneType:'planetary-vista'})).scene;
  expect(pure.objects.every(o=>o.procedural?.detailMix===0)).toBe(true);
  expect(pure.objects.some(o=>o.kind==='planet'&&o.procedural)).toBe(true);
  const photo=g.generate('compat',configure(DEFAULT_CONFIG,{synthesis:{mode:'photographic'}})).scene;
  expect(photo.objects.every(o=>!o.procedural)).toBe(true);
  const observed=g.generate('observed',configure(DEFAULT_CONFIG,{synthesis:{planets:'photographic'},sceneType:'planetary-vista'})).scene;
  expect(observed.objects.filter(o=>o.kind==='planet').every(o=>!o.procedural)).toBe(true);
 });
 it('keeps a multiscale hierarchy and evaluates the generated fields',()=>{
  const scene=g.generate('hierarchy',DEFAULT_CONFIG).scene,d=new VisualQualityIntelligence().analyze(scene,manifest);
  expect(d.proceduralObjects).toBeGreaterThan(0);expect(d.scaleRange).toBeGreaterThan(3);expect(d.contrast).toBeGreaterThan(.055);
  expect(scene.objects.filter(o=>o.kind==='galaxy').every(o=>o.size<=1)).toBe(true);
 });
 it('rejects corrupt recipes and controls finite HDR output',()=>{
  const scene=g.generate('corrupt',DEFAULT_CONFIG).scene,o=scene.objects.find(o=>o.procedural)!;
  o.procedural!.inclination=0;expect(validRecipe(o.procedural!,o.kind)).toBe(false);
  expect(new HardConstraintsValidator().validate(scene,manifest,scene.config)).toContain('invalid-synthesis');
  const mapper=new NASAStylePhotometricRenderer('scientific');for(const v of [0,.01,1,10,1e6])expect(mapper.map([v,v,v]).every(c=>Number.isFinite(c)&&c>=0&&c<=1)).toBe(true);
  expect(mapper.map([10,10,10])[0]).toBeGreaterThan(mapper.map([1,1,1])[0]!);
  expect(()=>configure(DEFAULT_CONFIG,{synthesis:{detailMix:NaN}})).toThrow();
 });
});
