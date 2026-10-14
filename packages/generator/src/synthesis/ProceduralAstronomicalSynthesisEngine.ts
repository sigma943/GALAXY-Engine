import type {AstroAsset,ImageMetrics,ObjectKind,ProceduralRecipe,SceneObject,SynthesisConfig} from '../../../core/src/types';
import {SeededRandom} from '../SeededRandom';
import {clamp,fbm,noise,warped,hash} from './fields';
import {NASAStylePhotometricRenderer} from './PhotometricRenderer';
export type FieldSample={rgb:[number,number,number];alpha:number};
export function validRecipe(p:ProceduralRecipe,kind:ObjectKind):boolean {
 return p.version===1&&p.kind===kind&&Number.isInteger(p.seed)&&p.seed>=0&&p.seed<=2147483647&&
 ['spiral','barred','elliptical','lenticular','irregular','edge-on','interacting'].includes(p.morphology)&&
 ['rock','gas','ice','ocean'].includes(p.surface)&&['scientific','cinematic'].includes(p.profile)&&typeof p.rings==='boolean'&&
 [p.inclination,p.arms,p.twist,p.phase,p.hue,p.detailMix].every(Number.isFinite)&&p.inclination>=.1&&p.inclination<=1&&
 p.arms>=1&&p.arms<=6&&p.twist>=.1&&p.twist<=6&&p.hue>=0&&p.hue<=1&&p.detailMix>=0&&p.detailMix<=.35&&
 Array.isArray(p.light)&&p.light.length===3&&p.light.every(Number.isFinite)&&Math.abs(Math.hypot(...p.light)-1)<.01;
}
const transparent=():FieldSample=>({rgb:[0,0,0],alpha:0});
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export class ProceduralGalaxyGenerator {
 static sample(p:ProceduralRecipe,u:number,v:number):FieldSample {
  const x=(u-.5)*2,y=(v-.5)*2/(p.morphology==='edge-on'?.14:p.inclination),r=Math.hypot(x,y);
  if(r>=1)return transparent();
  const theta=Math.atan2(y,x),n=fbm(x*18,y*18,p.seed),fine=noise(x*100,y*100,p.seed+9);
  const phase=p.arms*(theta-p.twist*Math.log(r+.055))+p.phase+(n-.5)*1.5;
  const arm=Math.exp(-((Math.sin(phase)*2.2)**2));
  const disc=Math.exp(-r*4.3),core=Math.exp(-r*r/0.012)*2.8;
  const edge=clamp((1-r)/.16)**2;
  let density=disc*(.2+arm*1.8)*(0.5+n);
  if(p.morphology==='elliptical'||p.morphology==='lenticular')density=disc*(1.4+(p.morphology==='lenticular'?arm*.25:0));
  if(p.morphology==='irregular')density=Math.exp(-r*r*3.5)*Math.max(0,warped(x*7,y*7,p.seed)-.3)*4;
  if(p.morphology==='barred')density+=Math.exp(-x*x*13-y*y*240)*.9;
  if(p.morphology==='interacting')density+=Math.exp(-((x-.38)**2+(y+.28)**2)*42)*.8;
  const dust=clamp((warped(x*24,y*24,p.seed+67)-.44)*3)*arm*r*1.8;
  const emission=density*Math.exp(-dust*3.8)*edge;
  const knots=arm*Math.max(0,fine-.72)*n*disc*1.5;
  const stars=Math.max(0,hash(Math.floor(u*1100),Math.floor(v*1100),p.seed)-.992)*90*arm*disc;
  return {rgb:[(emission*.7+core*1.12+knots*1.6+stars)*edge,(emission*.85+core*.82+stars)*edge,(emission*1.28+core*.48+knots*.55+stars)*edge],alpha:1};
 }
}
export class VolumetricNebulaGenerator {
 static sample(p:ProceduralRecipe,u:number,v:number):FieldSample {
  const x=u*6,y=v*6,large=warped(x,y,p.seed),small=fbm(x*9,y*9,p.seed+45,3);
  const filament=Math.exp(-Math.abs(warped(x*2.4,y*2.4,p.seed+13)-.48)*18);
  const gas=Math.max(0,large-.28)*(0.28+filament*1.5)*(0.6+small);
  const dust=Math.max(0,warped(x*4,y*4,p.seed+31)-.49)*7;
  const edge=clamp(Math.min(u,v,1-u,1-v)*8)**2;
  const e=gas*Math.exp(-dust*2.8)*edge*.5,hot=filament*gas*.12*edge;
  const palette=p.hue<1/3?[.3,.85,1.3]:p.hue<2/3?[1.6,.68,.15]:[1.35,.3,.78];
  return {rgb:[e*palette[0]!+hot,e*palette[1]!+hot*.7,e*palette[2]!+hot],alpha:1};
 }
}
export class ProceduralPlanetGenerator {
 static sample(p:ProceduralRecipe,u:number,v:number):FieldSample {
  const x=(u-.5)*2,y=(v-.5)*2,r2=x*x+y*y,R=p.rings?.55:.86;
  // A tilted ring plane. Front and rear halves use ray/sphere occlusion.
  const ringR=Math.hypot(x,y/.3),ring=!!p.rings&&ringR>.67&&ringR<.97;
  const sphere=r2<R*R,z=sphere?Math.sqrt(R*R-r2):0;
  const ringFront=y>0;
  if(ring&&(!sphere||ringFront)){
   const band=.3+.7*noise(ringR*180,0,p.seed),gap=Math.abs(ringR-.82)<.009?.12:1;
   // Ring shadow behind the planet, projected along the shared light direction.
   const shadow=x*p.light[0]+y*p.light[1]<0&&Math.abs(x)<R*.9?.32:1;
   return {rgb:[band*.7*shadow,band*.6*shadow,band*.43*shadow],alpha:band*.7*gap};
  }
  if(!sphere){
   if(p.rings)return transparent();
   const halo=Math.exp(-Math.max(0,Math.sqrt(r2)-R)*85)*.07;
   return {rgb:[halo*.2,halo*.5,halo],alpha:halo};
  }
  const nx=x/R,ny=y/R,nz=z/R,lon=Math.atan2(nx,nz)+p.phase,lat=Math.asin(ny);
  const n=warped(lon*3,lat*5,p.seed),detail=fbm(lon*25,lat*25,p.seed+8,3);
  let rgb:[number,number,number];
  if(p.surface==='gas'){
   const band=.5+.5*Math.sin(lat*45+warped(lon*4,lat*9,p.seed)*4);
   const storm=Math.exp(-((lon-.2)**2*16+(lat-.16)**2*90));
   rgb=[.35+band*.48+storm*.25,.25+band*.35,.17+band*.27];
  }else if(p.surface==='ocean')rgb=n>.52?[.12+n*.17,.2+n*.22,.08+n*.07]:[.025,.12,.38+detail*.1];
  else if(p.surface==='ice')rgb=[.3+n*.45,.44+n*.4,.55+n*.38];
  else {let crater=1;const gx=lon*8,gy=lat*8,ix=Math.floor(gx),iy=Math.floor(gy);
   for(let cy=iy-1;cy<=iy+1;cy++)for(let cx=ix-1;cx<=ix+1;cx++){
    const dx=gx-cx-hash(cx,cy,p.seed),dy=gy-cy-hash(cx,cy,p.seed+1),radius=.1+hash(cx,cy,p.seed+2)*.23,d=Math.hypot(dx,dy)/radius;
    crater-=Math.exp(-d*d*3)*.26;crater+=Math.exp(-(((d-1)*8)**2))*.15;
   }
   rgb=[(.3+n*.4)*crater,(.18+n*.28)*crater,(.1+n*.19)*crater];}
  const cloud=p.surface==='ocean'?clamp((fbm(lon*8+4,lat*12,p.seed+51)-.59)*5):0;
  const diffuse=Math.max(0,nx*p.light[0]+ny*p.light[1]+nz*p.light[2]);
  const ringShadow=p.rings&&Math.abs(ny+.13*nx)<.05&&diffuse>0?.48:1;
  const light=.012+diffuse*.98*ringShadow,rim=(1-nz)**3*diffuse*.16;
  rgb=rgb.map((c,i)=>(mix(c,.8,cloud)*light+rim*[.25,.5,1][i]!) ) as [number,number,number];
  return {rgb,alpha:clamp((R-Math.sqrt(r2))*500)};
 }
}
export function sampleStructure(p:ProceduralRecipe,u:number,v:number):FieldSample {
 return p.kind==='galaxy'?ProceduralGalaxyGenerator.sample(p,u,v):p.kind==='nebula'?VolumetricNebulaGenerator.sample(p,u,v):ProceduralPlanetGenerator.sample(p,u,v);
}
export class ProceduralAstronomicalSynthesisEngine {
 recipe(kind:ObjectKind,seed:string,settings:SynthesisConfig,light:[number,number,number],preferred?:string):ProceduralRecipe {
  const r=new SeededRandom(seed),morphologies=['spiral','barred','elliptical','lenticular','irregular','edge-on','interacting'] as const;
  const morphology=morphologies.includes(preferred as typeof morphologies[number])?preferred as typeof morphologies[number]:r.pick(morphologies);
  return {version:1,kind,seed:Math.floor(r.next()*2147483647),morphology,inclination:morphology==='edge-on'?.14:r.range(.4,1),arms:r.pick([2,3,4]),twist:r.range(1.5,3.2),phase:r.range(0,Math.PI*2),hue:r.next(),surface:r.pick(['rock','gas','ice','ocean']),rings:kind==='planet'&&r.next()<.28,light,profile:settings.profile,detailMix:settings.mode==='hybrid'?settings.detailMix:0};
 }
}
/** Matches actual procedural structure, rather than measuring the source photograph. */
export function proceduralMetrics(p:ProceduralRecipe):ImageMetrics {
 const mapper=new NASAStylePhotometricRenderer(p.profile),luminance:number[]=[],histogram=Array<number>(16).fill(0);let mean=0,detail=0;
 for(let y=0;y<16;y++)for(let x=0;x<16;x++){
  const s=sampleStructure(p,(x+.5)/16,(y+.5)/16),rgb=mapper.map(s.rgb);
  const l=(rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722)*s.alpha;luminance.push(l);mean+=l/256;histogram[Math.min(15,Math.floor(l*16))]!+=1/256;
  if(x>0)detail+=Math.abs(l-luminance[luminance.length-2]!)/256;
 }
 return {mean,contrast:Math.sqrt(luminance.reduce((sum,l)=>sum+(l-mean)**2,0)/256),detail,darkFraction:luminance.filter(l=>l<.055).length/256,color:[.5,.4,.6],luminance,histogram};
}
const metadataCache=new WeakMap<SceneObject,AstroAsset>();
export function effectiveAsset(o:SceneObject,a:AstroAsset):AstroAsset {
 if(!o.procedural)return a;
 const cached=metadataCache.get(o);if(cached)return {...cached,mask:a.mask};
 const dimensions={path:'',width:1024,height:1024,bytes:0};
 const result={...a,variants:{small:{...dimensions,width:384,height:384},medium:{...dimensions,width:640,height:640},large:dimensions},metrics:proceduralMetrics(o.procedural)};
 metadataCache.set(o,result);return result;
}
