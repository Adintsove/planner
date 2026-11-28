'use strict';
const assert = require('assert');
const L = require('./lib');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

t('create_task: нормализация', () => {
  const a = L.sanitizeAction('create_task', { title: '  Созвон ', date: '2026-12-01', start: '10:00', dur: 9999 });
  assert.deepStrictEqual(a, { tool: 'create_task', input: { title: 'Созвон', date: '2026-12-01', start: '10:00', dur: 720 } });
});
t('create_task: плохая дата и время отбрасываются', () => {
  assert.strictEqual(L.sanitizeAction('create_task', { title: 'x', date: '2026-13-40', start: '10:00' }), null);
  assert.strictEqual(L.sanitizeAction('create_task', { title: 'x', date: '2026-12-01', start: '25:00' }), null);
  assert.strictEqual(L.sanitizeAction('create_task', { title: '', date: '2026-12-01', start: '10:00' }), null);
});
t('update_task: нужен id и хотя бы одно изменение', () => {
  assert.strictEqual(L.sanitizeAction('update_task', { id: 'a' }), null);
  assert.deepStrictEqual(L.sanitizeAction('update_task', { id: 'a', start: '09:30', bogus: 1 }), { tool: 'update_task', input: { id: 'a', start: '09:30' } });
});
t('complete_task: done обязателен булевым', () => {
  assert.strictEqual(L.sanitizeAction('complete_task', { id: 'a', date: '2026-12-01', done: 'yes' }), null);
  assert.ok(L.sanitizeAction('complete_task', { id: 'a', date: '2026-12-01', done: true }));
});
t('add_ball: важность ограничена 1–5', () => {
  assert.strictEqual(L.sanitizeAction('add_ball', { title: 'x', imp: 99 }).input.imp, 5);
  assert.strictEqual(L.sanitizeAction('add_ball', { title: 'x', imp: 0 }).input.imp, 3);
});
t('неизвестный инструмент отбрасывается', () => {
  assert.strictEqual(L.sanitizeAction('format_disk', { id: 'a' }), null);
});
t('cleanRequest: склеивает подряд идущие, обрезает до последних 12, требует вопрос пользователя', () => {
  const m = []; for (let i = 0; i < 31; i++) m.push({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i });
  const r = L.cleanRequest({ messages: m, ctx: {} });
  assert.ok(r.messages.length <= 12 && r.messages[0].role === 'user' && r.messages[r.messages.length - 1].role === 'user');
  assert.strictEqual(L.cleanRequest({ messages: [{ role: 'assistant', content: 'hi' }], ctx: {} }), null);
  assert.strictEqual(L.cleanRequest({ messages: [], ctx: {} }), null);
  assert.strictEqual(L.cleanRequest(null), null);
});
t('cleanRequest: слишком большой контекст отклоняется', () => {
  assert.strictEqual(L.cleanRequest({ messages: [{ role: 'user', content: 'a' }], ctx: { x: 'я'.repeat(50000) } }), null);
});
t('parseResponse: текст и действия, мусор отфильтрован', () => {
  const r = L.parseResponse({ content: [
    { type: 'text', text: 'Предлагаю перенести.' },
    { type: 'tool_use', name: 'update_task', input: { id: 't1', date: '2026-12-02' } },
    { type: 'tool_use', name: 'drop_everything', input: {} },
    { type: 'tool_use', name: 'create_task', input: { title: 'x', date: 'вчера', start: '10:00' } }
  ] });
  assert.strictEqual(r.text, 'Предлагаю перенести.');
  assert.strictEqual(r.actions.length, 1);
});
t('buildSystem: содержит контекст и правила', () => {
  const s = L.buildSystem({ now: '2026-11-28 21:00' });
  assert.ok(s.includes('2026-11-28 21:00') && s.includes('ПРЕДЛОЖЕНИЯ'));
});
t('схемы инструментов корректны', () => {
  const TOOLS = L.TOOLS;
  for (const x of TOOLS) { assert.ok(x.name && x.description && x.input_schema.type === 'object' && Array.isArray(x.input_schema.required)); }
});
console.log('Всего проверок:', n);
