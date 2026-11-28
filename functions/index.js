'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { TOOLS, cleanRequest, buildSystem, parseResponse } = require('./lib');

admin.initializeApp();

/* Ключ Anthropic хранится только здесь, в секретах Google Cloud. В приложении и на GitHub его нет. */
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const OWNER_EMAILS = defineString('OWNER_EMAILS', {
  description: 'Ваш Google-адрес (можно несколько через запятую). Только им доступен помощник.'
});
const MODEL = defineString('ASSISTANT_MODEL', { default: 'claude-sonnet-5-5' });
const DAILY_LIMIT = defineString('ASSISTANT_DAILY_LIMIT', { default: '80' });

exports.assistant = onCall(
  { region: 'europe-west1', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '256MiB', maxInstances: 2 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Войдите через Google в Настройках.');
    const email = String(req.auth.token.email || '').toLowerCase();
    const owners = OWNER_EMAILS.value().split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!owners.length || !owners.includes(email) || req.auth.token.email_verified === false) {
      throw new HttpsError('permission-denied', 'Помощник доступен только владельцу приложения.');
    }
    const clean = cleanRequest(req.data);
    if (!clean) throw new HttpsError('invalid-argument', 'Пустой или слишком большой запрос.');

    /* Дневной лимит запросов: защита от случайных трат. */
    const limit = parseInt(DAILY_LIMIT.value(), 10) || 80;
    const day = new Date().toISOString().slice(0, 10);
    const db = admin.firestore();
    const ref = db.doc('assistant_usage/' + req.auth.uid + '_' + day);
    const used = await db.runTransaction(async (t) => {
      const s = await t.get(ref);
      const c = (s.exists ? s.data().n || 0 : 0) + 1;
      if (c > limit) return -1;
      t.set(ref, { n: c, uid: req.auth.uid, day }, { merge: true });
      return c;
    });
    if (used < 0) throw new HttpsError('resource-exhausted', 'На сегодня лимит запросов к помощнику исчерпан (' + limit + '). Завтра он обновится.');

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 50000);
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctl.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY.value(),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL.value(),
          max_tokens: 1024,
          system: buildSystem(clean.ctx),
          tools: TOOLS,
          messages: clean.messages
        })
      });
    } catch (e) {
      logger.error('anthropic fetch failed', String(e && e.message));
      throw new HttpsError('unavailable', 'Помощник сейчас не отвечает. Попробуйте ещё раз.');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error('anthropic error', res.status, body.slice(0, 500));
      if (res.status === 401 || res.status === 403) throw new HttpsError('failed-precondition', 'Ключ Anthropic не принят. Проверьте ключ и баланс на console.anthropic.com.');
      if (res.status === 429 || res.status === 529) throw new HttpsError('unavailable', 'Сервис ИИ перегружен. Попробуйте через минуту.');
      if (res.status === 400 && /credit|balance/i.test(body)) throw new HttpsError('failed-precondition', 'На счёте Anthropic закончились средства.');
      throw new HttpsError('internal', 'Помощник не смог ответить (код ' + res.status + ').');
    }
    const out = parseResponse(await res.json());
    return { text: out.text, actions: out.actions, left: Math.max(0, limit - used) };
  }
);
