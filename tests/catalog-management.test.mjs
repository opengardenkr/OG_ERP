import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalogInput, validatePhotoOrder } from '../src/lib/catalog-input.ts';
import { stripTypeScriptTypes } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const empty={name:'',scientificName:'',sizes:[],price:null,summary:'',visibility:'비공개'};
test('optional fields, summary limit, pricing and existing photo IDs are validated',()=>{
 assert.deepEqual(validateCatalogInput(empty),empty);
 for(const input of [{...empty,price:-1},{...empty,summary:'가'.repeat(601)},{...empty,sizes:['arbitrary']},{...empty,visibility:'공개'}])assert.throws(()=>validateCatalogInput(input));
 assert.deepEqual(validatePhotoOrder(['att2','att1'],['att1','att2']),['att2','att1']);
 for(const ids of [['foreign'],['att1','att1'],Array(6).fill('att1')])assert.throws(()=>validatePhotoOrder(ids,['att1']));
});
test('catalog writes are narrow, new records remain private, and stale edits do not write',async()=>{
 const raw=fs.readFileSync(new URL('../src/lib/airtable/catalog-management.ts',import.meta.url),'utf8');
 const code=stripTypeScriptTypes(raw.replace(/^import .*;$/gm,'').replace(/^export /gm,''));
 const calls=[]; const fields={fldxfOsqC0b41oxmt:'식물',fldwpaj4TS0bW9E0x:[]};
 const c=vm.createContext({process:{env:{AIRTABLE_TOKEN:'fixture',AIRTABLE_BASE_ID:'appFixture'}},createHash,validateCatalogInput,validatePhotoOrder,MAX_PHOTO_BYTES:2097152,MAX_PHOTOS:5,URLSearchParams,AbortSignal,Buffer,fetch:async(url,opts)=>{calls.push({url,...opts});return {ok:true,json:async()=>({id:'rec12345678901234',fields})};}});
 vm.runInContext(code,c);
 await c.saveManagedCatalog({...empty,name:'식물',visibility:'공개'});
 const body=JSON.parse(calls[0].body);assert.equal(body.fields.flda4BMnsROcUcBVF,'비공개');assert.equal(calls[0].method,'POST');assert.equal(Object.keys(body.fields).length,6);
 await assert.rejects(c.saveManagedCatalog(empty,'rec12345678901234','stale'),/수정된/);
 assert.equal(calls.filter(c=>c.method==='POST'||c.method==='PATCH').length,1);
});
