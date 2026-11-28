'use strict';
/* Чистая логика помощника без внешних зависимостей: её можно проверить обычным `node test.js`. */

const TOOLS = [
  {
    name: 'create_task',
    description: 'Предложить новую задачу в Ежедневнике на конкретную дату и время.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Короткое название задачи' },
        date: { type: 'string', description: 'Дата YYYY-MM-DD' },
        start: { type: 'string', description: 'Время начала HH:MM (24 часа)' },
        dur: { type: 'integer', description: 'Длительность в минутах, от 5 до 720' },
        sphere: { type: 'string', description: 'id сферы из списка сфер (если понятно)' }
      },
      required: ['title', 'date', 'start']
    }
  },
  {
    name: 'update_task',
    description: 'Предложить изменить существующую задачу: перенести, переименовать, изменить длительность. Использовать только id из списка задач.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        date: { type: 'string', description: 'Новая дата YYYY-MM-DD (для повторяющейся задачи не менять)' },
        start: { type: 'string', description: 'Новое время HH:MM' },
        dur: { type: 'integer' }
      },
      required: ['id']
    }
  },
  {
    name: 'complete_task',
    description: 'Предложить отметить задачу выполненной (или снять отметку) на конкретную дату.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        date: { type: 'string', description: 'Дата YYYY-MM-DD, на которую отмечаем' },
        done: { type: 'boolean' }
      },
      required: ['id', 'date', 'done']
    }
  },
  {
    name: 'delete_task',
    description: 'Предложить удалить задачу. Использовать только если пользователь прямо просит удалить.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  },
  {
    name: 'add_ball',
    description: 'Предложить добавить шарик (задачу без времени) в Мешок задач.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        imp: { type: 'integer', description: 'Важность от 1 до 5' },
        due: { type: 'string', description: 'Срок YYYY-MM-DD (необязательно)' },
        sphere: { type: 'string' }
      },
      required: ['title']
    }
  }
];

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const okDate = v => typeof v === 'string' && RE_DATE.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z'));

/* Проверка того, что вернула модель: лишнее отбрасывается, ничего «по доверию» не выполняется. */
function sanitizeAction(name, inp) {
  inp = inp && typeof inp === 'object' ? inp : {};
  switch (name) {
    case 'create_task': {
      const title = str(inp.title, 120);
      if (!title || !okDate(inp.date) || !RE_TIME.test(inp.start || '')) return null;
      const dur = Math.max(5, Math.min(720, parseInt(inp.dur, 10) || 30));
      const a = { title, date: inp.date, start: inp.start, dur };
      if (str(inp.sphere, 40)) a.sphere = str(inp.sphere, 40);
      return { tool: name, input: a };
    }
    case 'update_task': {
      const id = str(inp.id, 60);
      if (!id) return null;
      const a = { id };
      if (str(inp.title, 120)) a.title = str(inp.title, 120);
      if (okDate(inp.date)) a.date = inp.date;
      if (RE_TIME.test(inp.start || '')) a.start = inp.start;
      if (inp.dur !== undefined && parseInt(inp.dur, 10) > 0) a.dur = Math.max(5, Math.min(720, parseInt(inp.dur, 10)));
      return Object.keys(a).length > 1 ? { tool: name, input: a } : null;
    }
    case 'complete_task': {
      const id = str(inp.id, 60);
      if (!id || !okDate(inp.date) || typeof inp.done !== 'boolean') return null;
      return { tool: name, input: { id, date: inp.date, done: inp.done } };
    }
    case 'delete_task': {
      const id = str(inp.id, 60);
      return id ? { tool: name, input: { id } } : null;
    }
    case 'add_ball': {
      const title = str(inp.title, 120);
      if (!title) return null;
      const a = { title, imp: Math.max(1, Math.min(5, parseInt(inp.imp, 10) || 3)) };
      if (okDate(inp.due)) a.due = inp.due;
      if (str(inp.sphere, 40)) a.sphere = str(inp.sphere, 40);
      return { tool: name, input: a };
    }
    default:
      return null;
  }
}

/* Что пришло с телефона: только известные поля, ограниченный размер. */
function cleanRequest(data) {
  if (!data || typeof data !== 'object') return null;
  const msgs = Array.isArray(data.messages) ? data.messages : [];
  const m = [];
  for (const x of msgs.slice(-12)) {
    if (!x || (x.role !== 'user' && x.role !== 'assistant')) continue;
    const c = str(x.content, 2000);
    if (!c) continue;
    if (m.length && m[m.length - 1].role === x.role) m[m.length - 1].content += '\n' + c;
    else m.push({ role: x.role, content: c });
  }
  while (m.length && m[0].role !== 'user') m.shift();
  if (!m.length || m[m.length - 1].role !== 'user') return null;
  const ctx = data.ctx && typeof data.ctx === 'object' ? data.ctx : {};
  const json = JSON.stringify(ctx);
  if (json.length > 40000) return null;
  return { messages: m, ctx };
}

function buildSystem(ctx) {
  return [
    'Ты — личный помощник в планировщике «ADN Planner». Говоришь с владельцем приложения, он не программист.',
    'Отвечай по-русски (если пользователь пишет на другом языке, отвечай на нём), коротко и по делу: обычно 2–5 предложений. Без воды и без лишних списков.',
    'Ты видишь задачи пользователя, мешок задач, цели, «природные законы» (принципы, которые он хочет помнить) и статистику выполнения за последние дни. Опирайся только на эти данные и ничего не выдумывай.',
    'Чтобы изменить расписание, вызывай инструменты. Это только ПРЕДЛОЖЕНИЯ: пользователь сам нажмёт «Применить». Не говори, что уже сделал; говори «предлагаю». Используй только id задач из списка. Для повторяющихся задач (rep=1) не меняй дату, можно отмечать выполнение на дату.',
    'Если просьба неясна (нет даты или времени), задай один короткий вопрос вместо догадок. Время бери из контекста: сейчас указано в поле now.',
    'Когда просят совет по эффективности и дисциплине, опирайся на статистику (процент выполнения по дням, что переносится) и давай 1–3 конкретных шага, без нравоучений.',
    'Данные пользователя (JSON):',
    JSON.stringify(ctx)
  ].join('\n');
}

function parseResponse(api) {
  const blocks = api && Array.isArray(api.content) ? api.content : [];
  let text = '';
  const actions = [];
  for (const b of blocks) {
    if (b.type === 'text' && b.text) text += (text ? '\n' : '') + b.text;
    else if (b.type === 'tool_use') {
      const a = sanitizeAction(b.name, b.input);
      if (a && actions.length < 8) actions.push(a);
    }
  }
  return { text: text.trim(), actions };
}

module.exports = { TOOLS, sanitizeAction, cleanRequest, buildSystem, parseResponse };
