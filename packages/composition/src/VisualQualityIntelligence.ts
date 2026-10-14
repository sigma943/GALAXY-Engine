import type {AssetManifest,UniverseScene} from '../../core/src/types';
import {rasterPreview} from './index';
/** Lightweight diagnostics for offline calibration. Scores are not aesthetic proof. */
export class VisualQualityIntelligence {
 analyze(scene:UniverseScene,manifest:AssetManifest){
  const pixels=rasterPreview(scene,manifest,64,64),sizes=scene.objects.filter(o=>o.kind!=='nebula').map(o=>o.size);
  const mean=pixels.reduce((sum,p)=>sum+p,0)/pixels.length;
  let gradients=0;for(let y=0;y<64;y++)for(let x=1;x<64;x++)gradients+=Math.abs(pixels[y*64+x]!-pixels[y*64+x-1]!);
  return {mean,contrast:Math.sqrt(pixels.reduce((sum,p)=>sum+(p-mean)**2,0)/pixels.length),
   darkFraction:pixels.filter(p=>p<.055).length/pixels.length,clippedHighlights:pixels.filter(p=>p>.98).length/pixels.length,
   scaleRange:sizes.length?Math.max(...sizes)/Math.min(...sizes):1,detail:gradients/pixels.length,
   proceduralObjects:scene.objects.filter(o=>o.procedural).length};
 }
}
