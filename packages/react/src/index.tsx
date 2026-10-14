'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {GalaxyEngine,type EngineOptions,type Quality,type SceneType,type UniverseScene} from '@galaxy-engine/core';
export function useGalaxyEngine(options:Omit<EngineOptions,'container'>,onError?:(error:Error)=>void) {
  const errorHandler=useRef(onError);errorHandler.current=onError;
  const container=useRef<HTMLDivElement>(null),initial=useRef(options),[engine,setEngine]=useState<GalaxyEngine|null>(null);
  useEffect(()=>{if(!container.current)return;let disposed=false;const instance=new GalaxyEngine({container:container.current,...initial.current});
    void instance.initialize().then(()=>{if(!disposed){instance.start();setEngine(instance);}}).catch(error=>{if(!disposed){errorHandler.current?.(error instanceof Error?error:new Error(String(error)));console.error(error);}});
    return ()=>{disposed=true;instance.destroy();};
  },[]);
  return {container,engine};
}
export interface GalaxyBackgroundProps {quality?:Quality|'auto';sceneType?:SceneType|'random';meteors?:boolean;assetBaseUrl?:string;className?:string;style?:CSSProperties;onSceneReady?:(scene:UniverseScene)=>void;onError?:(error:Error)=>void;}
export function GalaxyBackground({quality='auto',sceneType='random',meteors=true,assetBaseUrl='/galaxy-assets/',className,style,onSceneReady,onError}:GalaxyBackgroundProps) {
  const {container,engine}=useGalaxyEngine({quality,sceneType,assetBaseUrl,meteors:{enabled:meteors},motion:{respectReducedMotion:true}},onError);
  const ready=useRef(onSceneReady),error=useRef(onError);ready.current=onSceneReady;error.current=onError;
  useEffect(()=>{if(!engine)return;void engine.setQuality(quality).catch(e=>error.current?.(e as Error));},[engine,quality]);
  useEffect(()=>engine?.setSceneType(sceneType),[engine,sceneType]);
  useEffect(()=>{if(engine){if(meteors)engine.enableMeteors();else engine.disableMeteors();}},[engine,meteors]);
  useEffect(()=>{if(!engine)return;const current=engine.getCurrentScene();if(current)ready.current?.(current);const a=engine.on('sceneReady',s=>ready.current?.(s));const b=engine.on('renderError',e=>error.current?.(e));return ()=>{a();b();};},[engine]);
  return <div ref={container} className={className} style={{position:'fixed',inset:0,pointerEvents:'none',...style}} aria-hidden="true"/>;
}
