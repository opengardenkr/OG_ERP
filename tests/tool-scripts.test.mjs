import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// 옛 제안서 생성기(proposal.html)는 2026-11-06 삭제. 남은 HTML 도구의 스크립트가 깨지지 않았는지만 본다.
const quote = fs.readFileSync(new URL('../public/tools/quote.html', import.meta.url), 'utf8');
const integration = fs.readFileSync(new URL('../public/tools/quote-integration.js', import.meta.url), 'utf8');

test('quote tool and its ERP integration script parse', () => {
  for (const [, script] of quote.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if (script.trim()) new vm.Script(script.replace(/import\.meta/g, '({url: ""})'));
  new vm.Script(integration);
});

test('quote integration no longer sends items to the removed proposal tool', () => {
  assert.ok(!integration.includes("'/proposal'"));
  assert.ok(!integration.includes('현재 품목으로 제안서'));
});
