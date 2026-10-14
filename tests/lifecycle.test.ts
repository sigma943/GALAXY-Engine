// @vitest-environment happy-dom
import {it,expect,vi,afterEach} from 'vitest';
import type {AssetManifest,UniverseScene} from '../packages/core/src/types';
import json from '../packages/assets/manifest.json';
import {GalaxyEngine} from '../packages/core/src/GalaxyEngine';
const mock=vi.hoisted(()=>({setScene:vi.fn(async(_s:unknown)=>{}),destroy:vi.fn(),render:vi.fn()}));
vi.mock('../packages/renderer/src/GalaxyRenderer',()=>({GalaxyRenderer:class {
 canvas=document.createElement('canvas');width=430;height=932;quality='high';reduced=false;parallax=false;
 meteors={enabled:true,intensity:'normal',safeZones:[],meteor:null,reset:vi.fn(),trigger:vi.fn()};
 constructor(private container:HTMLElement){}
 async initialize(){this.container.append(this.canvas);}
 setScene=mock.setScene;render=mock.render;setPointer=vi.fn();resize=vi.fn();async setQuality(q:string){this.quality=q;}
 getStats(){return {renderer:'webgl2',quality:this.quality,textures:2,estimatedTextureMB:30,cpuSubmitMs:1};}
 destroy(){this.canvas.remove();mock.destroy();}
}}));
const live:GalaxyEngine[]=[];
function create(){const c=document.createElement('div');document.body.append(c);const e=new GalaxyEngine({container:c,manifest:json as AssetManifest,autoGenerate:false,quality:'high'});live.push(e);return {e,c};}
afterEach(()=>{live.forEach(e=>e.destroy());live.length=0;document.body.innerHTML='';localStorage.clear();vi.clearAllMocks();});
it('initialization is idempotent and repeated start/stop leaves one canvas',async()=>{
 const {e,c}=create();const p=e.initialize();expect(e.initialize()).toBe(p);await p;await e.generateFromSeed(10);
 for(let i=0;i<10;i++){e.start();e.start();e.pause();e.resume();e.stop();}
 expect(c.querySelectorAll('canvas')).toHaveLength(1);e.destroy();e.destroy();expect(c.querySelectorAll('canvas')).toHaveLength(0);expect(mock.destroy).toHaveBeenCalledTimes(1);
});
it('serializes asynchronous scene commits and preserves the last scene on load failure',async()=>{
 const {e}=create();await e.initialize();const changed:string[]=[];e.on('sceneChanged',s=>changed.push(s.seed));
 await Promise.all([e.generateFromSeed('one'),e.generateFromSeed('two')]);expect(changed).toEqual(['one','two']);
 const before=e.getCurrentScene();mock.setScene.mockRejectedValueOnce(new Error('asset unavailable'));await expect(e.generateFromSeed('three')).rejects.toThrow('asset unavailable');expect(e.getCurrentScene()).toEqual(before);
});
it('quality and meteor settings preserve current static geometry',async()=>{
 const {e}=create();await e.initialize();await e.generateFromSeed(21);const before=e.getCurrentScene();await e.setQuality('low');e.disableMeteors();e.setMeteorIntensity('demo');e.enableMeteors();e.resize(932,430);expect(e.getCurrentScene()).toEqual(before);
});
it('does not commit queued work after destroy',async()=>{
 const {e}=create();await e.initialize();const task=e.generateFromSeed('queued');e.destroy();await expect(task).rejects.toThrow('destroyed');expect(mock.setScene).not.toHaveBeenCalled();
});
it('restores previous geometry without invoking the generator',async()=>{
 const {e}=create();await e.initialize();const a:UniverseScene=await e.generateFromSeed('previous');await e.generateFromSeed('new');await e.restorePrevious();expect(e.getCurrentScene()).toEqual(a);
});
