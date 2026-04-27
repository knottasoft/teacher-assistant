---
name: lesson-plan
description: Use when teacher needs to prepare a lesson plan, lesson outline, lesson notes, methodical materials, or teaching notes for a school subject (русский язык, математика, физика, литература, 5-11 класс) — produces a ФГОС/ФОП-aligned plan with objectives, planned results (предметные/метапредметные/личностные), УУД, step-by-step lesson flow по этапам системно-деятельностного подхода (организация, мотивация, целеполагание, открытие нового знания, закрепление, рефлексия, ДЗ), differentiated tasks (базовый/повышенный/высокий) and homework. Triggers: «план урока», «конспект урока», «методичка к уроку», «подготовить урок», «материалы к уроку», «план занятия», «разработка урока», «технологическая карта урока». Use even when user only mentions one of these triggers in a multi-part request.
argument-hint: "[предмет] [класс] [тема]"
allowed-tools: Read, Write, mcp__teacher__fgos_lookup, mcp__teacher__export_docx
---

# Создание плана урока

Создай полный план урока для:
- **Предмет:** $ARGUMENTS[0]
- **Класс:** $ARGUMENTS[1]
- **Тема:** $ARGUMENTS[2]

## Инструкции

1. Используй инструмент `fgos_lookup` для получения требований ФГОС по данной теме и классу
2. Определи тип урока: изучение нового материала / закрепление / контроль / комбинированный / урок-практикум
3. Сформулируй:
   - Цели (обучающая, развивающая, воспитательная)
   - Планируемые результаты (предметные, метапредметные, личностные)
4. Составь ход урока по этапам системно-деятельностного подхода (см. шаблон [templates/standard.md](templates/standard.md))
5. Для каждого этапа укажи: время, деятельность учителя, деятельность учеников
6. Включи дифференцированные задания (базовый/повышенный уровень)
7. Добавь домашнее задание (обязательное + по выбору)
8. Сохрани план в файл `урок_[предмет]_[класс]_[тема].md`
9. Предложи экспорт в DOCX через `/export-doc`

Если предмет или тема не указаны, спроси у пользователя.

Примеры планов: [examples/](examples/)
Шаблон ФГОС: [templates/fgos-template.md](templates/fgos-template.md)
Шаблон открытого урока: [templates/open-lesson.md](templates/open-lesson.md)
