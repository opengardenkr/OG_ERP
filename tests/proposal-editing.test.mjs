import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const proposal=fs.readFileSync(new URL('../public/tools/proposal.html',import.meta.url),'utf8');
const editor=fs.readFileSync(new URL('../public/tools/proposal-editor.js',import.meta.url),'utf8');
const quote=fs.readFileSync(new URL('../public/tools/quote.html',import.meta.url),'utf8');
test('all inline and extension scripts parse',()=>{
 for(const html of [proposal,quote])for(const [,script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(script.trim())new vm.Script(script.replace(/import\.meta/g,'({url: ""})'));
 new vm.Script(editor);new vm.Script(fs.readFileSync(new URL('../public/tools/quote-integration.js',import.meta.url),'utf8'));
});
test('print card uses edited text safely and preserves source identity',()=>{
 const start=proposal.indexOf('function cardHtml(original)');const end=proposal.indexOf('/* ═══ 배치',start);
 const context={cardEdits:new Map([['id',{kor:'<edited>',description:'new description'}]]),manualImages:new Map(),photoTransformStyle:()=>'',photoPickIndex:()=>0,webImagesOn:()=>false,esc:s=>String(s??'').replace(/</g,'&lt;').replace(/>/g,'&gt;'),MAX_SPEC_ROWS:5};
 vm.createContext(context);vm.runInContext(proposal.slice(start,end),context);
 const html=context.cardHtml({cardKey:'id',kor:'source',variety:'v',latin:'scientific',photos:[],priceRows:[]});
 assert.ok(html.includes('&lt;edited&gt;'));assert.ok(html.includes('new description'));assert.ok(html.includes('data-cardkey="id"'));assert.ok(!html.includes('>source<'));
});
test('opening proposal never removes expired user snapshots',()=>{
 const body=proposal.match(/function purgeExpiredSnaps\(\) \{([^}]+)\}/)[1];
 assert.equal(new Function(body)(),0);assert.ok(!body.includes('localStorage'));
});
test('bundled quote exposes form bridge methods required by integration',()=>{
 const names=quote.match(/var Vg=(\[[^\]]+\])/)[1];
 const exported=vm.runInNewContext(names);
 for(const name of ['readForm','applyToForm']) assert.ok(exported.includes(name),`${name} must be exposed on window for the catalog bridge`);
});
