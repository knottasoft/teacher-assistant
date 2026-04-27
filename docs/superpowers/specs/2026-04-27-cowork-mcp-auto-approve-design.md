# Design: Cowork MCP Auto-Approve via PreToolUse Hook

**Дата:** 2026-04-27
**Автор:** Artem (knottasoft)
**Статус:** approved-for-planning
**Связанные артефакты:**
- `.claude-plugin/plugin.json`
- `.mcp.json`
- `hooks/hooks.json`
- `hooks/check-teaching-doc.mjs` (существующий, не трогаем)
- `.claude/settings.json` (плагин-репо, не публикуется к пользователю)

## 1. Проблема

В Claude Cowork (вкладка local-agent-mode в Claude Desktop) при попытке вызова любого из пяти инструментов MCP-сервера `teacher` (`fgos_lookup`, `grade_analytics`, `hours_calculator`, `export_docx`, `import_template`) возвращается `"User rejected using"` **без показа permission-диалога**. Skill `lesson-plan` graceful-fallback'ит на статические правила в `.claude/rules/fgos-compliance.md`, но точные формулировки ФРП теряются — а это критично для соответствия ФГОС/ФОП.

Известные баги Cowork (anthropics/claude-code #28580, #24433, #42453) ломают ровно тот шаг permission-флоу, на который мы сейчас полагаемся.

## 2. Цель

Сделать так, чтобы любой пользователь, установивший плагин через marketplace (`/plugin install teacher-assistant@knottasoft-education`), получал работающие MCP-tools плагина в Cowork **без ручных правок** `~/.claude.json`, без `/permissions` диалогов и без какой-либо постустановочной настройки.

Сценарий приоритетов: **Cowork-first**. Claude Code CLI должен продолжить работать без регрессий, но это бонус, а не главная цель.

## 3. Не-цели

- Решать общий баг Cowork — это не наша территория.
- Авто-апрувить какие-либо инструменты вне MCP-сервера `teacher` (Bash, Edit, посторонние MCP — без изменений).
- Менять список инструментов или их интерфейсы.
- Трогать архитектуру MCP-сервера, native deps, индексацию ФРП (это PR #4 — отдельная задача).

## 4. Решение (overview)

Добавить в плагин **PreToolUse-хук**, который перехватывает любые вызовы инструментов нашего MCP-сервера и возвращает официально-документированный permission-grant:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "teacher-assistant plugin pre-approves its own MCP tools"
  }
}
```

Хук работает раньше permission-диалога Cowork и пре-эмптит сломанный шаг. Это поддерживается официальной документацией Claude Code (`code.claude.com/docs/en/hooks`) — это рекомендованный механизм для plugin-controlled авто-разрешений.

## 5. Изменения в коде

### 5.1. Новый файл: `hooks/auto-approve-teacher-mcp.mjs`

Минимальный node-скрипт без зависимостей. Читает stdin, парсит JSON, проверяет `tool_name` совпадает с каноничным префиксом нашего plugin-MCP-сервера, эмитит JSON-grant и выходит с кодом 0. На любой ошибке парсинга или несовпадение — выходит с кодом 0 без stdout (это означает «нет мнения», диалог идёт штатно).

**Каноничный префикс:** `mcp__plugin_teacher-assistant_teacher__`

Источник: официальная документация Claude Code (`plugins/plugin-dev/skills/mcp-integration/SKILL.md` в `anthropics/claude-code`):

> MCP tools follow a standardized naming convention: `mcp__plugin_<plugin-name>_<server-name>__<tool-name>`.

Для нас:
- `<plugin-name>` = `teacher-assistant` (из `.claude-plugin/plugin.json` → `name`)
- `<server-name>` = `teacher` (из `mcp-server/src/index.ts:14` → `name: "teacher"` в `new McpServer({...})`)
- `<tool-name>` ∈ {`fgos_lookup`, `grade_analytics`, `hours_calculator`, `export_docx`, `import_template`} (из `server.tool(...)` вызовов)

Полные имена пяти инструментов:
- `mcp__plugin_teacher-assistant_teacher__fgos_lookup`
- `mcp__plugin_teacher-assistant_teacher__grade_analytics`
- `mcp__plugin_teacher-assistant_teacher__hours_calculator`
- `mcp__plugin_teacher-assistant_teacher__export_docx`
- `mcp__plugin_teacher-assistant_teacher__import_template`

Подтверждено независимыми источниками:
- В `vm_bundles/claudevm.bundle/sessiondata.img` Cowork встречается **только** эта форма (grep).
- В Cowork UI инструменты группируются под карточкой "teacher-assistant plugin: teacher" с короткими именами (`fgos_lookup` и т.д.) — внутреннее же permission-имя — длинное.

Альтернативный путь установки `claude mcp add teacher -- ...` (документирован в README) даёт другую форму (`mcp__teacher__*`), но это user-MCP, не plugin-MCP, и под этот хук он не подпадает по дизайну: пользователь, явно регистрирующий MCP-сервер через CLI, сам отвечает за permissions через `claude mcp add ... --scope`. Hook-уровень auto-approve работает строго для plugin-install сценария.

**Контракт:**
- Вход: stdin — JSON события PreToolUse (поля как минимум `tool_name`, `tool_input`).
- Выход (allow): stdout — JSON c `hookSpecificOutput.permissionDecision: "allow"`.
- Выход (no-op): пустой stdout, exit 0.
- Никогда не блокирует, никогда не падает.

**Что хук НЕ делает:**
- Не модифицирует `tool_input` (`updatedInput` не используется).
- Не пишет на диск, не зовёт сеть, не логирует ничего постоянного. Stderr допустим только для отладки (по env-переменной `TEACHER_HOOK_DEBUG`).
- Не пытается авто-апрувить что-либо, чьё имя не начинается ровно с указанного префикса. Сравнение через `startsWith` с трейлинг `__`, поэтому, например, `mcp__plugin_teacher-assistant_teacher_other__foo` (близкое имя другого сервера в том же плагине, гипотетически) **не** совпадёт.

### 5.2. Регистрация в `hooks/hooks.json`

Добавить новую запись `PreToolUse` рядом с существующими `SessionStart` и `PostToolUse`:

```json
{
  "hooks": {
    "SessionStart": [/* существующий */],
    "PreToolUse": [
      {
        "matcher": "mcp__plugin_teacher-assistant_teacher__.*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/auto-approve-teacher-mcp.mjs\""
          }
        ]
      }
    ],
    "PostToolUse": [/* существующий, без изменений */]
  }
}
```

Матчер — первый фильтр от Claude Code (regex по `tool_name`). Хук всё равно проверяет префикс сам как defense-in-depth, на случай неточностей в матчере между версиями.

### 5.3. Удалить дубль `.mcp.json`

`.mcp.json` в корне плагина дублирует `mcpServers` из `plugin.json`. По документации это два разных способа объявить MCP-сервер, и держать оба сразу — приглашение к рассинхрону. Оставляем `mcpServers` в `plugin.json` (он уже корректный, с `${CLAUDE_PLUGIN_ROOT}`), `.mcp.json` удаляем.

### 5.4. Очистка `.claude/settings.json` от мёртвой MCP allow-секции

Текущий `.claude/settings.json` содержит `permissions.allow` со всеми пятью `mcp__teacher__*`. Это срабатывает только когда **я** работаю в репо плагина как в проекте — у установившего пользователя этого файла не существует. Чтобы не вводить будущих контрибьюторов в заблуждение:

- Удалить записи `mcp__teacher__*` из `.claude/settings.json` (закоммичен, виден в публичном репо). Они не несут пользы за пределами моей дев-машины.
- В уже существующий `.claude/settings.local.json` (gitignored, локальный) **слить** эти записи с теми Bash-allow-rules, что там уже лежат — не перезаписывать, а добавить к массиву `permissions.allow`. Это нужно, чтобы я сам в репо мог продолжать пользоваться MCP-tools без лишних диалогов в обычном Claude Code (Cowork-фикс через хук — отдельный механизм).
- В `.claude/settings.json` оставить остальные осмысленные «дефолты репо» (Read, Write-для-документации, Skill, Bash для pandoc/node) и `env` (`TEACHER_PLUGIN_VERSION`, `DEFAULT_GRADE_SYSTEM`).
- Добавить пояснение в README или CONTRIBUTING (один абзац), почему allow-секции в plugin-bundled `.claude/settings.json` не путешествуют с плагином — чтобы будущий контрибьютор не попытался «починить» через неё.

### 5.5. Bump версии

`plugin.json`: `"version": "1.0.0" → "1.0.1"`. Это нужно, чтобы у пользователей с уже установленным плагином `/plugin update` подтянул изменения. Без bump-а Claude Code считает, что плагин не менялся, и кэш не обновится.

`.claude-plugin/marketplace.json` (`plugins[0].version`): синхронно `1.0.0 → 1.0.1`.

### 5.6. README — секция «Permissions and trust»

Короткий блок в README.md, объясняющий пользователю:
- Что плагин содержит локальный MCP-сервер с пятью инструментами (с перечислением).
- Что плагин включает PreToolUse-хук, который авто-апрувит вызовы **только своих собственных инструментов** `mcp__teacher__*`, без диалогов.
- Что любые посторонние инструменты, Bash, Edit, Write — продолжают идти через стандартный permission-флоу.
- Что причина — устранить трение в Cowork, где plugin-MCP permission-флоу нестабилен.

Это требование Anthropic к plugin-trust transparency (см. `support.claude.com/articles/13837440`).

## 6. Тестирование

### 6.1. Юнит-тесты хука

Новый файл `mcp-server/src/__tests__/hooks/auto-approve.test.ts`. Существующий vitest-конфиг в `mcp-server/vitest.config.ts` уже подхватит его. Тест запускает сам скрипт `${REPO_ROOT}/hooks/auto-approve-teacher-mcp.mjs` через `child_process.spawnSync('node', [scriptPath], { input: jsonStdin })` — так мы валидируем реальный CLI-контракт хука, а не только его внутреннюю функцию. Путь к скрипту резолвится через `path.resolve(__dirname, '../../../../hooks/auto-approve-teacher-mcp.mjs')`. Это сохраняет тестовую инфраструктуру в одном месте (`mcp-server/`), хотя сам хук физически живёт в `hooks/` плагина — таково требование plugin-структуры.

Кейсы (минимум):
1. `tool_name = "mcp__plugin_teacher-assistant_teacher__fgos_lookup"` → stdout содержит `permissionDecision: "allow"`, exit 0.
2. `tool_name = "mcp__plugin_teacher-assistant_teacher__grade_analytics"` → allow.
3. `tool_name = "mcp__plugin_teacher-assistant_teacher__export_docx"` → allow.
4. `tool_name = "Bash"` → пустой stdout, exit 0.
5. `tool_name = "mcp__plugin_other-plugin_other__tool"` → пустой stdout, exit 0.
6. `tool_name = "mcp__teacher__fgos_lookup"` (короткая форма user-MCP `claude mcp add` — НЕ наш plugin-install) → пустой stdout, exit 0. Это by design: user-MCP проходит через стандартный flow.
7. Невалидный JSON на stdin → пустой stdout, exit 0 (не падаем).
8. Пустой stdin → пустой stdout, exit 0.

### 6.2. Smoke-тест в Claude Code CLI

Локально из репо плагина:
1. `claude --debug` → проверить, что хук зарегистрировался (видно в логе `loading plugin`).
2. Тригернуть skill `lesson-plan` с темой ФРП-уровня → убедиться, что `mcp__teacher__fgos_lookup` отрабатывает без диалога.
3. Тригернуть Bash → убедиться, что обычный permission-флоу не нарушен.

### 6.3. Smoke-тест в Cowork

Установить плагин из локального чекаута через `/plugin marketplace add` и `/plugin install`. Прогнать сценарий «план урока «Капитанская дочка», 8 класс, раздатка, квиз». Зафиксировать результат: ушло ли «User rejected», получили ли мы точные формулировки ФРП.

Если в Cowork хук не сработает — это уже сигнал к варианту C (гибрид с fallback'ом в skill-ах), но это **не блокирует мерджа** этого PR: в худшем случае поведение остаётся таким же, как сейчас (graceful fallback на правила).

### 6.4. CI

Добавить запуск нового тест-файла в существующий vitest-прогон. CI-rule с проверкой descriptions не затрагивается.

## 7. Безопасность и blast radius

- Хук авто-апрувит исключительно `mcp__teacher__*`. Регистрационный матчер + повторная проверка в самом скрипте.
- Никаких других классов инструментов — ни Bash, ни WebFetch, ни Edit/Write, ни посторонних MCP.
- MCP-сервер `teacher` — локальный stdio-процесс самого плагина, его инструменты не выходят в сеть и работают с фикстурами/локальными файлами в `user-data/`. Path-whitelist для записи учебных документов сохраняется через существующий `check-teaching-doc.mjs`.
- Пользователь, устанавливающий плагин, явно соглашается с plugin-trust диалогом Claude Code на этапе install (это не наша ответственность, но мы прозрачно раскрываем поведение в README — см. 5.6).
- Откат тривиальный: удалить запись `PreToolUse` из `hooks/hooks.json`, удалить файл хука. MCP-сервер вернётся к стандартному permission-флоу.

## 8. Риски и план Б

**Риск 1:** Cowork игнорирует PreToolUse-хуки или применяет их не до permission-диалога.
- **Вероятность:** низкая. Документация явно описывает порядок «PreToolUse → permission rules → диалог». Хуки — это базовая функциональность плагина, и в Cowork issues не упоминается, что хуки сломаны.
- **Митигация:** smoke-тест в Cowork (6.3). Если регрессия — апгрейд до варианта C: добавить fallback-ветку в skill `lesson-plan` (читать `.claude/rules/fgos/<class>-<subject>.md` напрямую). Это +30-50 строк в один skill, не блокирующая работа.

**Риск 2:** Хук должен быть исполняемым; на Windows проблем с node-shebang быть не должно (мы зовём `node ...` явно), но `chmod +x` не нужен.

**Риск 3:** Версия плагина пользователя не обновится.
- **Митигация:** bump `version` в обоих манифестах (5.5). Описано в README.

**Риск 4:** Будущий контрибьютор подумает, что allow-секция в `.claude/settings.json` плагина что-то делает для пользователей, и попытается «починить» через неё.
- **Митигация:** `_comment` поле в `.claude/settings.json` (5.4) явно объясняет, что эта секция ровно для разработки в репо.

## 9. Критерии приёмки

- В Cowork сценарий «план урока «Капитанская дочка», 8 класс» проходит без ошибок «User rejected», `fgos_lookup` (под именем `mcp__plugin_teacher-assistant_teacher__fgos_lookup` — длинная форма, подтверждено grep'ом по Cowork sessiondata) отрабатывает, в plan присутствуют точные формулировки УУД из ФРП-2025.
- В Claude Code CLI ничего не сломано: skills работают, остальные хуки работают, тесты зелёные.
- Юнит-тесты хука зелёные (минимум 8 кейсов из 6.1).
- README содержит секцию «Permissions and trust» с явным перечислением, что авто-апрувится.
- Версия плагина в обоих манифестах — `1.0.1`.
- В репо нет файла `.mcp.json` (удалён, конфиг живёт в `plugin.json`).
- Все остальные 4 MCP-инструмента (`grade_analytics`, `hours_calculator`, `export_docx`, `import_template`) тоже отрабатывают без диалогов в Cowork (один и тот же матчер их покрывает).

## 10. Открытые вопросы

Нет на момент написания спека. Если в ходе плана/реализации появятся — апдейтим этот раздел.
