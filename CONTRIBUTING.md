# Contributing

Спасибо за интерес к проекту! Мы приветствуем вклад от сообщества.

## Как внести вклад

### Баг-репорты

Откройте [Issue](https://github.com/knottasoft/teacher-assistant/issues) с описанием:
- Что произошло и что ожидалось
- Шаги для воспроизведения
- Версия плагина (`plugin.json` → version)

### Новые предметы и темы

Данные ФГОС хранятся в `mcp-server/src/data/fgos/`. Для добавления нового предмета:

1. Создайте `mcp-server/src/data/fgos/<subject>.json` по схеме `schemas/fgos.schema.json`
2. Добавьте предмет в `SUBJECT_FILES` и `SUBJECT_ALIASES` в `mcp-server/src/tools/fgos-lookup.ts`
3. Создайте правила предмета в `.claude/rules/subjects/<subject>.md`
4. Добавьте навыки (skills) в `skills/`
5. Обновите `plugin.json`, `CLAUDE.md`, `README.md`

### Новые навыки (slash-commands)

1. Создайте `skills/<skill-name>/SKILL.md` с YAML frontmatter:
   ```yaml
   ---
   name: skill-name
   description: Описание навыка
   argument-hint: "[аргументы]"
   allowed-tools: Read, Write, ...
   user-invocable: true
   ---
   ```
2. Добавьте инструкции и шаблоны
3. Обновите README.md и CLAUDE.md

### Pull Requests

1. Форкните репозиторий
2. Создайте ветку: `git checkout -b feature/my-feature`
3. Внесите изменения
4. Убедитесь, что тесты проходят: `npm test`
5. Убедитесь, что TypeScript компилируется: `npm run typecheck`
6. Валидация ФГОС-данных: `npm run validate`
7. Создайте PR с описанием изменений

## Разработка

```bash
# Клонировать
git clone https://github.com/knottasoft/teacher-assistant.git
cd teacher-assistant

# Установить зависимости
cd mcp-server && npm install && cd ..

# Режим разработки (автоперекомпиляция)
npm run dev --prefix mcp-server

# Тесты
npm test

# Проверка типов
npm run typecheck

# Валидация ФГОС-данных
npm run validate
```

## Стиль кода

- TypeScript strict mode
- Сообщения, описания и комментарии на русском языке (для учебного контента)
- Код и идентификаторы на английском языке
- Без сторонних линтеров — используем TypeScript strict + тесты

## Лицензия

Внося вклад, вы соглашаетесь с тем, что ваш код будет лицензирован под MIT License.
