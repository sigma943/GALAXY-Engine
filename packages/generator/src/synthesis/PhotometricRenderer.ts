import type {PhotometricProfile} from '../../../core/src/types';
import {clamp} from './fields';
export function toLinear(c:number):number {return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}
export function toDisplay(c:number):number {return c<=.0031308?c*12.92:1.055*c**(1/2.4)-.055;}
/** Reinhard HDR shoulder, linear-light color grading, deterministic sub-LSB dithering. */
export class NASAStylePhotometricRenderer {
 constructor(readonly profile:PhotometricProfile){}
 map(rgb:readonly number[],dither=0):number[]{
  const exposure=this.profile==='cinematic'?1.45:1;
  const l=rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722;
  return rgb.map(c=>{const graded=this.profile==='cinematic'?Math.max(0,l+(c-l)*1.16):c;const hdr=graded*exposure;return clamp(toDisplay(hdr/(1+hdr))+dither);});
 }
}
