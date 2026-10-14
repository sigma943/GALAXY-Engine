import {writeFileSync} from 'node:fs';
import json from '../../packages/assets/manifest.json';
import {UniverseGenerator,DEFAULT_CONFIG} from '../../packages/generator/src/index';
import type {AssetManifest} from '../../packages/core/src/types';
const g=new UniverseGenerator(json as AssetManifest),rows=[];
let rejected=0,improvements=0;
for(let i=0;i<100;i++){const start=performance.now();try{const r=g.generate(i,DEFAULT_CONFIG);rejected+=r.rejected;improvements+=r.improvements;rows.push({seed:i,type:r.scene.type,main:r.scene.objects.find(o=>o.dominant)!.assetId,score:r.scene.score.total,candidate:r.scene.candidateIndex,ms:performance.now()-start,accepted:true});}catch(e){rows.push({seed:i,accepted:false,error:String(e),ms:performance.now()-start});}}
const times=rows.map(r=>r.ms).sort((a,b)=>a-b);
const report={generatedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,androidDevice:false},seeds:100,accepted:rows.filter(r=>r.accepted).length,rejected:rows.filter(r=>!r.accepted).length,candidateRejections:rejected,localImprovements:improvements,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:times[94],sceneTypes:[...new Set(rows.filter(r=>r.accepted).map(r=>'type'in r?r.type:''))],rows};
writeFileSync('reports/100-seeds.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:undefined},null,2));
