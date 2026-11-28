'use strict';
/* Проверка index.js с подставными модулями Firebase (без установки пакетов и без сети). */
const Module = require('module'); const assert = require('assert');
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
let counts = {}, params = { OWNER_EMAILS: 'me@x.com', ASSISTANT_MODEL: 'claude-sonnet-5-5', ASSISTANT_DAILY_LIMIT: '2' };
const stubs = {
  'firebase-functions/v2/https': { onCall: (o, h) => h, HttpsError },
  'firebase-functions/params': { defineSecret: n => ({ value: () => 'sk-test' }), defineString: n => ({ value: () => params[n] }) },
  'firebase-functions/logger': { error() {}, info() {} },
  'firebase-admin': { initializeApp() {}, firestore: () => ({ doc: p => ({ p }), runTransaction: async f => f({ get: async r => ({ exists: counts[r.p] !== undefined, data: () => ({ n: counts[r.p] }) }), set: (r, d) => { counts[r.p] = d.n; } }) }) }
};
const orig = Module._load; Module._load = function (r, ...a) { return stubs[r] || orig.call(this, r, ...a); };
const { assistant } = require('./index.js');
const req = (email, msg = 'привет') => ({ auth: email ? { uid: 'u1', token: { email, email_verified: true } } : null, data: { messages: [{ role: 'user', content: msg }], ctx: { now: 'x' } } });
let lastBody = null, apiRes = { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Привет!' }, { type: 'tool_use', name: 'add_ball', input: { title: 'Позвонить маме', imp: 4 } }] }), text: async () => '' };
global.fetch = async (url, o) => { lastBody = JSON.parse(o.body); lastBody._h = o.headers; lastBody._url = url; return apiRes; };
(async () => {
  const rej = async (r, code) => { try { await assistant(r); assert.fail('должна быть ошибка ' + code); } catch (e) { assert.strictEqual(e.code, code, e.message); } };
  await rej(req(null), 'unauthenticated'); console.log('ok без входа отказ');
  await rej(req('evil@x.com'), 'permission-denied'); console.log('ok чужой адрес отказ');
  const r = await assistant(req('Me@X.com')); assert.strictEqual(r.text, 'Привет!'); assert.strictEqual(r.actions[0].tool, 'add_ball'); assert.strictEqual(r.left, 1); console.log('ok владелец (без учёта регистра), ответ и действия');
  assert.strictEqual(lastBody._url, 'https://api.anthropic.com/v1/messages'); assert.strictEqual(lastBody._h['x-api-key'], 'sk-test'); assert.ok(lastBody.tools.length >= 5 && lastBody.system.includes('now')); console.log('ok запрос к API: ключ, инструменты, контекст');
  await assistant(req('me@x.com')); await rej(req('me@x.com'), 'resource-exhausted'); console.log('ok дневной лимит');
  counts = {}; apiRes = { ok: false, status: 401, text: async () => 'bad key' }; await rej(req('me@x.com'), 'failed-precondition'); console.log('ok ошибка ключа');
  apiRes = { ok: false, status: 429, text: async () => '' }; await rej(req('me@x.com'), 'unavailable'); console.log('ok перегрузка');
  params.OWNER_EMAILS = ''; await rej(req('me@x.com'), 'permission-denied'); console.log('ok пустой список владельцев = никому нельзя');
  console.log('Все проверки index.js пройдены');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
