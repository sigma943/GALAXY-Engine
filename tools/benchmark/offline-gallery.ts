/** Export the FIRST 20 seeds without visual selection. Images are offline approximations. */
import {writeFileSync} from 'node:fs';
import json from '../../packages/assets/manifest.json';
import type {AssetManifest} from '../../packages/core/src/types';
import {UniverseGenerator,DEFAULT_CONFIG} from '../../packages/generator/src/index';
const generator=new UniverseGenerator(json as AssetManifest);
const scenes=Array.from({length:20},(_,i)=>generator.generate(i,DEFAULT_CONFIG).scene);
writeFileSync('reports/gallery/scenes.json',JSON.stringify(scenes));
console.log('Exported consecutive seeds 0–19');
