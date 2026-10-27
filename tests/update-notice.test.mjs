import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync(new URL('../src/components/update-notice.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(response){
 let states=[],cursor=0,first=true,reloads=0,dirty=false,saving=false;
 const listeners={},effects=[];
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useCallback:f=>f,useEffect:f=>{if(first)effects.push(f);}};
 const jsx=(type,props)=>({type,props});const testModule={exports:{}};
 const doc={visibilityState:'visible',addEventListener:(n,f)=>listeners[n]=f,removeEventListener(){},querySelector:s=>s.includes('form[')?dirty||saving:saving,querySelectorAll:()=>dirty?[{}]:[]};
 const win={setTimeout:()=>1,setInterval:()=>2,addEventListener:(n,f)=>listeners[n]=f,removeEventListener(){},location:{reload:()=>reloads++}};
 vm.runInNewContext(source,{module:testModule,exports:testModule.exports,require:n=>n==='react'?react:{jsx,jsxs:jsx,Fragment:'fragment'},window:win,document:doc,navigator:{onLine:true},fetch:async()=>response,clearTimeout(){},clearInterval(){},queueMicrotask,Element:class{},HTMLFormElement:class{}});
 function render(){cursor=0;const out=testModule.exports.UpdateNotice({current:{id:'old',label:'Old'}});if(first){first=false;effects.forEach(f=>f());}return out;}
 function nodes(root){if(!root||typeof root!=='object')return [];return [root,...[root.props?.children].flat(Infinity).flatMap(nodes)];}
 const button=label=>nodes(render()).find(n=>n.type==='button'&&n.props.children===label);
 return {button,render,listeners,setDirty:v=>dirty=v,setSaving:v=>saving=v,get reloads(){return reloads;}};
}
test('new deployment is advisory; dirty forms and pending saves prevent reload',async()=>{
 const h=harness({ok:true,json:async()=>({id:'new',label:'New'})});
 await h.button('업데이트 확인').props.onClick(); await new Promise(r=>setImmediate(r));
 assert.ok(h.button('저장 후 새로고침'));assert.equal(h.reloads,0);
 h.setDirty(true);h.button('저장 후 새로고침').props.onClick();assert.equal(h.reloads,0);
 h.setDirty(false);h.setSaving(true);h.button('저장 후 새로고침').props.onClick();assert.equal(h.reloads,0);
 h.setSaving(false);h.button('저장 후 새로고침').props.onClick();assert.equal(h.reloads,1);
});
test('malformed or redirected version responses leave manual check usable',async()=>{
 for(const response of [{ok:true,json:async()=>({id:7})},{ok:false,type:'opaqueredirect'}]){
  const h=harness(response);await h.button('업데이트 확인').props.onClick();await new Promise(r=>setImmediate(r));
  assert.equal(h.button('업데이트 확인').props.disabled,false);assert.equal(h.reloads,0);
 }
});
test('beforeunload protects unsaved forms',()=>{
 const h=harness({ok:false});h.render();h.setDirty(true);let blocked=false;
 h.listeners.beforeunload({preventDefault(){blocked=true;}});assert.ok(blocked);
});
