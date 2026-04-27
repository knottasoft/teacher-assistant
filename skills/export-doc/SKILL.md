---
name: export-doc
description: Use this skill ONLY when user explicitly asks to export a Markdown teaching document to DOCX for printing or upload to school systems. Side-effect skill: don't auto-invoke as part of natural-language requests.
argument-hint: "[путь к .md файлу]"
allowed-tools: Read, mcp__teacher__export_docx
disable-model-invocation: true
---

# Экспорт в DOCX

Экспортируй файл в DOCX: $ARGUMENTS

## Инструкции

1. Прочитай указанный Markdown-файл
2. Определи тип документа:
   - План урока
   - Тест / контрольная работа
   - Календарно-тематическое планирование
   - Отчёт об успеваемости
   - Другое
3. Проверь, есть ли пользовательский шаблон в `user-data/templates/` для данного типа
4. Используй инструмент `export_docx` с параметрами:
   - `input_path` — путь к .md файлу
   - `output_path` — путь для .docx (по умолчанию рядом с исходным)
   - `template` — тип шаблона (если есть)
5. Сообщи путь к созданному DOCX файлу и его размер
