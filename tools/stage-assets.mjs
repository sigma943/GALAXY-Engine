import {mkdirSync,cpSync,rmSync} from 'node:fs';
rmSync('apps/demo/public',{recursive:true,force:true});mkdirSync('apps/demo/public',{recursive:true});
cpSync('packages/assets/textures','apps/demo/public/textures',{recursive:true});
cpSync('packages/assets/manifest.json','apps/demo/public/manifest.json');
