# Учитель — AI-ассистент преподавателя

[![CI](https://github.com/knottasoft/teacher-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/knottasoft/teacher-assistant/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@knottasoft/teacher-assistant-mcp)](https://www.npmjs.com/package/@knottasoft/teacher-assistant-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Плагин для **Claude Code** — помощник преподавателя литературы средней и старшей школы (5–11 классы).

Создаёт планы уроков, задания, проверяет работы учеников и сочинения, формирует КТП, анализирует успеваемость. Все материалы соответствуют **ФГОС ООО**, **ФГОС СОО** и ФОП.

**Предмет:** Литература

---

## Установка

### Claude Code — плагин (рекомендуется)

```bash
# Установить как плагин Claude Code
claude plugin install https://github.com/knottasoft/teacher-assistant.git
```

Или клонировать и открыть в Claude Code (**npm не требуется**, бандл pre-built):

```bash
git clone https://github.com/knottasoft/teacher-assistant.git
cd teacher-assistant
bash setup.sh   # проверяет только наличие Node.js >= 18
```

### Claude Code — только MCP-сервер

```bash
# Через npx
claude mcp add teacher -- npx @knottasoft/teacher-assistant-mcp

# Или из локальной сборки
claude mcp add teacher -- node /path/to/teacher-assistant/mcp-server/dist/index.js
```

### Claude Desktop — MCPB (one-click)

Скачайте `.mcpb`-файл из [Releases](https://github.com/knottasoft/teacher-assistant/releases) и откройте в Claude Desktop.

### npm

```bash
npm install @knottasoft/teacher-assistant
```

### Каналы дистрибуции

| Канал | Формат | Аудитория |
|-------|--------|-----------|
| Claude Code Plugin | `.claude-plugin/plugin.json` | Разработчики с Claude Code |
| MCP Registry | `server.json` | Любые MCP-клиенты |
| MCPB Bundle | `manifest.json` → `.mcpb` | Claude Desktop |
| npm | `@knottasoft/teacher-assistant-mcp` | Node.js / npx |
| Git | `git clone` + `setup.sh` | Ручная установка |

---

## Разрешения и доверие

Плагин содержит локальный MCP-сервер `teacher` с четырьмя инструментами. При установке через Claude Code / Cowork их каноничные имена (по схеме `mcp__plugin_<plugin>_<server>__<tool>`):

- `mcp__plugin_teacher-assistant_teacher__fgos_lookup` — поиск формулировок ФГОС/ФОП/ФРП
- `mcp__plugin_teacher-assistant_teacher__grade_analytics` — анализ оценок (CSV/XLSX, в т.ч. cp1251)
- `mcp__plugin_teacher-assistant_teacher__hours_calculator` — расчёт учебных часов
- `mcp__plugin_teacher-assistant_teacher__import_template` — импорт пользовательских шаблонов

DOCX-экспорт выполняется встроенным навыком `anthropic-skills:docx` — наш плагин им только пользуется, ничего не дублируя.

Чтобы инструменты работали без диалогов разрешений (особенно в Claude Cowork, где штатный permission-флоу для plugin-MCP нестабилен), плагин включает **PreToolUse-хук** `hooks/auto-approve-teacher-mcp.mjs`. Хук авто-апрувит **только** вызовы своих собственных четырёх инструментов и ничего больше.

**Что плагин НЕ делает автоматически:**

- Не авто-апрувит Bash, Edit, Write, Read и любые другие встроенные инструменты Claude Code.
- Не авто-апрувит инструменты других MCP-серверов или других плагинов.
- Не авто-апрувит инструменты этого же сервера, установленного **не как плагин** (например, через `claude mcp add teacher -- ...` — там имена короткие, `mcp__teacher__*`, и пользователь сам управляет permissions через CLI).
- Не пишет на диск вне `user-data/` (path-whitelist обеспечивается отдельным хуком `check-teaching-doc.mjs`).
- Не выходит в сеть из MCP-сервера.

Установив плагин, вы соглашаетесь именно с этим поведением. Чтобы откатить — отключите плагин через `/plugin disable` или удалите запись `PreToolUse` из `hooks/hooks.json`.

> **Для контрибьюторов:** `permissions.allow` в плагин-bundled `.claude/settings.json` **не путешествует** с плагином к установившим — это особенность Claude Code (project-scope settings применяются только при работе из этого репо как из проекта). Только запись плагина в `~/.claude/settings.json` пользователя, managed-settings, или хук-уровень auto-approve реально работают для дистрибуции. Не пытайтесь «починить» permission через `.claude/settings.json` плагина.

---

## Команды (10 навыков)

### Основные

| Команда | Описание | Пример |
|---------|----------|--------|
| `/lesson-plan` | Создать план урока по ФГОС | `/lesson-plan литература 8 "Капитанская дочка"` |
| `/assignment` | Создать задание (тест, ДЗ, контрольная, раздатка, квиз) | `/assignment литература 9 "Горе от ума" тест` |
| `/check-work` | Проверить работу ученика | `/check-work работа_ученика.md` |
| `/thematic-plan` | Календарно-тематическое планирование (КТП) | `/thematic-plan литература 8 год` |
| `/fgos-check` | Проверить документ на соответствие ФГОС/ФОП/ФРП | `/fgos-check рабочая_программа.md` |
| `/grade-report` | Анализ успеваемости класса | `/grade-report оценки_8б.csv` |
| `/import-template` | Импорт пользовательского шаблона | `/import-template шаблон_ктп.md thematic-plan` |
| `/validate-teaching-document` | Самопроверка учебного документа перед сохранением | (вызывается автоматически другими skills) |

### Литература

| Команда | Описание | Пример |
|---------|----------|--------|
| `/literature-questions` | Вопросы к произведению | `/literature-questions 9 Грибоедов "Горе от ума"` |
| `/essay-topics` | Темы сочинений и направления итогового сочинения | `/essay-topics 10 "Война и мир"` |
| `/essay-evaluate` | Оценка школьного сочинения, ОГЭ 9.1/9.2/9.3, итогового и ЕГЭ-27 | `/essay-evaluate сочинение.txt` |

---

## MCP-инструменты

Плагин предоставляет MCP-сервер с 4 инструментами и 2 типами ресурсов:

### Инструменты

| Инструмент | Описание |
|-----------|----------|
| `fgos_lookup` | Поиск по базе ФГОС: разделы, темы, планируемые результаты, УУД |
| `import_template` | Импорт и анализ пользовательского шаблона |
| `hours_calculator` | Расчёт учебных часов за период (четверть / полугодие / год) |
| `grade_analytics` | Анализ успеваемости: средний балл, качество, «группа риска» |

DOCX-экспорт делегирован встроенному `anthropic-skills:docx` — параметры ГОСТ берутся из [.claude/rules/document-formatting.md](.claude/rules/document-formatting.md).

### Ресурсы

| URI | Описание |
|-----|----------|
| `fgos://literature/{класс}` | Данные ФГОС по литературе для 5–11 класса |
| `curriculum://literature` | Обзор программы по литературе |

---

## Форматы вывода

- **Markdown** — основной формат, просмотр в Claude Code
- **DOCX** — экспорт через встроенный `anthropic-skills:docx` с ГОСТ-параметрами (Times New Roman 12pt, поля: 3см лево / 1.5см право / 2см верх-низ). Полный список параметров — в [.claude/rules/document-formatting.md](.claude/rules/document-formatting.md)

## Импорт шаблонов

У каждой школы свои шаблоны. Загрузите их через `/import-template`:

```
/import-template шаблон_ктп_школа15.md thematic-plan
```

Типы: `lesson-plan`, `test`, `thematic-plan`, `report`, `assignment`

Шаблоны сохраняются в `user-data/templates/` и автоматически используются при генерации.

## Система оценивания

| Оценка | % выполнения | Описание |
|--------|-------------|----------|
| 5 (отлично) | 90–100% | Без ошибок |
| 4 (хорошо) | 70–89% | Незначительные ошибки |
| 3 (удовлетворительно) | 50–69% | Обязательная часть |
| 2 (неудовлетворительно) | < 50% | Базовый уровень не освоен |

## Дифференциация заданий

- **Базовый уровень** — 60% заданий (обязательный минимум)
- **Повышенный уровень** — 30% заданий (углублённое изучение)
- **Высокий уровень** — 10% заданий (олимпиадный / исследовательский)

---

## Структура проекта

```
teacher-assistant/
├── package.json                    # npm-пакет (корневой)
├── plugin.json                     # Метаданные плагина
├── server.json                     # Official MCP Registry
├── manifest.json                   # MCPB (Claude Desktop)
├── CLAUDE.md                       # Инструкции для Claude
├── setup.sh                        # Скрипт установки
├── .mcp.json                       # Конфигурация MCP-сервера
├── .claude-plugin/
│   └── plugin.json                 # Claude Code Plugin manifest
├── .claude/
│   ├── settings.json               # Настройки и права
│   └── rules/                      # Педагогические правила
│       ├── pedagogical-approach.md
│       ├── fgos-compliance.md
│       ├── document-formatting.md
│       └── subjects/               # Предметные правила
├── mcp-server/                     # MCP-сервер (TypeScript)
│   ├── package.json
│   ├── src/
│   │   ├── index.ts                # Точка входа
│   │   ├── tools/                  # 5 инструментов + тесты
│   │   ├── resources/              # Провайдеры ресурсов
│   │   └── data/fgos/              # Данные ФГОС (JSON)
│   └── vitest.config.ts
├── skills/                         # 10 навыков (slash-команд)
├── hooks/                          # Хуки жизненного цикла
├── schemas/                        # JSON Schema для ФГОС-данных
├── scripts/                        # Скрипты валидации
└── .github/workflows/              # CI/CD
    ├── ci.yml                      # Тесты + проверки
    └── publish.yml                 # Публикация на npm
```

## Разработка

```bash
# Установка
cd mcp-server && npm install

# Сборка
npm run build

# Тесты
npm test

# Проверка типов
npm run typecheck

# Валидация ФГОС-данных
cd .. && node scripts/validate-fgos.mjs
```

## Добавление предметов

Плагин расширяемый. Для добавления нового предмета:

1. Создайте `mcp-server/src/data/fgos/<subject>.json` по схеме `schemas/fgos.schema.json`
2. Зарегистрируйте предмет в MCP-сервере
3. Добавьте правила в `.claude/rules/subjects/`
4. Создайте навыки в `skills/`

Подробнее: [CONTRIBUTING.md](CONTRIBUTING.md)

## Лицензия

[MIT](LICENSE)
