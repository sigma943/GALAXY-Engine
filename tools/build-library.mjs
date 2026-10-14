import {build} from 'vite';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,cpSync,rmSync,readFileSync} from 'node:fs';
for(const name of ['core','generator','composition','renderer','react']){
 await build({configFile:false,build:{outDir:`packages/${name}/dist`,emptyOutDir:true,lib:{entry:`packages/${name}/src/index.${name==='react'?'tsx':'ts'}`,formats:['es'],fileName:()=>`index.js`},rolldownOptions:{external:['pixi.js','react','react/jsx-runtime','@galaxy-engine/core']}}});
}
const config={extends:'./tsconfig.json',compilerOptions:{noEmit:false,declaration:true,emitDeclarationOnly:true,outDir:'dist/types',rootDir:'packages'},include:['packages/**/*.ts','packages/**/*.tsx']};
writeFileSync('tsconfig.library.json',JSON.stringify(config,null,2));execFileSync('node',['node_modules/typescript/bin/tsc','-p','tsconfig.library.json'],{stdio:'inherit'});
for(const name of ['core','generator','composition','renderer','react']){
 const dest=`packages/${name}/dist/types`;mkdirSync(dest,{recursive:true});cpSync('dist/types',dest,{recursive:true});
 const index=`${name}/src/index`;
 writeFileSync(`packages/${name}/dist/index.d.ts`,`export * from './types/${index}';\n`);
}
writeFileSync('packages/react/dist/index.js',"'use client';\n"+readFileSync('packages/react/dist/index.js','utf8'));
writeFileSync('packages/react/dist/index.d.ts',readFileSync('dist/types/react/src/index.d.ts','utf8').replace('../../core/src/index','@galaxy-engine/core'));
rmSync('packages/core/assets',{force:true,recursive:true});mkdirSync('packages/core/assets',{recursive:true});
cpSync('packages/assets/textures','packages/core/assets/textures',{recursive:true});cpSync('packages/assets/manifest.json','packages/core/assets/manifest.json');cpSync('ASSET-CREDITS.md','packages/core/ASSET-CREDITS.md');
