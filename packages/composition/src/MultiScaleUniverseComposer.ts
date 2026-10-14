import type {GeneratorConfig,SceneObject,SceneType} from '../../core/src/types';
import {SeededRandom} from '../../generator/src/SeededRandom';
/** Hierarchy is measured in fractions of the viewport's shorter dimension. */
export class MultiScaleUniverseComposer {
 compose(objects:SceneObject[],type:SceneType,c:GeneratorConfig,r:SeededRandom):void {
  const galaxies=objects.filter(o=>o.kind==='galaxy');
  for(const o of galaxies){o.size=Math.min(.94,o.size)*c.galaxies.scale;if(o.dominant)o.size=Math.min(.98,r.range(.7,.9)*c.galaxies.scale);else o.size=r.range(.22,.38);}
  const hero=galaxies[0];
  if(hero){
   const count=Math.round(2+r.next()*2);
   for(let i=0;i<count;i++)if(r.next()<c.galaxies.frequency){
    const positions=[[.18,.14],[.82,.52],[.16,.88],[.86,.92]];
    const [x,y]=positions[i]!;
    objects.push({...hero,dominant:false,size:r.range(.08,.19),x:x!+r.range(-.04,.04),y:y!+r.range(-.04,.04),rotation:r.range(-Math.PI,Math.PI),brightness:c.galaxies.brightness*r.range(.5,.8),depth:.4});
   }
  }
  if(type==='deep-space')for(const o of galaxies)o.size*=.8;
  // Nebula fields form connected, overlapping gas layers; planets stay in the foreground.
  objects.sort((a,b)=>a.depth-b.depth);
 }
}
