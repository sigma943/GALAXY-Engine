import {effectiveAsset} from '../../generator/src/synthesis/ProceduralAstronomicalSynthesisEngine';
import {bakeSynthesisTexture} from './SynthesisTexture';
import {Application,Container,Sprite,Texture,ImageSource,Geometry,Mesh,MeshGeometry,Shader,GlProgram,UniformGroup} from 'pixi.js';
import type {AssetManifest,AstroAsset,PerformanceStats,Quality,SceneObject,UniverseScene} from '../../core/src/types';
import {MeteorEngine} from './MeteorEngine';
import {starVertex,starFragment,meteorVertex,meteorFragment} from './shaders';
export const PROFILES:Record<Quality,{resolution:number;variant:'small'|'medium'|'large';stars:number}>={
  low:{resolution:1,variant:'medium',stars:.5},medium:{resolution:1.5,variant:'medium',stars:.75},high:{resolution:2,variant:'large',stars:1},ultra:{resolution:2.5,variant:'large',stars:1}
};
type Entry={image:HTMLImageElement|HTMLCanvasElement;texture?:Texture;bytes:number};
type Photo={sprite:Sprite;object:SceneObject;asset:AstroAsset};
type Layer={container:Container;photos:Photo[];stars:Mesh<Geometry,Shader>;starUniforms:ReturnType<typeof starUniforms>;paths:string[];scene:UniverseScene};
function starUniforms(){return new UniformGroup({uResolution:{value:new Float32Array([1,1]),type:'vec2<f32>'},uView:{value:new Float32Array([0,0,1,1]),type:'vec4<f32>'},uTime:{value:0,type:'f32'},uGlow:{value:.65,type:'f32'},uTwinkle:{value:1,type:'f32'},uAlpha:{value:1,type:'f32'}});}
export class GalaxyRenderer {
  canvas!:HTMLCanvasElement; app?:Application; fallback?:CanvasRenderingContext2D;
  quality:Quality='high'; width=1;height=1; reduced=false; parallax=false; readonly meteors=new MeteorEngine();
  private cache=new Map<string,Entry>();private layer?:Layer;private oldLayer?:Layer;private fade=1;private current?:UniverseScene;
  private meteorMesh?:Mesh<MeshGeometry,Shader>;private meteorUniforms=new UniformGroup({uResolution:{value:new Float32Array([1,1]),type:'vec2<f32>'},uHead:{value:new Float32Array([0,0]),type:'vec2<f32>'},uDirection:{value:new Float32Array([1,1]),type:'vec2<f32>'},uLength:{value:120,type:'f32'},uOpacity:{value:0,type:'f32'}});
  private disposed=false;private pointer={x:0,y:0};private fallbackBackground?:HTMLCanvasElement;
  private appReady=false;
  private cpuMs=0;private gpu='Canvas 2D fallback';private maxTexture=4096;
  constructor(private container:HTMLElement,readonly manifest:AssetManifest,readonly baseUrl:string){}
  async initialize(quality:Quality,forceFallback=false):Promise<void> {
    this.quality=quality;this.width=Math.max(1,this.container.clientWidth);this.height=Math.max(1,this.container.clientHeight);
    const canvas=document.createElement('canvas');this.canvas=canvas;
    const gl=!forceFallback?canvas.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:true}):null;
    if(gl) {
      this.maxTexture=gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;this.gpu=String(gl.getParameter(gl.RENDERER));
      this.app=new Application();
      await this.app.init({canvas,context:gl,preference:'webgl',preferWebGLVersion:2,width:this.width,height:this.height,resolution:this.resolution(),backgroundColor:0x02040b,autoStart:false,antialias:false,preserveDrawingBuffer:false,manageImports:true});
      this.appReady=true;
      if(this.disposed){this.app.destroy(true,{children:true});throw new Error('Renderer destroyed during initialization');}
      this.app.stop();
      const shader=new Shader({glProgram:new GlProgram({vertex:meteorVertex,fragment:meteorFragment,name:'galaxy-meteor'}),resources:{meteorUniforms:this.meteorUniforms}});
      this.meteorMesh=new Mesh({geometry:new MeshGeometry({positions:new Float32Array([0,0,1,0,1,1,0,1]),uvs:new Float32Array([0,0,1,0,1,1,0,1]),indices:new Uint32Array([0,1,2,0,2,3])}),shader});
      this.meteorMesh.visible=false;this.meteorMesh.blendMode='add';this.app.stage.addChild(this.meteorMesh);
    } else {
      // A canvas which already attempted WebGL cannot be reused as 2D on all browsers.
      this.canvas=document.createElement('canvas');this.fallback=this.canvas.getContext('2d')??undefined;
      if(!this.fallback)throw new Error('Neither WebGL 2 nor Canvas 2D available');
    }
    this.canvas.style.cssText='width:100%;height:100%;display:block;touch-action:pan-y';this.container.append(this.canvas);this.resize(this.width,this.height);
  }
  private resolution():number {return Math.min(window.devicePixelRatio||1,PROFILES[this.quality].resolution);}
  private frame(scene:UniverseScene):{x:number;y:number;w:number;h:number} {
    // Anchors are normalized; portraits and landscapes both fill one global canvas.
    void scene;
    return {x:0,y:0,w:this.width,h:this.height};
  }
  private url(a:AstroAsset,dominant:boolean):string {
    let key=PROFILES[this.quality].variant;
    if(dominant&&this.quality!=='low')key='large';
    if(!dominant)key='medium';
    while(Math.max(a.variants[key].width,a.variants[key].height)>this.maxTexture&&key!=='small')key=key==='large'?'medium':'small';
    return new URL(a.variants[key].path,this.baseUrl).href;
  }
  private async load(url:string):Promise<Entry> {
    const cached=this.cache.get(url);if(cached)return cached;
    const image=new Image();image.src=url;await image.decode();
    if(this.disposed)throw new Error('Renderer destroyed during load');
    const entry:Entry={image,bytes:image.width*image.height*4*1.34};
    if(this.app)entry.texture=new Texture({source:new ImageSource({resource:image,alphaMode:'premultiply-alpha-on-upload',autoGenerateMipmaps:true,scaleMode:'linear'})});
    this.cache.set(url,entry);return entry;
  }
  private objectPath(o:SceneObject,a:AstroAsset):string {
    return o.procedural?'synthesis:'+this.quality+':'+o.assetId+':'+JSON.stringify(o.procedural):this.url(a,o.dominant);
  }
  private async loadObject(o:SceneObject,a:AstroAsset):Promise<Entry>{
    const path=this.objectPath(o,a),cached=this.cache.get(path);if(cached)return cached;
    if(!o.procedural)return this.load(path);
    let source:HTMLImageElement|undefined;
    if(o.procedural.detailMix>0&&o.kind!=='planet'){source=new Image();source.src=new URL(a.variants.small.path,this.baseUrl).href;await source.decode();}
    const limit={low:384,medium:512,high:768,ultra:1024}[this.quality];
    const size=Math.min(this.maxTexture,o.kind==='galaxy'&&!o.dominant?Math.max(128,Math.round(limit*o.size)):o.kind==='nebula'?Math.min(limit,512):limit);
    const image=await bakeSynthesisTexture(o.procedural,size,source,()=>!this.disposed);
    const entry:Entry={image,bytes:size*size*4*1.34};
    if(this.app)entry.texture=new Texture({source:new ImageSource({resource:image,alphaMode:'premultiply-alpha-on-upload',autoGenerateMipmaps:true,scaleMode:'linear'})});
    this.cache.set(path,entry);return entry;
  }
  async setScene(scene:UniverseScene):Promise<void> {
    const assets=scene.objects.map(o=>{const a=this.manifest.assets.find(a=>a.id===o.assetId);if(!a)throw new Error('Missing asset '+o.assetId);return a;});
    const paths=assets.map((a,i)=>this.objectPath(scene.objects[i]!,a));
    let entries:Entry[];
    try {entries=[];for(let i=0;i<assets.length;i++)entries.push(await this.loadObject(scene.objects[i]!,assets[i]!));}
    catch(e){this.prune(new Set([...(this.layer?.paths??[]),...(this.oldLayer?.paths??[])]));throw e;}
    if(this.disposed)return;
    if(this.app) {
      const container=new Container(),photos:Photo[]=[];
      const uniforms=starUniforms(),stars=this.makeStars(scene,uniforms);
      let starsAdded=false;
      scene.objects.forEach((o,i)=>{if(o.kind!=='nebula'&&!starsAdded){container.addChild(stars);starsAdded=true;}const sprite=new Sprite(entries[i]!.texture);sprite.anchor.set(.5);sprite.alpha=Math.min(1,o.brightness);sprite.blendMode=o.blendMode??'normal';photos.push({sprite,object:o,asset:effectiveAsset(o,assets[i]!)});container.addChild(sprite);});
      if(!starsAdded)container.addChild(stars);
      const layer:Layer={container,photos,stars,starUniforms:uniforms,paths,scene};
      if(this.oldLayer)this.disposeLayer(this.oldLayer);
      this.oldLayer=this.layer;this.layer=layer;this.fade=this.oldLayer&&!this.reduced?0:1;
      if(this.fade===1&&this.oldLayer){this.disposeLayer(this.oldLayer);this.oldLayer=undefined;}
      this.app.stage.addChildAt(container,this.app.stage.children.length-1);this.layout(layer);
    }
    this.current=scene;this.meteors.reset(scene.seed);this.buildFallback();
    this.prune(new Set([...paths,...(this.oldLayer?.paths??[])]));this.render(0,0);
  }
  private makeStars(scene:UniverseScene,uniforms:ReturnType<typeof starUniforms>):Mesh<Geometry,Shader> {
    const list=scene.stars.slice(0,Math.round(scene.stars.length*PROFILES[this.quality].stars)),p:number[]=[],uv:number[]=[],d:number[]=[],color:number[]=[],idx:number[]=[];
    list.forEach((s,i)=>{for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]){p.push(s.x,s.y);uv.push(u!,v!);d.push(s.size,s.brightness,s.phase);color.push(((s.color>>16)&255)/255,((s.color>>8)&255)/255,(s.color&255)/255);}const j=i*4;idx.push(j,j+1,j+2,j,j+2,j+3);});
    const geometry=new Geometry({attributes:{aPosition:{buffer:new Float32Array(p),format:'float32x2'},aUV:{buffer:new Float32Array(uv),format:'float32x2'},aData:{buffer:new Float32Array(d),format:'float32x3'},aColor:{buffer:new Float32Array(color),format:'float32x3'}},indexBuffer:new Uint32Array(idx)});
    const shader=new Shader({glProgram:new GlProgram({vertex:starVertex,fragment:starFragment,name:'galaxy-stars'}),resources:{starUniforms:uniforms}});
    const mesh=new Mesh({geometry,shader});mesh.blendMode='add';return mesh;
  }
  private layout(layer:Layer):void {
    const f=this.frame(layer.scene);const u=layer.starUniforms.uniforms;
    u.uResolution.set([this.width,this.height]);u.uView.set([f.x,f.y,f.w,f.h]);u.uGlow=layer.scene.config.stars.glow;u.uTwinkle=!this.reduced&&layer.scene.config.stars.twinkle?1:0;
    for(const {sprite,object:o,asset:a} of layer.photos){sprite.position.set(f.x+o.x*f.w,f.y+o.y*f.h);sprite.rotation=o.rotation;sprite.width=Math.min(f.w,f.h)*o.size;sprite.height=sprite.width*a.variants.large.height/a.variants.large.width;}
  }
  render(time:number,dt:number):void {
    if(!this.current||this.disposed)return;
    const before=performance.now(),m=this.meteors.update(dt,this.current,this.width,this.height,this.reduced);
    if(this.app&&this.layer) {
      if(this.fade<1){this.fade=Math.min(1,this.fade+dt/0.4);this.layer.container.alpha=this.fade;if(this.oldLayer)this.oldLayer.container.alpha=1-this.fade;if(this.fade===1&&this.oldLayer){this.disposeLayer(this.oldLayer);this.oldLayer=undefined;this.prune(new Set(this.layer.paths));}}
      this.layer.starUniforms.uniforms.uTime=time;
      this.layer.starUniforms.uniforms.uAlpha=this.fade;
      if(this.oldLayer)this.oldLayer.starUniforms.uniforms.uAlpha=1-this.fade;
      if(this.parallax&&!this.reduced){const targetX=this.pointer.x*3,targetY=this.pointer.y*3;this.layer.container.x+=(targetX-this.layer.container.x)*.05;this.layer.container.y+=(targetY-this.layer.container.y)*.05;}
      if(this.meteorMesh){this.meteorMesh.visible=!!m;if(m){const u=this.meteorUniforms.uniforms;u.uResolution.set([this.width,this.height]);u.uHead.set([m.x,m.y]);u.uDirection.set([m.dx,m.dy]);u.uLength=m.length;u.uOpacity=m.opacity;}}
      this.app.renderer.render(this.app.stage);
    } else if(this.fallback&&this.fallbackBackground) {
      const ctx=this.fallback;ctx.drawImage(this.fallbackBackground,0,0);
      if(m){const scale=this.canvas.width/this.width;ctx.save();ctx.scale(scale,scale);const tx=m.x-m.dx*m.length,ty=m.y-m.dy*m.length;const g=ctx.createLinearGradient(tx,ty,m.x,m.y);g.addColorStop(0,'transparent');g.addColorStop(1,`rgba(210,235,255,${m.opacity})`);ctx.strokeStyle=g;ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(m.x,m.y);ctx.stroke();ctx.restore();}
    }
    this.cpuMs=performance.now()-before;
  }
  private buildFallback():void {
    if(!this.fallback||!this.current)return;
    const canvas=document.createElement('canvas');canvas.width=this.canvas.width;canvas.height=this.canvas.height;const ctx=canvas.getContext('2d')!;const scale=canvas.width/this.width;ctx.scale(scale,scale);ctx.fillStyle='#02040b';ctx.fillRect(0,0,this.width,this.height);
    const f=this.frame(this.current);
    for(const s of this.current.stars){ctx.fillStyle='#'+s.color.toString(16).padStart(6,'0');ctx.globalAlpha=s.brightness;ctx.fillRect(f.x+s.x*f.w,f.y+s.y*f.h,Math.max(.5,s.size),Math.max(.5,s.size));}
    ctx.globalAlpha=1;
    for(const o of this.current.objects){const a=this.manifest.assets.find(a=>a.id===o.assetId)!;const image=this.cache.get(this.objectPath(o,a))?.image;if(!image)continue;const w=o.size*Math.min(f.w,f.h),h=w*image.height/image.width;ctx.save();ctx.translate(f.x+o.x*f.w,f.y+o.y*f.h);ctx.rotate(o.rotation);ctx.globalCompositeOperation=o.blendMode==='screen'?'screen':'source-over';ctx.globalAlpha=Math.min(1,o.brightness);ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();}
    this.fallbackBackground=canvas;
  }
  resize(w:number,h:number):void {
    this.width=Math.max(1,w);this.height=Math.max(1,h);
    if(this.app)this.app.renderer.resize(this.width,this.height,this.resolution());
    else {this.canvas.width=Math.round(this.width*this.resolution());this.canvas.height=Math.round(this.height*this.resolution());}
    if(this.layer)this.layout(this.layer);if(this.oldLayer)this.layout(this.oldLayer);this.buildFallback();this.render(0,0);
  }
  async setQuality(q:Quality):Promise<void> {this.quality=q;this.resize(this.width,this.height);if(this.current)await this.setScene(this.current);}
  setPointer(x:number,y:number):void {this.pointer.x=x;this.pointer.y=y;}
  screenshot():string {return this.canvas.toDataURL('image/webp',.85);}
  getStats():Partial<PerformanceStats> {return {renderer:this.app?'webgl2':'canvas2d',gpu:this.gpu,renderWidth:this.canvas.width,renderHeight:this.canvas.height,textures:this.cache.size,estimatedTextureMB:[...this.cache.values()].reduce((n,e)=>n+e.bytes,0)/1048576,drawCalls:null,cpuSubmitMs:this.cpuMs,quality:this.quality};}
  private prune(keep:Set<string>):void {for(const [url,e] of this.cache)if(!keep.has(url)){e.texture?.destroy(true);if(e.image instanceof HTMLImageElement)e.image.src='';else {e.image.width=0;e.image.height=0;}this.cache.delete(url);}}
  private disposeLayer(l:Layer):void {l.stars.geometry.destroy();l.stars.shader?.destroy(true);l.container.destroy({children:true});}
  destroy():void {if(this.disposed)return;this.disposed=true;if(this.layer)this.disposeLayer(this.layer);if(this.oldLayer)this.disposeLayer(this.oldLayer);this.meteorMesh?.geometry.destroy();this.meteorMesh?.shader?.destroy(true);if(this.appReady)this.app?.destroy(true,{children:true});this.prune(new Set());this.canvas?.remove();this.current=undefined;this.fallbackBackground=undefined;}
}
