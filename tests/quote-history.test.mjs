import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
function runTs(path,globals){const source=fs.readFileSync(new URL(path,import.meta.url),'utf8');const code=stripTypeScriptTypes(source.replace(/^import .*;$/gm,'').replace(/^export /gm,''));const context=vm.createContext(globals);vm.runInContext(code,context);return context;}
test('history uses bounded pagination, whitelist, literal search, and never leaks raw records',async()=>{
 const calls=[];
 const c=runTs('../src/lib/airtable/quotes.ts',{process:{env:{AIRTABLE_TOKEN:'mock',AIRTABLE_BASE_ID:'appMock'}},URLSearchParams,AbortSignal,Date,Error,fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({records:[{id:'rec12345678901234',fields:{fldarqONAT0cvnlBc:'OG-TEST',fldMruU9RhDA44EyD:'Fixture',fldskak7i2iuJOY8r:0,fld11Vy38j2SZgqIf:'private json',fld1Wn6pq9yiqEvFy:'private contact'}}],offset:'itr/next'})};}});
 const query='x"),TRUE(),("\\';const result=await c.listQuoteHistory(query,false);
 const params=new URL(calls[0].url).searchParams;
 assert.equal(params.get('pageSize'),'50');assert.equal(params.get('returnFieldsByFieldId'),'true');
 assert.equal(params.get('filterByFormula'),`AND(NOT({삭제함}),FIND(${JSON.stringify(query.toLowerCase())},LOWER({견적번호}&" "&{거래처명}))>0)`);
 assert.equal(params.getAll('fields[]').length,10);assert.equal(params.getAll('fields[]').includes('fld11Vy38j2SZgqIf'),false);
 assert.equal(result.items[0].total,0);assert.equal(result.items[0].deleted,false);assert.equal(result.nextOffset,'itr/next');
 assert.ok(!JSON.stringify(result).includes('private'));assert.equal(calls[0].options.method,undefined);assert.equal(calls[0].options.cache,'no-store');
 await c.listQuoteHistory('',true,'itr/next');const next=new URL(calls[1].url).searchParams;
 assert.equal(next.get('offset'),'itr/next');assert.equal(next.has('filterByFormula'),false);
});
test('history route requires membership and returns private noncached data',async()=>{
 let member=null,reads=0;const c=runTs('../src/app/api/quotes/route.ts',{auth:async()=>({user:{member}}),listQuoteHistory:async()=>{reads++;return {items:[],nextOffset:null};},Response,URL,Error});
 const req=q=>new Request('https://app.open-garden.co.kr/api/quotes?'+q);
 assert.equal((await c.GET(req(''))).status,401);member='tester';
 assert.equal((await c.GET(req('q='+ 'a'.repeat(101)))).status,400);
 assert.equal((await c.GET(req('q=%00'))).status,400);assert.equal(reads,0);
 const response=await c.GET(req(''));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(reads,1);
});
