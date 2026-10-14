import type {MeteorIntensity,Rect,UniverseScene} from '../../core/src/types';
import {SeededRandom} from '../../generator/src/SeededRandom';
export interface Meteor {x:number;y:number;dx:number;dy:number;length:number;duration:number;age:number;speed:number;opacity:number}
export const METEOR_INTERVALS:Record<MeteorIntensity,[number,number]>={low:[20,35],normal:[6,14],high:[3,7],demo:[0.9,1.8]};
export class MeteorEngine {
  enabled=true; intensity:MeteorIntensity='normal'; safeZones:Rect[]=[];
  private rng=new SeededRandom('meteor'); private next=10;
  meteor:Meteor|null=null;
  reset(seed:string):void {this.rng=new SeededRandom(seed+':meteors');this.meteor=null;this.schedule();}
  private schedule():void {const [a,b]=METEOR_INTERVALS[this.intensity];this.next=this.rng.range(a,b);}
  trigger(scene:UniverseScene,w:number,h:number):void {
    for(let i=0;i<24;i++) {
      const x=this.rng.range(.1,.75),y=this.rng.range(.12,.65),angle=this.rng.range(.2,.8)+(this.rng.next()<.25?Math.PI:0);
      const dx=Math.cos(angle),dy=Math.sin(angle),duration=this.rng.range(.4,1.2),speed=this.rng.range(400,800),length=this.rng.range(75,180);
      const forbidden=this.safeZones.some(z=>{
        for(let t=-length;t<speed*duration;t+=20){const px=x+dx*t/w,py=y+dy*t/h;if(px>=z.x&&px<=z.x+z.width&&py>=z.y&&py<=z.y+z.height)return true;}return false;
      });
      const bright=scene.objects.some(o=>o.dominant&&Math.hypot(o.x-x,o.y-y)<o.size*.3);
      if(!forbidden&&!bright){this.meteor={x:x*w,y:y*h,dx,dy,length,duration,age:0,speed,opacity:0};return;}
    }
  }
  update(dt:number,scene:UniverseScene,w:number,h:number,reduced:boolean):Meteor|null {
    if(!this.enabled||reduced){this.meteor=null;return null;}
    if(this.meteor){const m=this.meteor;m.age+=dt;m.x+=m.dx*m.speed*dt;m.y+=m.dy*m.speed*dt;const t=m.age/m.duration;m.opacity=Math.min(1,t*8)*Math.max(0,1-t)**.6;if(t>=1)this.meteor=null;}
    else {this.next-=dt;if(this.next<=0){this.trigger(scene,w,h);this.schedule();}}
    return this.meteor;
  }
}
