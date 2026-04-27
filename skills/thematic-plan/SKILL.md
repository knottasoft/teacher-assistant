---
name: thematic-plan
description: Use when a teacher needs a calendar-thematic plan (КТП, тематическое планирование) for a subject and period. Outputs таблицу с распределением часов, темами уроков, видами контроля, привязкой к ФГОС/ФОП.
argument-hint: "[предмет] [класс] [период: четверть|полугодие|год]"
allowed-tools: Read, Write, Skill, mcp__plugin_teacher-assistant_teacher__fgos_lookup, mcp__plugin_teacher-assistant_teacher__hours_calculator
---

# Календарно-тематическое планирование

Составь КТП:
- **Предмет:** $ARGUMENTS[0]
- **Класс:** $ARGUMENTS[1]
- **Период:** $ARGUMENTS[2] (четверть / полугодие / год)

## Инструкции

1. Используй `fgos_lookup` для получения содержания программы по предмету и классу
2. Используй `hours_calculator` для расчёта часов за период
3. Распредели темы по урокам в хронологическом порядке
4. Для каждого урока укажи:
   - № урока (сквозная нумерация)
   - Тема урока
   - Количество часов
   - Тип урока
   - Планируемые результаты (кратко)
   - Виды контроля
   - Дата (план)
   - Примечания
5. Включи контрольные работы равномерно (не подряд)
6. Выдели уроки повторения и обобщения
7. Сохрани в табличном формате в файл `ктп_[предмет]_[класс]_[период].md`
8. Если учитель попросит DOCX — вызывай встроенный `anthropic-skills:docx` с параметрами ГОСТ из [.claude/rules/document-formatting.md](../../.claude/rules/document-formatting.md)

Шаблоны: [templates/](templates/)
Распределение часов: [hours-distribution.md](hours-distribution.md)
