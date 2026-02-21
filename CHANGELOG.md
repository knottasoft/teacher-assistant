# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-21

### Added

- 18 slash-commands for 4 subjects (Russian, Math, Physics, Literature)
- MCP server with 5 tools:
  - `fgos_lookup` — FGOS curriculum database search
  - `export_docx` — Markdown to DOCX conversion
  - `import_template` — custom template import
  - `hours_calculator` — academic hours calculation
  - `grade_analytics` — grade statistics and analysis
- MCP resources: `fgos://` and `curriculum://` URI schemes
- FGOS database covering grades 5-11 (3,400+ lines of curriculum data)
- Pedagogical rules: approach, document formatting, FGOS compliance
- Subject-specific rules: Russian, Math, Physics, Literature
- Lesson plan templates: standard, FGOS-aligned, open lesson
- Assignment templates: test, homework, control work
- OGE/EGE rubrics and criteria
- Hooks: SessionStart metadata, PostToolUse FGOS validation
- Setup script for one-command installation
- CI/CD pipeline with GitHub Actions
- Comprehensive test suite for MCP tools

[1.0.0]: https://github.com/knottasoft/teacher-assistant/releases/tag/v1.0.0
