---
name: import-template
description: Use ONLY when the user EXPLICITLY asks to import a custom document template (шаблон плана урока, шаблон отчёта, шаблон КТП) — to be used by other skills as the preferred output format for that document type. Side-effect skill: do NOT auto-invoke as part of natural-language requests; do NOT activate as a sub-deliverable in compound prompts. Activate ONLY on explicit triggers like «импортируй шаблон», «загрузи шаблон», «использовать шаблон школы», «принять шаблон», «import template», «save this as my template». For everything else stay silent.
argument-hint: "[путь к шаблону] [тип: план|тест|ктп|отчёт]"
allowed-tools: Read, Write, mcp__plugin_teacher-assistant_teacher__import_template
disable-model-invocation: true
---

# Импорт шаблона

Импортируй шаблон:
- **Файл:** $ARGUMENTS[0]
- **Тип документа:** $ARGUMENTS[1]

## Инструкции

1. Прочитай файл шаблона
2. Если тип не указан — определи автоматически или спроси
3. Используй инструмент `import_template` с параметрами:
   - `template_path` — путь к файлу
   - `doc_type` — тип: lesson-plan / test / thematic-plan / report / assignment / lab-work
4. Покажи пользователю распознанную структуру шаблона
5. Подтверди: «Шаблон сохранён. Он будет использоваться при генерации документов типа [тип].»

## Поддерживаемые форматы
- Markdown (.md) — предпочтительно
- Текстовый файл (.txt)

## Типы шаблонов
- `lesson-plan` — план урока
- `test` — тест/контрольная
- `thematic-plan` — КТП
- `report` — отчёт
- `assignment` — задание (дз/классная)
- `lab-work` — лабораторная работа
