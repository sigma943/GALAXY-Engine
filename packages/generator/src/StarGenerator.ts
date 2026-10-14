import type {Star} from '../../core/src/types';
import {SeededRandom} from './SeededRandom';
export function generateStars(seed: string, density: number, brightness: number): Star[] {
  const r=new SeededRandom(seed+':stars'), stars:Star[]=[], bright:Star[]=[];
  const centers=Array.from({length:4},()=>[r.next(),r.next()]);
  const colors=[0xe3ebff,0xc3dcff,0xfff1d9,0xffffff,0xffdbb2];
  for(let i=0;i<Math.round(7200*density);i++) {
    let x=r.next(),y=r.next();
    if(r.next()<0.2) {const c=r.pick(centers);x=(c[0]!+r.range(-0.14,0.14)+1)%1;y=(c[1]!+r.range(-0.2,0.2)+1)%1;}
    const p=r.next(), size=p<0.955?r.range(0.25,0.8):p<0.993?r.range(0.8,1.4):r.range(1.6,3.1);
    if(size>1.4 && bright.some(s=>Math.hypot(s.x-x,s.y-y)<0.034)) continue;
    const s={x,y,size,brightness:Math.min(1,(0.24+Math.pow(p,7)*0.85)*brightness),color:r.pick(colors),phase:r.range(0,6.28),depth:r.range(0.1,0.8)};
    stars.push(s); if(size>1.4)bright.push(s);
  }
  return stars;
}
