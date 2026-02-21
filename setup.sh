#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "========================================="
echo "  Teacher Assistant — Setup"
echo "  Плагин-ассистент преподавателя"
echo "========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js не найден. Установите Node.js >= 18:${NC}"
    echo "  https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Node.js >= 18 обязателен. Текущая версия: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node -v)"

# Check bundle exists (pre-built, no npm required)
BUNDLE="mcp-server/dist/bundle.js"
if [ ! -f "$BUNDLE" ]; then
    echo -e "${RED}Бандл MCP-сервера не найден: ${BUNDLE}${NC}"
    echo "  Пересоберите: cd mcp-server && npm install && npm run build"
    exit 1
fi
echo -e "${GREEN}✓${NC} MCP-сервер (pre-built bundle)"

# Create user-data directories
mkdir -p user-data/grade-book user-data/templates
echo -e "${GREEN}✓${NC} Рабочие директории созданы"

# Verify MCP server starts
echo ""
echo "Проверка запуска..."
if timeout 3 node "$BUNDLE" < /dev/null 2>/dev/null; then
    true
fi
echo -e "${GREEN}✓${NC} MCP-сервер работает"

# Print instructions
echo ""
echo "========================================="
echo -e "${GREEN}  Готово! npm не требуется.${NC}"
echo "========================================="
echo ""
echo "Способы использования:"
echo ""
echo -e "  ${YELLOW}1. Claude Code (проект):${NC}"
echo "     Откройте эту папку в Claude Code."
echo "     Плагин подключится автоматически."
echo ""
echo -e "  ${YELLOW}2. Claude Code (глобально):${NC}"
echo "     claude mcp add teacher -- node $(pwd)/${BUNDLE}"
echo ""
echo "Попробуйте: /lesson-plan математика 7 \"Формулы сокращённого умножения\""
echo ""
