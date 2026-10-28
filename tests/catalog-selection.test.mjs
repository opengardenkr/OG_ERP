import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {decode,safeImage}=require('../public/tools/catalog-selection.js');
const encode=data=>Buffer.from(JSON.stringify(data)).toString('base64url');
const item={kname:'수국',sname:'Hydrangea',size:'C2',qty:3};
test('selection imports Korean names and quantities without price or personal fields',()=>{
 const [row]=decode(encode({version:1,items:[{...item,price:99,phone:'private'}]}));
 assert.equal(row.kname,'수국');assert.equal(row.qty,3);assert.equal(row.price,undefined);assert.equal(row.phone,undefined);
});
test('malformed, empty, oversized and incomplete selections fail closed',()=>{
 for(const value of [null,{}, {version:1,items:[]},{version:1,items:[null]},{version:1,items:[{kname:'수국'}]},{version:1,items:Array(21).fill(item)}])assert.throws(()=>decode(encode(value)));
 assert.throws(()=>decode('a'.repeat(7001)));assert.throws(()=>decode('%bad'));
 assert.equal(decode(encode({version:1,items:[{...item,qty:'Infinity'}]}))[0].qty,1);
});
test('only public OpenGarden image routes are imported, including website previews',()=>{
 const tail='/api/plant-image?group=immediate&id=rec12345678901234';
 for(const host of ['opengardenweb-git-codex-catalog-integration-20261027-opengarden.vercel.app','open-garden.co.kr','opengarden-web.vercel.app','opengarden-web-git-codex-catalog-integration-20261027-opengarden.vercel.app'])assert.ok(safeImage('https://'+host+tail));
 for(const url of ['http://open-garden.co.kr'+tail,'https://open-garden.co.kr.evil.com'+tail,'https://user:pass@open-garden.co.kr'+tail,'https://open-garden.co.kr/api/stock','https://evil.vercel.app'+tail])assert.equal(safeImage(url),'');
});
test('exact match avoids ambiguous cultivars and sizes',()=>{
 const {match}=require('../public/tools/catalog-selection.js');
 const rows=[{...item,plantCode:'SKU-1'},{...item,size:'C3',plantCode:'SKU-2'}];
 assert.equal(match({kname:'수국',size:'C2'},rows).plantCode,'SKU-1');
 assert.equal(match({kname:'수국',size:'C4'},rows),null);
 assert.equal(match({kname:'수국',size:'C2'},[rows[0],{...rows[0],plantCode:'another'}]),null);
 assert.equal(match({kname:'수국',size:'C2',sname:'Wrong cultivar'},rows),null);
});
test('selection encoding round trips without importing financial data',()=>{
 const {encode}=require('../public/tools/catalog-selection.js');
 assert.equal(decode(encode([item]))[0].kname,item.kname);
});
