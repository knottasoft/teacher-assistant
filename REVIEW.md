# Code Review: Teacher Assistant — Claude Code Marketplace Plugin

**Дата:** 21.02.2026
**Ревьюер:** Claude Code (Opus 4.6)
**Версия плагина:** 1.0.0
**Ветка:** `claude/review-marketplace-code-DYVJL`

---

## Резюме

Проект представляет собой комплексный Claude Code плагин для преподавателей российских школ (5-11 классы) — с 18 навыками (skills), MCP-сервером с 5 инструментами, педагогическими правилами и поддержкой нескольких каналов дистрибуции. Архитектура в целом качественная и хорошо структурирована.

Ниже — детальный review по каждому компоненту с привязкой к официальной документации Claude Code.

**Итоговая оценка: 7.5/10** — зрелый, функциональный плагин с рядом структурных и технических замечаний, которые нужно исправить перед публикацией на маркетплейс.

---

## 1. Структура маркетплейса (`.claude-plugin/marketplace.json`)

### Соответствие спецификации

Ссылка: [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)

| Требование | Статус | Комментарий |
|-----------|--------|-------------|
| Поле `name` (kebab-case) | OK | `"knottasoft-education"` |
| Поле `owner.name` | OK | `"knottasoft"` |
| Поле `owner.email` | OK | `"knottasoft@github.com"` |
| `metadata.description` | OK | Есть |
| `metadata.version` | OK | `"1.0.0"` |
| Массив `plugins` | OK | 1 плагин |
| Plugin `name` | OK | `"teacher-assistant"` |
| Plugin `source` | ПРОБЛЕМА | `"."` — должно быть `"./"` |

### Замечания

#### КРИТИЧЕСКОЕ: Неверный формат `source`

**Файл:** `.claude-plugin/marketplace.json:15`

```json
"source": "."
```

По документации, относительные пути **должны начинаться с `./`**:

> Relative paths only work when users add your marketplace via Git. [...] Must start with `./`

**Исправление:** заменить на `"source": "./"`.

#### КРИТИЧЕСКОЕ: Отсутствует `.claude-plugin/plugin.json`

По документации Claude Code Plugins, каждый плагин **обязан** иметь манифест `.claude-plugin/plugin.json`:

> Every plugin lives in its own directory containing a manifest [...] The manifest file at `.claude-plugin/plugin.json` defines your plugin's identity.

Сейчас в `.claude-plugin/` лежит только `marketplace.json`. Корневой `plugin.json` (без `.claude-plugin/` директории) **не обнаруживается** Claude Code как плагин-манифест. Нужно создать `.claude-plugin/plugin.json` со стандартными полями (`name`, `description`, `version`, `author`).

Текущий корневой `plugin.json` содержит нестандартные поля (`displayName`, `description_en`, `icon`, `minClaudeCodeVersion`, `subjects`, `standards`, `mcpTools`, `mcpResources`, `install`), которые Claude Code **игнорирует**.

#### СРЕДНЕЕ: `skills` в marketplace entry — нестандартное поле

```json
"skills": [
  "./skills/lesson-plan",
  "./skills/assignment",
  ...
]
```

Поле `skills` не является частью [Plugin entries schema](https://code.claude.com/docs/en/plugin-marketplaces#plugin-entries). По умолчанию (`strict: true`) Claude Code читает компоненты из `plugin.json` манифеста. Skills обнаруживаются автоматически из директории `skills/` внутри плагина — перечислять их вручную не нужно.

#### НИЗКОЕ: `category: "learning"` — не стандартизировано

Поле `category` допускается, но значение `"learning"` не входит в типичные категории. Рекомендуется `"education"` (как в `plugin.json` → `categories`).

---

## 2. Манифест плагина (`plugin.json`)

### Проблемы

#### КРИТИЧЕСКОЕ: Файл расположен не в том месте

Файл `plugin.json` находится в корне проекта, но Claude Code ожидает его в `.claude-plugin/plugin.json`:

> Create the `.claude-plugin` directory inside your plugin folder [...] Then create `.claude-plugin/plugin.json`.

#### СРЕДНЕЕ: Нестандартные поля

Следующие поля **не входят** в схему plugin manifest:

- `displayName` — не поддерживается (используй `name` + описание)
- `description_en` — не поддерживается
- `icon` — не поддерживается в текущей версии
- `minClaudeCodeVersion` — не поддерживается
- `subjects` — кастомное поле, будет проигнорировано
- `standards` — кастомное поле
- `categories` — не поддерживается (используй `category` в marketplace)
- `tags` — допускается как `keywords` в marketplace entry
- `mcpTools`, `mcpResources` — не поддерживаются
- `install` — не поддерживается

Эти поля не вызовут ошибки (неизвестные ключи игнорируются), но и не дадут функциональности. Рекомендуется оставить только стандартные поля.

#### СРЕДНЕЕ: Дублирование `skills` как массив строк

```json
"skills": [
  "lesson-plan",
  "assignment",
  ...
]
```

Skills обнаруживаются автоматически из директории `skills/`. Перечислять их вручную не нужно и не поддерживается.

---

## 3. Навыки (Skills) — `skills/*/SKILL.md`

### Соответствие спецификации

Ссылка: [Claude Code Skills](https://code.claude.com/docs/en/skills)

Всего: 18 навыков. Проверено: все 18.

| Требование | Статус |
|-----------|--------|
| `SKILL.md` в каждой папке | OK (18/18) |
| YAML frontmatter (между `---`) | OK (18/18) |
| Поле `name` | OK (18/18) |
| Поле `description` | OK (18/18) |
| Поле `argument-hint` | OK (18/18) |
| `user-invocable: true` | OK (18/18) |
| `allowed-tools` | OK (18/18) |
| Markdown-инструкции | OK (18/18) |
| Ссылки на supporting files (`@...`) | OK |

### Положительное

- Все навыки имеют чёткие, содержательные описания на русском языке
- Грамотное использование `$ARGUMENTS[N]` для позиционных аргументов
- Хорошее разделение на supporting files (templates, examples, rubrics)
- Корректное указание `allowed-tools` с MCP-инструментами
- Логичная декомпозиция по предметам

### Замечания

#### СРЕДНЕЕ: Ссылки на supporting files используют нестандартный формат

Во всех SKILL.md файлах используется формат `@templates/`, `@examples/`, `@rubrics/`:

```markdown
Примеры планов: @examples/
Шаблон ФГОС: @templates/fgos-template.md
```

По документации Claude Code, правильный формат — Markdown-ссылки:

> Reference supporting files from `SKILL.md` so Claude knows what each file contains:
> ```
> - For complete API details, see [reference.md](reference.md)
> ```

Формат `@path` не является стандартным для Claude Code и может не быть распознан корректно. Рекомендуется заменить на `[text](path)`.

#### НИЗКОЕ: `disable-model-invocation` не задан явно

У всех 18 навыков `disable-model-invocation` не указан (по умолчанию `false`). Это означает, что Claude будет загружать описания всех 18 навыков в контекст и может автоматически вызывать любой из них. При 18 навыках это может превысить бюджет символов (2% контекстного окна, fallback 16,000 символов):

> If you have many skills, they may exceed the character budget. [...] Run `/context` to check for a warning about excluded skills.

Рекомендуется добавить `disable-model-invocation: true` для навыков, которые пользователь всегда будет вызывать явно (например, `export-doc`, `import-template`).

---

## 4. MCP-сервер (`mcp-server/`)

### Архитектура

Хорошо структурированный TypeScript MCP-сервер:
- `src/index.ts` — точка входа, регистрация инструментов и ресурсов
- `src/tools/` — 5 инструментов
- `src/resources/` — 2 провайдера ресурсов
- `src/data/fgos/` — JSON-данные ФГОС
- esbuild bundler для single-file output

### Положительное

- Чистая архитектура: каждый tool — отдельный модуль
- Использование `@modelcontextprotocol/sdk` (правильный SDK)
- Zod-валидация входных параметров
- Правильный формат MCP-ответов (`content[].type: "text"`)
- JSON-данные встраиваются в бандл через esbuild
- Хорошее покрытие тестами (3 тестовых файла)

### Замечания

#### КРИТИЧЕСКОЕ: `export-docx.ts` — таблицы не экспортируются

**Файл:** `mcp-server/src/tools/export-docx.ts:158-206`

Функция `createTable()` создаёт объекты `Table`, но возвращает только пустой `Paragraph`:

```typescript
function createTable(rows: string[][]): Paragraph[] {
  // ... создаёт tableRows, table ...

  // Tables cannot be directly added as Paragraph, so we wrap in a workaround
  // Actually, docx library handles Table as a top-level element
  // We return the table serialized as a paragraph placeholder
  return [
    new Paragraph({ text: "" }), // spacer
  ];
}
```

Таблицы — критически важный элемент для учебных документов (ход урока, КТП, тесты). Их отсутствие в DOCX-экспорте — серьёзный дефект.

**Решение:** Библиотека `docx` поддерживает `Table` как top-level element в `sections[].children`. Нужно вернуть `Table` вместо `Paragraph` и обновить тип возврата `parseMarkdownToDocx()` с `Paragraph[]` на `(Paragraph | Table)[]`.

#### СРЕДНЕЕ: `grade-analytics.ts` — синхронный `readFileSync` в async handler

**Файл:** `mcp-server/src/tools/grade-analytics.ts:75`

```typescript
async ({ data_path, metrics }) => {
  const content = readFileSync(data_path, "utf-8");
```

MCP-инструменты работают в async-контексте. Использование `readFileSync` блокирует event loop. Рекомендуется `fs/promises` → `readFile`.

Аналогично в `export-docx.ts:229` и `import-template.ts:63`.

#### СРЕДНЕЕ: `import-template.ts` — потенциальный path traversal

**Файл:** `mcp-server/src/tools/import-template.ts:67-70`

```typescript
const targetName = `${doc_type}${ext}`;
const targetPath = join(USER_TEMPLATES_DIR, targetName);
writeFileSync(targetPath, content, "utf-8");
```

Расширение `ext` берётся из пользовательского пути без проверки. Хотя `doc_type` ограничен enum'ом, `ext` может содержать `..` или другие компоненты пути. Рекомендуется валидировать расширение.

#### СРЕДНЕЕ: `fgos-lookup.ts` — fallback к полным данным при пустом результате

**Файл:** `mcp-server/src/tools/fgos-lookup.ts:134-137`

```typescript
if (sections.length === 0) {
  // Return full grade data if no matches
  sections = gradeData.sections;
}
```

Когда поиск по `topic` или `section` не даёт результатов, возвращаются **все** разделы. Это может вернуть очень большой объём данных и заполнить контекстное окно. Лучше вернуть пустой результат с сообщением «Тема не найдена» и перечислением доступных тем.

#### НИЗКОЕ: Дублирование `SUBJECT_ALIASES` и FGOS_DATA

Константы `SUBJECT_ALIASES` и `FGOS_DATA` дублируются в трёх файлах:
- `fgos-lookup.ts`
- `hours-calculator.ts`
- `resources/fgos-standards.ts`, `resources/curriculum-data.ts`

Рекомендуется вынести в общий модуль `src/data/shared.ts`.

#### НИЗКОЕ: Нет тестов для `export-docx.ts` и `import-template.ts`

Есть тесты для `fgos-lookup`, `grade-analytics`, `hours-calculator`, но нет для `export-docx` и `import-template`.

---

## 5. Конфигурации MCP (`.mcp.json`, `server.json`, `manifest.json`)

### `.mcp.json`

```json
{
  "mcpServers": {
    "teacher": {
      "type": "stdio",
      "command": "node",
      "args": ["mcp-server/dist/bundle.js"]
    }
  }
}
```

OK — корректный формат для локальной MCP-конфигурации.

### `server.json` (MCP Registry)

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json",
  "name": "io.github.knottasoft/teacher-assistant",
  ...
}
```

OK — правильный формат для MCP Registry. Имя пакета npm отличается (`@knottasoft/teacher-assistant-mcp`), корректно.

### `manifest.json` (MCPB / Claude Desktop)

```json
{
  "mcpb_version": "0.1",
  "server": {
    "type": "node",
    "entry_point": "mcp-server/dist/bundle.js"
  }
}
```

OK для Claude Desktop bundle-формата.

### Замечание: Рассинхронизация имён npm-пакетов

- `package.json` (корень): `@knottasoft/teacher-assistant`
- `mcp-server/package.json`: `@knottasoft/teacher-assistant-mcp`
- `manifest.json` → `server.mcp_config.args`: `["mcp-server/dist/bundle.js"]` (без npm-пакета)
- `server.json` → `packages[0].identifier`: `@knottasoft/teacher-assistant-mcp`
- `plugin.json` → `install.npm`: `npm install @knottasoft/teacher-assistant`
- `plugin.json` → `install.mcp`: `npx @knottasoft/teacher-assistant-mcp`

Два разных npm-пакета (`@knottasoft/teacher-assistant` и `@knottasoft/teacher-assistant-mcp`) — это нормально (один для плагина, другой для MCP-сервера), но в `publish.yml` публикуются оба из одного репозитория. Нужно убедиться, что оба зарегистрированы на npm.

---

## 6. Hooks (`hooks/hooks.json`)

### Анализ

```json
{
  "hooks": {
    "SessionStart": [...],
    "PostToolUse": [{ "matcher": "Write", ... }]
  }
}
```

#### СРЕДНЕЕ: `SessionStart` hook выводит только echo

```json
"command": "echo '{\"plugin\": \"teacher-assistant\", ...}'"
```

Этот hook просто выводит JSON-строку. `SessionStart` hook полезен для инициализации, но вывод `echo` не отображается пользователю и не влияет на поведение Claude. Hook не возвращает `BLOCK` или другой control-flow, так что он фактически бесполезен.

**Рекомендация:** Либо убрать, либо переделать в полезную инициализацию (создание директорий, проверка окружения).

#### СРЕДНЕЕ: `PostToolUse` hook с `type: "prompt"` может замедлить работу

```json
{
  "matcher": "Write",
  "hooks": [{
    "type": "prompt",
    "prompt": "Если только что созданный файл является учебным документом..."
  }]
}
```

Hook типа `prompt` выполняет дополнительный LLM-вызов после **каждого** использования `Write`. Это включает любой Write — не только учебные документы, но и конфигурационные файлы, JSON, и т.д. Это замедляет работу и увеличивает стоимость.

**Рекомендация:** Добавить более узкий matcher или использовать `command`-hook со скриптом, который проверяет расширение файла.

---

## 7. CI/CD (`.github/workflows/`)

### `ci.yml`

| Проверка | Статус |
|----------|--------|
| Matrix: Node 18, 20, 22 | OK |
| npm ci | OK |
| Typecheck | OK |
| Build | OK |
| Test | OK |
| FGOS validation | OK |
| Skill validation | OK |

#### ЗАМЕЧАНИЕ: Skill validation проверяет `argument-hint` как required

```bash
for field in name description argument-hint; do
  if ! grep -q "^${field}:" "$skill"; then
```

По документации Claude Code, `argument-hint` — **опциональное** поле. CI-проверка трактует его как обязательное. Это не ошибка (все навыки имеют `argument-hint`), но формально не соответствует спецификации.

### `publish.yml`

| Шаг | Статус |
|-----|--------|
| Publish MCP server | OK |
| Publish plugin package | OK |
| Build MCPB | OK |
| Upload to release | OK |

#### ЗАМЕЧАНИЕ: MCPB build может молча пропуститься

```bash
npm install -g @anthropic-ai/mcpb || true
if command -v mcpb &> /dev/null; then
  mcpb pack
else
  echo "mcpb not available, skipping bundle"
fi
```

Если `mcpb` недоступен, bundle не создаётся, но workflow завершается успешно. Это может быть неожиданным — release без `.mcpb` файла.

---

## 8. `package.json` (корневой)

### Замечания

#### СРЕДНЕЕ: `files` включает `.claude/`

```json
"files": [
  ".claude/",
  ...
]
```

Директория `.claude/` содержит `settings.json` с permissions и env-переменными. При npm publish эти настройки будут включены в пакет. Это может быть нежелательно — `settings.json` содержит конфигурацию, специфичную для разработки.

#### НИЗКОЕ: Отсутствует `"private": false`

Для npm-публикации рекомендуется явно указать `"private": false`.

---

## 9. `setup.sh`

### Замечания

#### НИЗКОЕ: Проверка MCP-сервера ненадёжна

```bash
if timeout 3 node "$BUNDLE" < /dev/null 2>/dev/null; then
  true
fi
echo -e "${GREEN}✓${NC} MCP-сервер работает"
```

MCP-сервер использует stdio transport и ожидает JSON-RPC на stdin. При `/dev/null` на stdin он завершится с ошибкой, но `if` проглатывает код возврата. Сообщение «MCP-сервер работает» выводится всегда.

---

## 10. `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "Read", "Write(*.md)", "Write(*.json)", "Write(*.csv)", "Write(*.docx)",
      "Skill",
      "mcp__teacher__fgos_lookup", ...
      "Bash(pandoc *)", "Bash(node *)"
    ],
    "deny": [
      "Bash(rm -rf *)", "Write(.env)"
    ]
  }
}
```

### Положительное

- Гранулярные permissions для Write (по расширениям)
- Deny для `rm -rf` и `.env`
- MCP-инструменты перечислены явно

### Замечание

#### НИЗКОЕ: `Bash(node *)` — слишком широкий доступ

Разрешает выполнение **любых** node-скриптов. Злоумышленный файл может быть запущен через `node malicious.js`. Рекомендуется ограничить до конкретных путей: `Bash(node mcp-server/*)`.

---

## 11. `.npmignore`

Не проверен детально, но `package.json` → `files` уже определяет whitelist, что делает `.npmignore` вторичным.

---

## 12. Общие рекомендации

### Перед публикацией на маркетплейс (блокирующие)

1. **Создать `.claude-plugin/plugin.json`** с правильной схемой (name, description, version, author)
2. **Исправить `source` в marketplace.json** с `"."` на `"./"`
3. **Исправить `createTable()` в export-docx.ts** — таблицы не попадают в DOCX
4. **Убрать нестандартные поля из plugin.json** или переименовать в кастомное пространство имён

### Рекомендуемые улучшения

5. Заменить `@path` ссылки в SKILL.md на Markdown-ссылки `[text](path)`
6. Добавить `disable-model-invocation: true` для утилитарных навыков (export-doc, import-template)
7. Вынести общие константы MCP-сервера в shared-модуль
8. Заменить `readFileSync` на async `readFile` в MCP-инструментах
9. Добавить тесты для export-docx и import-template
10. Сузить matcher для PostToolUse hook (только `.md` файлы)
11. Удалить или переделать бесполезный SessionStart echo-hook
12. Использовать `claude plugin validate .` для самопроверки перед коммитом

### Сильные стороны проекта

- Продуманная педагогическая модель с ФГОС, УУД, дифференциацией
- Отличная структуризация: правила, предметы, шаблоны, примеры
- Множество каналов дистрибуции (Plugin, npm, MCPB, git)
- Хорошее покрытие тестами для MCP-инструментов
- JSON Schema для валидации ФГОС-данных
- CI/CD pipeline с проверкой навыков
- Чёткий CONTRIBUTING.md с инструкциями по расширению

---

## Источники

- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude Code Plugins — Create](https://code.claude.com/docs/en/plugins)
- [Anthropic Skills Repository](https://github.com/anthropics/skills)
- [Agent Skills Specification](https://agentskills.io)
