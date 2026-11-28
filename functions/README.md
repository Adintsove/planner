# Помощник ADN Planner: как запустить (один раз)

Помощник работает так: приложение отправляет вопрос в нашу функцию в Firebase, функция спрашивает Claude и возвращает ответ. Ключ от Claude хранится только в Google Cloud, в приложении и на GitHub его нет. Помощник отвечает только вам (по вашему Google-адресу) и не больше 80 раз в сутки.

## Что понадобится
1. **Тариф Blaze в Firebase.** Firebase → проект `adn-planner` → шестерёнка → «Использование и платежи» → «Изменить тариф» → Blaze. Нужна банковская карта. Бесплатные лимиты остаются, для личного использования расходы на сервер почти нулевые. Советуем сразу задать бюджетное оповещение (например, 5 долларов).
2. **Ключ Anthropic API.** Зайдите на https://console.anthropic.com (это отдельный аккаунт, подписка claude.ai туда не входит), пополните баланс на несколько долларов и создайте ключ: «API keys» → «Create key». Скопируйте ключ и никому не показывайте.

## Запуск (в браузере, ничего устанавливать не нужно)
1. Откройте https://console.cloud.google.com/?cloudshell=true , выберите проект `adn-planner`. Внизу откроется окно терминала (Cloud Shell).
2. Вставьте команды по одной:
```
git clone https://github.com/Adintsove/planner.git
cd planner
firebase login --no-localhost
firebase use adn-planner
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase deploy --only functions
```
   - `firebase login --no-localhost` покажет ссылку: откройте её, войдите в Google, скопируйте код и вставьте в терминал.
   - `secrets:set` попросит вставить ключ Anthropic (при вставке он не отображается, это нормально), затем Enter.
   - `deploy` спросит `OWNER_EMAILS`: впишите Google-адрес, под которым входите в приложение. Если спросит про включение сервисов Google, отвечайте `y`.
3. Через пару минут появится `Deploy complete`. В приложении (Ежедневник) над кнопкой микрофона появится кнопка помощника.

## Обновление и настройки
- Новая версия функции: в Cloud Shell `cd planner && git pull && firebase deploy --only functions`.
- Модель по умолчанию `claude-sonnet-5-5`. Для более дешёвой можно указать `claude-haiku-5-5` в параметре `ASSISTANT_MODEL` (файл `functions/.env`, строка `ASSISTANT_MODEL=claude-haiku-5-5`, затем деплой).
- Лимит запросов в сутки: параметр `ASSISTANT_DAILY_LIMIT` (по умолчанию 80).

## Проверки без сервера
В папке `functions`: `node test.js` и `node test-index.js`.
