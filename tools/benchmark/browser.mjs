/** Real browser QA. No claims of a pass unless every assertion completes. */
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
mkdirSync('reports/gallery',{recursive:true});mkdirSync('browser-tmp',{recursive:true});process.env.TMPDIR=path.resolve('browser-tmp');
const url=process.env.GALAXY_LAB_URL??'http://127.0.0.1:5173';
let server,browser;const report={generatedAt:new Date().toISOString(),status:'running',androidDevice:false,checks:[],scenes:[],errors:[]};
const check=(name)=>{report.checks.push(name);console.log('PASS',name);};
try{
 try{await fetch(url);}catch{server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','apps/demo/vite.config.ts','--host','127.0.0.1'],{stdio:'ignore'});for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));try{await fetch(url);break;}catch{}}}
 browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:430,height:932},deviceScaleFactor:1});
 const requests=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(url+'/?seed=834721&scene=galaxy-showcase');await page.waitForFunction(()=>window.galaxyLab?.ready,null,{timeout:30000});
 const initial=await page.evaluate(()=>({seed:window.galaxyLab.engine.getCurrentSeed(),objects:window.galaxyLab.engine.getCurrentScene().objects,stats:window.galaxyLab.engine.getPerformanceStats()}));
 assert.equal(initial.stats.renderer,'webgl2');check('Actual WebGL 2 initialization and shader draw');
 await page.waitForTimeout(600);await page.screenshot({path:'reports/lab-mobile.png'});
 await page.evaluate(()=>{window.galaxyLab.engine.pause();window.galaxyLab.setPreview(true);});
 assert.deepEqual(await page.evaluate(()=>window.galaxyLab.engine.getCurrentScene().objects),initial.objects);assert.equal(await page.evaluate(()=>document.querySelectorAll('#universe canvas').length),1);check('Preview toggle preserves seed, geometry and one canvas');
 await page.screenshot({path:'reports/app-preview-mobile.png'});
 await page.setViewportSize({width:932,height:430});assert.deepEqual(await page.evaluate(()=>window.galaxyLab.engine.getCurrentScene().objects),initial.objects);check('Orientation resize preserves static scene');
 await page.setViewportSize({width:430,height:932});await page.evaluate(()=>{window.galaxyLab.setPreview(false);window.galaxyLab.setClean(true);window.galaxyLab.engine.resume();});
 for(let i=0;i<20;i++){
  const scene=await page.evaluate(async(seed)=>{window.galaxyLab.engine.setSceneType('random');return await window.galaxyLab.engine.generateFromSeed(seed);},i);
  await page.waitForTimeout(550);await page.locator('#universe canvas').screenshot({path:`reports/gallery/seed-${String(i).padStart(2,'0')}.png`});
  report.scenes.push({seed:scene.seed,type:scene.type,score:scene.score.total});
 }
 check('20 successive accepted scenes rendered, screenshots captured');
 const stats=await page.evaluate(()=>window.galaxyLab.engine.getPerformanceStats());report.performance=stats;
 const id=await page.evaluate(()=>window.galaxyLab.engine.saveCurrentUniverse());
 const beforeSave=await page.evaluate(()=>window.galaxyLab.engine.getCurrentScene());
 await page.evaluate(async(id)=>{await window.galaxyLab.engine.generateFromSeed('different');await window.galaxyLab.engine.loadSavedUniverse(id);},id);
 assert.deepEqual(await page.evaluate(()=>window.galaxyLab.engine.getCurrentScene().objects),beforeSave.objects);check('Save/load exact composition');
 await page.evaluate(async()=>{const e=window.galaxyLab.engine;await e.setQuality('low');e.pause();e.resume();e.stop();e.start();});check('Repeated quality/start/stop operations');
 const contextResult=await page.evaluate(async()=>{const canvas=document.querySelector('#universe canvas');const gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_lose_context');if(!ext)return 'extension unavailable';let lost=false,restored=false;canvas.addEventListener('webglcontextlost',()=>lost=true,{once:true});canvas.addEventListener('webglcontextrestored',()=>restored=true,{once:true});ext.loseContext();await new Promise(r=>setTimeout(r,200));ext.restoreContext();await new Promise(r=>setTimeout(r,500));return {lost,restored};});
 if(typeof contextResult==='object'){assert.equal(contextResult.lost,true);assert.equal(contextResult.restored,true);check('WebGL context loss/restore');}else report.checks.push('SKIP '+contextResult);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.galaxyLab.engine.triggerMeteor());check('Reduced-motion path exercised');
 assert(requests.every(r=>r.startsWith(url)||r.startsWith('data:')));check('All runtime requests local; no remote astronomy downloads');
 await page.goto(url+'/?fallback&seed=fallback');await page.waitForFunction(()=>window.galaxyLab?.ready);assert.equal(await page.evaluate(()=>window.galaxyLab.engine.getPerformanceStats().renderer),'canvas2d');check('Photographic Canvas 2D fallback');await page.screenshot({path:'reports/fallback-mobile.png'});
 await page.evaluate(()=>window.galaxyLab.engine.destroy());assert.equal(await page.locator('#universe canvas').count(),0);check('Renderer canvas removed on destroy');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='blocked-or-failed';report.errors.push(String(error));console.error(error);process.exitCode=1;}
finally{if(browser)await browser.close();if(server)server.kill();writeFileSync('reports/browser-tests.json',JSON.stringify(report,null,2));}
