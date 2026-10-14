import type {ProceduralRecipe} from '../../core/src/types';
import {sampleStructure,validRecipe} from '../../generator/src/synthesis/ProceduralAstronomicalSynthesisEngine';
import {NASAStylePhotometricRenderer,toLinear} from '../../generator/src/synthesis/PhotometricRenderer';
import {hash} from '../../generator/src/synthesis/fields';
/** Bounded texture baking only at scene changes. Yield rows so Android's UI remains responsive. */
export async function bakeSynthesisTexture(recipe:ProceduralRecipe,size:number,source?:CanvasImageSource,alive:()=>boolean=()=>true):Promise<HTMLCanvasElement> {
 if(!validRecipe(recipe,recipe.kind)||!Number.isInteger(size)||size<16||size>4096)throw new Error('Invalid synthesis texture');
 const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
 const ctx=canvas.getContext('2d')!;const pixels=ctx.createImageData(size,size),mapper=new NASAStylePhotometricRenderer(recipe.profile);
 let detail:Uint8ClampedArray|undefined;
 if(source&&recipe.detailMix>0&&recipe.kind!=='planet'){
  const reference=document.createElement('canvas');reference.width=128;reference.height=128;
  const c=reference.getContext('2d',{willReadFrequently:true})!;c.drawImage(source,0,0,128,128);detail=c.getImageData(0,0,128,128).data;
 }
 for(let y=0;y<size;y++){
  if(!alive())throw new Error('Synthesis cancelled');
  for(let x=0;x<size;x++){
   const u=(x+.5)/size,v=(y+.5)/size,s=sampleStructure(recipe,u,v),i=(y*size+x)*4;
   if(detail){
    // Modulate generated emission with fine-scale observed texture, never its silhouette.
    const dx=(Math.floor(u*512+recipe.seed%127)%128+128)%128,dy=(Math.floor(v*512)%128+128)%128,j=(dy*128+dx)*4;
    const l=toLinear(detail[j]!/255)*.2126+toLinear(detail[j+1]!/255)*.7152+toLinear(detail[j+2]!/255)*.0722;
    const factor=1+(l-.2)*recipe.detailMix*2;s.rgb=s.rgb.map(c=>c*factor) as [number,number,number];
   }
   const rgb=mapper.map(s.rgb,(hash(x,y,recipe.seed)-.5)/255);
   for(let channel=0;channel<3;channel++)pixels.data[i+channel]=Math.round(rgb[channel]!*255);
   pixels.data[i+3]=Math.round(s.alpha*255);
  }
  if(y%24===23)await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 ctx.putImageData(pixels,0,0);return canvas;
}
