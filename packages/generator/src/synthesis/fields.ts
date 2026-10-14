/** Seeded, continuous value noise and domain-warped fBm. No browser dependencies. */
export const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function hash(x:number,y:number,seed:number):number {
 let h=Math.imul(x,374761393)^Math.imul(y,668265263)^seed;
 h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
}
export function noise(x:number,y:number,seed:number):number {
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
 const a=hash(ix,iy,seed),b=hash(ix+1,iy,seed),c=hash(ix,iy+1,seed),d=hash(ix+1,iy+1,seed);
 return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
export function fbm(x:number,y:number,seed:number,octaves=4):number {
 let sum=0,weight=.5,total=0;
 for(let i=0;i<octaves;i++){sum+=noise(x,y,seed+i*7919)*weight;total+=weight;x=x*2.03+17.7;y=y*2.03-9.2;weight*=.5;}
 return sum/total;
}
export function warped(x:number,y:number,seed:number):number {
 const qx=fbm(x*.7+8,y*.7,seed,3),qy=fbm(x*.7,y*.7+5,seed+97,3);
 return fbm(x+qx*2.8,y+qy*2.8,seed+193);
}
