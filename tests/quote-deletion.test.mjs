import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const service=fs.readFileSync(new URL('../src/lib/airtable/quotes.ts',import.meta.url),'utf8');
const route=fs.readFileSync(new URL('../src/app/api/quotes/[id]/route.ts',import.meta.url),'utf8');
function runTs(source,globals){const code=stripTypeScriptTypes(source.replace(/^import .*;$/gm,'').replace(/^export /gm,''));const context=vm.createContext(globals);vm.runInContext(code,context);return context;}
test('soft delete updates only four deletion fields and supports restore',async()=>{
 const calls=[];const c=runTs(service,{process:{env:{AIRTABLE_TOKEN:'mock',AIRTABLE_BASE_ID:'appMock'}},Date,Error,fetch:async(url,options)=>{calls.push({url,...options});return {ok:true};}});
 await c.setQuoteDeleted('rec12345678901234',true,'duplicate','tester');
 assert.equal(calls[0].method,'PATCH');let fields=JSON.parse(calls[0].body).fields;
 assert.deepEqual(Object.keys(fields).sort(),['fldUDwBfzwcnftVsa','fldea1Ig4sqNSdtw1','fldHrVPSYs8vWlCpV','fldDzdTDIuDO4h9y3'].sort());
 assert.equal(fields.fldUDwBfzwcnftVsa,true);
 await c.setQuoteDeleted('rec12345678901234',false,'','tester');fields=JSON.parse(calls[1].body).fields;
 assert.equal(fields.fldUDwBfzwcnftVsa,false);assert.equal(fields.fldDzdTDIuDO4h9y3,null);
});
test('route rejects unsigned, cross-origin, malformed and empty requests without writes',async()=>{
 let member=null,writes=0;
 const c=runTs(route,{auth:async()=>({user:{member}}),setQuoteDeleted:async()=>{writes++;},Response,URL,Error});
 const context={params:Promise.resolve({id:'rec12345678901234'})};
 const request=(body,origin='https://app.open-garden.co.kr')=>new Request('https://app.open-garden.co.kr/api/quotes/rec12345678901234',{method:'PATCH',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await c.PATCH(request({deleted:true,reason:'test'}),context)).status,401);
 member='tester';assert.equal((await c.PATCH(request({deleted:true,reason:'test'},'https://evil.example'),context)).status,403);
 for(const body of [null,{}, {deleted:true,reason:''},{deleted:'false'}])assert.equal((await c.PATCH(request(body),context)).status,400);
 assert.equal(writes,0);
 assert.equal((await c.PATCH(request({deleted:true,reason:'test'}),context)).status,200);assert.equal(writes,1);
});
