import type {AssetManifest,EngineEvents,EngineOptions,GenerationResult,GeneratorPatch,PerformanceStats,Quality,Rect,SavedUniverse,SceneType,UniverseScene,MeteorIntensity} from './types';
import {UniverseGenerator,DEFAULT_CONFIG,configure,GENERATOR_VERSION} from '../../generator/src/index';
import {DiversityMemory} from '../../composition/src/index';
import type {GalaxyRenderer} from '../../renderer/src/GalaxyRenderer';
type Listener<K extends keyof EngineEvents>=(payload:EngineEvents[K])=>void;
const qualities:Quality[]=['low','medium','high','ultra'];
export class GalaxyEngine {
  private renderer?:GalaxyRenderer;private manifest?:AssetManifest;private generator?:UniverseGenerator;
  private config=structuredClone(DEFAULT_CONFIG);private current?:UniverseScene;private previous?:UniverseScene;
  private listeners=new Map<keyof EngineEvents,Set<(payload:unknown)=>void>>();
  private initialized=false;private initPromise?:Promise<void>;private destroyed=false;
  private running=false;private wantsRunning=false;private appActive=true;private contextAvailable=true;private raf=0;private lastTime=0;private elapsed=0;
  private resizeObserver?:ResizeObserver;private media?:MediaQueryList;private queue:Promise<unknown>=Promise.resolve();
  private memory=new DiversityMemory();private lastResult?:GenerationResult;private generationMs=0;
  private quality:Quality='high';private auto=false;private emaFrame=16.67;private fps=0;private sampleFrames=0;private sampleTime=0;
  private slowSeconds=0;private fastSeconds=0;private lastAdapt=0;private storageKey:string;
  constructor(private readonly options:EngineOptions) {
    this.storageKey=options.storageKey??'galaxy-engine-5.saved';
    this.config=configure(this.config,{...options.generator,sceneType:options.sceneType??options.generator?.sceneType??'random',minScore:options.composition?.minScore??85,candidates:options.composition?.candidates??20,weights:{...DEFAULT_CONFIG.weights,...options.composition?.weights}});
    this.auto=(options.quality??'auto')==='auto';this.quality=this.auto?'high':options.quality as Quality;
  }
  on<K extends keyof EngineEvents>(event:K,listener:Listener<K>):()=>void {
    const fn=listener as (payload:unknown)=>void;let set=this.listeners.get(event);if(!set){set=new Set();this.listeners.set(event,set);}set.add(fn);
    return ()=>set.delete(fn);
  }
  private emit<K extends keyof EngineEvents>(event:K,value:EngineEvents[K]):void {for(const listener of this.listeners.get(event)??[]) {try{listener(value);}catch(error){console.error('Galaxy event listener',error);}}}
  private assertAlive():void {if(this.destroyed)throw new Error('GalaxyEngine is destroyed');}
  initialize():Promise<void> {
    this.assertAlive();if(this.initPromise)return this.initPromise;
    this.initPromise=this.initializeInternal().catch(e=>{this.emit('renderError',e instanceof Error?e:new Error(String(e)));throw e;});return this.initPromise;
  }
  private async initializeInternal():Promise<void> {
    // Import does not touch DOM. GPU and browser access start here only.
    const base=new URL(this.options.assetBaseUrl??'./assets/',document.baseURI);if(!base.pathname.endsWith('/'))base.pathname+='/';
    if(this.options.manifest)this.manifest=this.options.manifest;
    else {const response=await fetch(new URL('manifest.json',base));if(!response.ok)throw new Error('Asset manifest unavailable');this.manifest=await response.json() as AssetManifest;}
    this.assertAlive();if(!this.manifest.assets.length)throw new Error('Empty asset library');
    this.generator=new UniverseGenerator(this.manifest);
    const {GalaxyRenderer}=await import('../../renderer/src/GalaxyRenderer');this.assertAlive();
    this.renderer=new GalaxyRenderer(this.options.container,this.manifest,base.href);
    if(this.auto) {const concurrency=navigator.hardwareConcurrency??4;this.quality=concurrency<=4?'medium':'high';}
    await this.renderer.initialize(this.quality,this.options.forceFallback);
    if(this.destroyed){this.renderer.destroy();throw new Error('Engine destroyed during initialization');}
    this.config.aspect=this.renderer.width/this.renderer.height;
    this.renderer.meteors.enabled=this.options.meteors?.enabled??true;
    this.renderer.meteors.intensity=this.options.meteors?.intensity??'normal';
    this.renderer.meteors.safeZones=this.options.meteors?.safeZones??[];
    this.renderer.parallax=this.options.motion?.parallax??false;
    this.media=window.matchMedia('(prefers-reduced-motion: reduce)');this.applyMotion();this.media.addEventListener('change',this.applyMotion);
    document.addEventListener('visibilitychange',this.visibility);this.renderer.canvas.addEventListener('webglcontextlost',this.contextLost);this.renderer.canvas.addEventListener('webglcontextrestored',this.contextRestored);
    this.renderer.canvas.addEventListener('pointermove',this.pointer);
    this.resizeObserver=new ResizeObserver(entries=>{const box=entries[0]?.contentRect;if(box)this.resize(box.width,box.height);});this.resizeObserver.observe(this.options.container);
    this.initialized=true;this.emit('initialized',this.getPerformanceStats());
    if(this.renderer.fallback)this.emit('performanceWarning','WebGL 2 unavailable: photographic Canvas 2D fallback; reduced animation quality');
    if(this.options.autoGenerate!==false)await this.generateUniverse();
  }
  private applyMotion=():void=>{if(this.renderer)this.renderer.reduced=this.options.motion?.respectReducedMotion!==false&&!!this.media?.matches;};
  private visibility=():void=>{this.updateActivity();};
  private pointer=(e:PointerEvent):void=>{if(!this.renderer)return;this.renderer.setPointer(e.clientX/this.renderer.width-.5,e.clientY/this.renderer.height-.5);};
  private contextLost=(e:Event):void=>{e.preventDefault();this.contextAvailable=false;this.halt();this.emit('contextLost',undefined);};
  private contextRestored=():void=>{this.contextAvailable=true;this.emit('contextRestored',undefined);this.renderer?.render(this.elapsed,0);this.updateActivity();};
  setAppActive(active:boolean):void {this.appActive=active;this.updateActivity();}
  private updateActivity():void {if(this.wantsRunning&&this.appActive&&!document.hidden&&this.contextAvailable)this.begin();else this.halt();}
  start():void {this.assertAlive();if(!this.initialized)throw new Error('Call initialize() before start()');this.wantsRunning=true;this.updateActivity();}
  resume():void {this.start();}
  pause():void {this.wantsRunning=false;this.halt();}
  stop():void {this.pause();this.elapsed=0;if(this.renderer)this.renderer.meteors.meteor=null;this.renderer?.render(0,0);}
  private halt():void {this.running=false;cancelAnimationFrame(this.raf);this.raf=0;this.lastTime=0;this.fps=0;}
  private begin():void {if(this.running||this.destroyed)return;this.running=true;this.lastTime=0;this.raf=requestAnimationFrame(this.tick);}
  private tick=(now:number):void=>{
    if(!this.running||!this.renderer)return;
    const raw=this.lastTime?(now-this.lastTime)/1000:1/60;this.lastTime=now;const dt=Math.min(.1,raw);this.elapsed+=dt;
    this.emaFrame=this.emaFrame*.95+Math.min(1000,raw*1000)*.05;this.sampleFrames++;this.sampleTime+=raw;
    if(this.sampleTime>=.5){this.fps=this.sampleFrames/this.sampleTime;this.sampleFrames=0;this.sampleTime=0;}
    try{this.renderer.render(this.elapsed,dt);}catch(e){this.emit('renderError',e instanceof Error?e:new Error(String(e)));this.pause();return;}
    if(this.auto&&this.elapsed-this.lastAdapt>15) {
      this.slowSeconds=this.emaFrame>24?this.slowSeconds+dt:0;this.fastSeconds=this.emaFrame<17.5&&this.renderer.getStats().cpuSubmitMs!<3?this.fastSeconds+dt:0;
      const idx=qualities.indexOf(this.quality);
      if(this.slowSeconds>4&&idx>0){this.lastAdapt=this.elapsed;this.slowSeconds=0;void this.setQuality(qualities[idx-1]!,true);this.emit('performanceWarning','Observed slow frames: adaptive quality decreased');}
      else if(this.fastSeconds>25&&idx<2){this.lastAdapt=this.elapsed;this.fastSeconds=0;void this.setQuality(qualities[idx+1]!,true);}
    }
    this.raf=requestAnimationFrame(this.tick);
  };
  private enqueue<T>(fn:()=>Promise<T>):Promise<T> {
    const next=this.queue.catch(()=>undefined).then(()=>{this.assertAlive();return fn();});this.queue=next;return next;
  }
  generateUniverse():Promise<UniverseScene> {return this.enqueue(async()=>{
    let best:GenerationResult|undefined,bestNovelty=-Infinity;
    for(let i=0;i<4;i++) {const seed=this.randomSeed();const result=this.makeScene(seed);const novelty=result.scene.score.total-this.memory.similarity(result.scene)*12;if(novelty>bestNovelty){best=result;bestNovelty=novelty;}if(this.memory.similarity(result.scene)<.7)break;}
    return this.commit(best!);
  });}
  generateFromSeed(seed:string|number):Promise<UniverseScene> {return this.enqueue(()=>this.commit(this.makeScene(String(seed))));}
  private randomSeed():string {const bytes=new Uint32Array(2);crypto.getRandomValues(bytes);return `${bytes[0]!.toString(36)}-${bytes[1]!.toString(36)}`;}
  private makeScene(seed:string):GenerationResult {
    if(!this.initialized||!this.generator)throw new Error('Engine is not initialized');
    this.emit('sceneGenerating',{seed});const t=performance.now();
    try{const result=this.generator.generate(seed,this.config);this.generationMs=performance.now()-t;return result;}catch(e){this.emit('renderError',e instanceof Error?e:new Error(String(e)));throw e;}
  }
  private async commit(result:GenerationResult):Promise<UniverseScene> {
    try{await this.renderer!.setScene(result.scene);this.assertAlive();this.previous=this.current;this.current=result.scene;this.lastResult=result;this.memory.remember(result.scene);this.emit('sceneReady',result.scene);this.emit('sceneChanged',result.scene);return result.scene;}
    catch(e){this.emit('renderError',e instanceof Error?e:new Error(String(e)));throw e;}
  }
  restorePrevious():Promise<UniverseScene> {return this.enqueue(async()=>{if(!this.previous)throw new Error('No previous scene');const scene=this.previous;await this.renderer!.setScene(scene);this.previous=this.current;this.current=scene;this.config=structuredClone(scene.config);this.emit('sceneChanged',scene);return scene;});}
  async setQuality(q:Quality|'auto',adaptive=false):Promise<void> {
    return this.enqueue(async()=>{if(!adaptive)this.auto=q==='auto';const target=q==='auto'?'high':q;if(!qualities.includes(target))throw new Error('Unknown quality');if(this.renderer)await this.renderer.setQuality(target);this.quality=target;this.emit('qualityChanged',target);});
  }
  setSceneType(t:SceneType|'random'):void {this.assertAlive();this.config=configure(this.config,{sceneType:t});}
  configure(patch:GeneratorPatch):void {this.assertAlive();this.config=configure(this.config,patch);}
  getConfig():Readonly<ReturnType<typeof configure>> {return structuredClone(this.config);}
  setMeteorIntensity(intensity:MeteorIntensity):void {if(this.renderer){this.renderer.meteors.intensity=intensity;if(this.current)this.renderer.meteors.reset(this.current.seed);}}
  enableMeteors():void {if(this.renderer)this.renderer.meteors.enabled=true;}
  disableMeteors():void {if(this.renderer){this.renderer.meteors.enabled=false;this.renderer.meteors.meteor=null;}}
  setMeteorSafeZones(zones:Rect[]):void {if(this.renderer)this.renderer.meteors.safeZones=structuredClone(zones);}
  triggerMeteor():void {if(this.renderer&&this.current&&!this.renderer.reduced)this.renderer.meteors.trigger(this.current,this.renderer.width,this.renderer.height);}
  resize(width:number,height:number):void {if(!this.destroyed)this.renderer?.resize(width,height);}
  getCurrentSeed():string|null {return this.current?.seed??null;}
  getCurrentScore():number|null {return this.current?.score.total??null;}
  getCurrentScene():UniverseScene|null {return this.current?structuredClone(this.current):null;}
  getLastCandidates():UniverseScene[] {return this.lastResult?.candidates.map(s=>structuredClone(s))??[];}
  showScene(scene:UniverseScene):Promise<UniverseScene> {return this.enqueue(async()=>{if(scene.assetVersion!==this.manifest?.version||scene.generatorVersion!==GENERATOR_VERSION)throw new Error('Incompatible scene');const copy=structuredClone(scene);copy.score=this.generator!.evaluator.evaluate(copy,this.manifest,copy.config,true);if(!copy.score.accepted)throw new Error('Composition rejected');this.config=structuredClone(copy.config);return this.commit({scene:copy,candidates:[copy],improvements:0,rejected:0});});}
  getManifest():AssetManifest|null {return this.manifest?structuredClone(this.manifest):null;}
  getPerformanceStats():PerformanceStats {return {fps:this.fps,frameMs:this.emaFrame,cpuSubmitMs:0,renderWidth:0,renderHeight:0,textures:0,estimatedTextureMB:0,drawCalls:null,quality:this.quality,renderer:'canvas2d',gpu:'not initialized',adaptive:this.auto,generationMs:this.generationMs,...this.renderer?.getStats()};}
  captureThumbnail():string {if(!this.renderer)throw new Error('Not initialized');this.renderer.render(this.elapsed,0);const canvas=document.createElement('canvas'),source=this.renderer.canvas;canvas.width=360;canvas.height=Math.round(360*source.height/source.width);canvas.getContext('2d')!.drawImage(source,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.8);}
  listSavedUniverses():SavedUniverse[] {try{const items:unknown=JSON.parse(localStorage.getItem(this.storageKey)??'[]');return Array.isArray(items)?items.filter((v):v is SavedUniverse=>!!v&&typeof v==='object'&&'scene' in v&&'id' in v):[];}catch{return [];}}
  saveCurrentUniverse():string {if(!this.current)throw new Error('No scene');const list=this.listSavedUniverses(),id=`${this.current.generatorVersion}:${this.current.seed}:${this.current.candidateIndex}`;const existing=list.find(v=>v.id===id);const saved:SavedUniverse={...existing,id,scene:structuredClone(this.current),createdAt:existing?.createdAt??new Date().toISOString(),thumbnail:this.captureThumbnail()};const next=[saved,...list.filter(v=>v.id!==id)].slice(0,30);localStorage.setItem(this.storageKey,JSON.stringify(next));return id;}
  rateSavedUniverse(id:string,rating:number,rejected=false):void {const list=this.listSavedUniverses();const s=list.find(s=>s.id===id);if(!s)throw new Error('Saved scene not found');s.rating=Math.max(1,Math.min(5,Math.round(rating)));s.rejected=rejected;localStorage.setItem(this.storageKey,JSON.stringify(list));}
  deleteSavedUniverse(id:string):void {localStorage.setItem(this.storageKey,JSON.stringify(this.listSavedUniverses().filter(s=>s.id!==id)));}
  loadSavedUniverse(id:string):Promise<UniverseScene> {return this.enqueue(async()=>{const saved=this.listSavedUniverses().find(s=>s.id===id);if(!saved)throw new Error('Saved scene not found');const s=saved.scene;if(s.generatorVersion!==GENERATOR_VERSION||s.assetVersion!==this.manifest?.version)throw new Error('Saved scene version incompatible');const violations=this.generator!.evaluator.validator.validate(s,this.manifest,s.config);if(violations.length)throw new Error('Saved scene rejected: '+violations.join(', '));await this.renderer!.setScene(s);this.previous=this.current;this.current=s;this.config=structuredClone(s.config);this.emit('sceneChanged',s);return s;});}
  exportSavedUniverses():string {return JSON.stringify(this.listSavedUniverses(),null,2);}
  destroy():void {
    if(this.destroyed)return;this.destroyed=true;this.pause();this.resizeObserver?.disconnect();this.media?.removeEventListener('change',this.applyMotion);document.removeEventListener('visibilitychange',this.visibility);
    const canvas=this.renderer?.canvas;canvas?.removeEventListener('webglcontextlost',this.contextLost);canvas?.removeEventListener('webglcontextrestored',this.contextRestored);canvas?.removeEventListener('pointermove',this.pointer);this.renderer?.destroy();this.listeners.clear();this.current=undefined;this.previous=undefined;this.lastResult=undefined;
  }
}
