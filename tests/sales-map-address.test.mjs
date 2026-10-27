import test from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeAddress } from '../src/lib/sales-map-address.ts';
test('departments and floors are approximate locations, never full addresses',()=>{
 for(const v of ['별관 A동 3층 정원도시과','조경과 2층','서울시청','서울 강남구'])assert.equal(looksLikeAddress(v),false,v);
 for(const v of ['서울시 서초구 헌릉로 350','충남 천안시 송정2길 19-44','내곡동 1-1683'])assert.equal(looksLikeAddress(v),true,v);
});
