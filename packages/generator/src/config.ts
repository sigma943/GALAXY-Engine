import type {GeneratorConfig, GeneratorPatch} from '../../core/src/types';
export const DEFAULT_CONFIG: GeneratorConfig = {
  sceneType:'random', candidates:20, minScore:85, aspect:0.65, memoryBudgetMB:160,
  weights:{composition:20,coherence:15,naturalness:15,balance:10,focal:10,readability:10,depth:10,harmony:5,negativeSpace:5},
  sceneProbabilities:{'galaxy-showcase':25,'planetary-vista':20,'nebula-landscape':20,'deep-space':15,'galaxy-planet':15,'cinematic-space':5},
  safeZones:[], stars:{density:1,brightness:1.15,glow:1,twinkle:true},
  galaxies:{frequency:0.85,scale:1,brightness:1,preferredTypes:[]},
  planets:{enabled:true,frequency:0.3,maxSize:0.5,preferredTypes:[]},
  nebulae:{enabled:true,frequency:1,brightness:0.95,intensity:0.9}
};
export function configure(base: GeneratorConfig, patch: GeneratorPatch): GeneratorConfig {
  const c={...base,...patch,stars:{...base.stars,...patch.stars},galaxies:{...base.galaxies,...patch.galaxies},planets:{...base.planets,...patch.planets},nebulae:{...base.nebulae,...patch.nebulae}};
  if (!Number.isFinite(c.aspect) || c.aspect<=0) throw new Error('Aspect must be positive');
  c.candidates=Math.max(12,Math.min(24,Math.round(c.candidates)));
  c.minScore=Math.max(0,Math.min(100,c.minScore));
  c.stars.density=Math.max(0.2,Math.min(2,c.stars.density));
  c.planets.maxSize=Math.max(0.15,Math.min(0.8,c.planets.maxSize));
  if (Object.values(c.weights).some(v=>!Number.isFinite(v)||v<0) || Object.values(c.weights).reduce((a,b)=>a+b,0)<=0) throw new Error('Invalid scoring weights');
  if (Object.values(c.sceneProbabilities).some(v=>!Number.isFinite(v)||v<0) || Object.values(c.sceneProbabilities).reduce((a,b)=>a+b,0)<=0) throw new Error('Invalid scene probabilities');
  return structuredClone(c);
}
