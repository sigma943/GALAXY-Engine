/** Offline field rendering for visual review; does not claim to test WebGL or a device. */
import {mkdirSync,writeFileSync} from 'node:fs';
import json from '../../packages/assets/manifest.json';
import type {AssetManifest} from '../../packages/core/src/types';
import {UniverseGenerator,DEFAULT_CONFIG,sampleStructure,NASAStylePhotometricRenderer} from '../../packages/generator/src/index';
const dir='reports/synthesis-preview';mkdirSync(dir,{recursive:true});
const g=new UniverseGenerator(json as AssetManifest),scenes=[];
for(let seed=0;seed<20;seed++){
 const scene=g.generate(seed,DEFAULT_CONFIG).scene;scenes.push(scene);
 for(let n=0;n<scene.objects.length;n++){
  const p=scene.objects[n]!.procedural;if(!p)continue;
  const size=256,bytes=Buffer.alloc(size*size*4),mapper=new NASAStylePhotometricRenderer(p.profile);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const s=sampleStructure(p,(x+.5)/size,(y+.5)/size),rgb=mapper.map(s.rgb),i=(y*size+x)*4;
   for(let k=0;k<3;k++)bytes[i+k]=Math.round(rgb[k]!*255);bytes[i+3]=Math.round(s.alpha*255);
  }
  writeFileSync(`${dir}/${seed}-${n}.rgba`,bytes);
 }
}
writeFileSync(`${dir}/scenes.json`,JSON.stringify(scenes));console.log('Rendered fields for seeds 0–19; photograph detail modulation and GPU effects are excluded.');
