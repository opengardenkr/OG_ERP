import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/tools/quote-integration.js',import.meta.url),'utf8');
function setup(){
  const customer={name:'이선미, 민헌기'};
  const field={value:'',after(){}};
  const select={value:'0'};
  let load, saved=0;
  const window={addEventListener:(event,fn)=>{load=fn;},saveDraft:()=>saved++};
  window.loadClient=()=>{if(select.value!=='')field.value=customer.name;};
  window.pickClient=()=>{field.value=customer.name;};
  window.onClientKey=(id,event)=>{if(event.key==='Enter')field.value=customer.name;};
  window.onClientBlur=()=>{if(!field.value)field.value=customer.name;};
  const document={getElementById:id=>({cName:field,clientSelect:select}[id]||null),querySelector:()=>null,createElement:()=>({})};
  vm.runInNewContext(source,{window,document});load();
  return {window,field,select,customer,saved:()=>saved};
}
test('dropdown and autocomplete populate one name without changing customer data',()=>{
 for(const handler of ['loadClient','pickClient','onClientKey','onClientBlur']){
  const s=setup();s.window[handler]('cCompany',{key:'Enter'});
  assert.equal(s.field.value,'이선미',handler);assert.equal(s.customer.name,'이선미, 민헌기');assert.equal(s.saved(),1);
 }
});
test('manual names and keyboard navigation stay unchanged',()=>{
 const s=setup();s.field.value='Jane Mary Smith';s.window.onClientKey('cName',{key:'ArrowDown'});s.window.onClientBlur('cName');
 assert.equal(s.field.value,'Jane Mary Smith');assert.equal(s.saved(),0);
 s.field.value='이선미, 민헌기';s.select.value='';s.window.loadClient();assert.equal(s.field.value,'이선미, 민헌기');
});
test('explicit separators split names but spaces and slashes in titles do not',()=>{
 for(const [input,expected] of [[' 이선미， 민헌기','이선미'],['이선미\n민헌기','이선미'],['이선미; 민헌기','이선미'],['SATOKI MATSUI','SATOKI MATSUI'],['송병수 부회장 / 대표이사','송병수 부회장 / 대표이사'],['','']]){
  const s=setup();s.customer.name=input;s.window.pickClient();assert.equal(s.field.value,expected);
 }
});
