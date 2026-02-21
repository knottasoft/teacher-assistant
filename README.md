# Учитель — AI-ассистент преподавателя

[![CI](https://github.com/knottasoft/teacher-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/knottasoft/teacher-assistant/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@knottasoft/teacher-assistant-mcp)](https://www.npmjs.com/package/@knottasoft/teacher-assistant-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Плагин для **Claude Code** — помощник преподавателя средней и старшей школы (5–11 классы).

Создаёт планы уроков, задания, проверяет работы учеников, формирует КТП, анализирует успеваемость. Все материалы соответствуют **ФГОС ООО** и **ФГОС СОО**.

**Предметы:** Русский язык · Математика · Физика · Литература

---

## Быстрый старт

### Вариант 1: Клонировать и запустить

```bash
git clone https://github.com/knottasoft/teacher-assistant.git
cd teacher-assistant
bash setup.sh
```

Откройте папку `teacher-assistant` в Claude Code — плагин подключится автоматически.

### Вариант 2: Подключить MCP-сервер глобально

```bash
# Через npx (после публикации на npm)
claude mcp add teacher -- npx @knottasoft/teacher-assistant-mcp

# Или из локальной сборки
claude mcp add teacher -- node /path/to/teacher-assistant/mcp-server/dist/index.js
```

### Вариант 3: npm install

```bash
npm install @knottasoft/teacher-assistant
```

---

## Команды (18 навыков)

### Основные

| Команда | Описание | Пример |
|---------|----------|--------|
| `/lesson-plan` | Создать план урока по ФГОС | `/lesson-plan математика 7 "Формулы сокращённого умножения"` |
| `/assignment` | Создать задание (тест, ДЗ, контрольная) | `/assignment физика 8 "Закон Ома" тест` |
| `/check-work` | Проверить работу ученика | `/check-work работа_ученика.md` |
| `/thematic-plan` | Календарно-тематическое планирование | `/thematic-plan русский 6 год` |
| `/fgos-check` | Проверить документ на соответствие ФГОС | `/fgos-check план_урока.md` |
| `/grade-report` | Анализ успеваемости класса | `/grade-report оценки_7б.csv` |
| `/export-doc` | Экспорт в DOCX | `/export-doc план_урока.md` |
| `/import-template` | Импорт шаблона школы | `/import-template шаблон_ктп.md thematic-plan` |

### Русский язык

| Команда | Описание | Пример |
|---------|----------|--------|
| `/dictation` | Создать текст диктанта | `/dictation 7 "Причастный оборот"` |
| `/grammar-exercise` | Упражнение по грамматике | `/grammar-exercise 6 "Разряды прилагательных"` |
| `/essay-evaluate` | Оценить сочинение ученика | `/essay-evaluate сочинение.txt` |

### Математика

| Команда | Описание | Пример |
|---------|----------|--------|
| `/math-problems` | Задачи с решениями | `/math-problems 8 "Квадратные уравнения" 10` |
| `/math-test` | Контрольная / тест | `/math-test 9 "Арифметическая прогрессия" 2` |
| `/math-check` | Проверить решение ученика | `/math-check решение.md` |

### Физика

| Команда | Описание | Пример |
|---------|----------|--------|
| `/physics-problems` | Задачи по физике | `/physics-problems 8 "Закон Ома" 8` |
| `/physics-lab` | Инструкция к лабораторной | `/physics-lab 7 "Измерение силы трения"` |

### Литература

| Команда | Описание | Пример |
|---------|----------|--------|
| `/literature-questions` | Вопросы к произведению | `/literature-questions 9 Грибоедов "Горе от ума"` |
| `/essay-topics` | Темы сочинений | `/essay-topics 10 "Война и мир"` |

---

## MCP-инструменты

Плагин предоставляет MCP-сервер с 5 инструментами и 2 типами ресурсов:

### Инструменты

| Инструмент | Описание |
|-----------|----------|
| `fgos_lookup` | Поиск по базе ФГОС: разделы, темы, планируемые результаты, УУД |
| `export_docx` | Конвертация Markdown → DOCX (Times New Roman 12pt, поля по ГОСТ) |
| `import_template` | Импорт и анализ пользовательского шаблона |
| `hours_calculator` | Расчёт учебных часов за период (четверть / полугодие / год) |
| `grade_analytics` | Анализ успеваемости: средний балл, качество, «группа риска» |

### Ресурсы

| URI | Описание |
|-----|----------|
| `fgos://{предмет}/{класс}` | Данные ФГОС по предмету и классу |
| `curriculum://{предмет}` | Обзор программы по предмету |

---

## Форматы вывода

- **Markdown** — основной формат, просмотр в Claude Code
- **DOCX** — экспорт через `/export-doc` (Times New Roman 12pt, поля: 3см лево / 1.5см право / 2см верх-низ)

## Импорт шаблонов

У каждой школы свои шаблоны. Загрузите их через `/import-template`:

```
/import-template шаблон_ктп_школа15.md thematic-plan
```

Типы: `lesson-plan`, `test`, `thematic-plan`, `report`, `assignment`, `lab-work`

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
├── plugin.json                     # Метаданные для маркетплейса
├── CLAUDE.md                       # Инструкции для Claude
├── setup.sh                        # Скрипт установки
├── .mcp.json                       # Конфигурация MCP-сервера
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
├── skills/                         # 18 навыков (slash-команд)
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
