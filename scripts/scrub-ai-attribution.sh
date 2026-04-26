#!/usr/bin/env bash
# Удаляет AI-атрибуцию (Co-Authored-By: Claude*, "Generated with Claude Code", 🤖)
# из всех commit messages в текущей ветке/репозитории.
#
# ВАЖНО: переписывает историю → нужен force-push.
# После запуска: git push --force-with-lease origin main
#
# Зависимости: git ≥ 2.24 (env-filter не нужен, используем filter-branch с msg-filter)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Backup tag ==="
BACKUP_TAG="backup-before-scrub-$(date +%Y%m%d-%H%M%S)"
git tag "$BACKUP_TAG"
echo "Создан backup-тэг: $BACKUP_TAG"
echo "Откатить можно: git reset --hard $BACKUP_TAG"
echo

echo "=== Поиск коммитов с AI-атрибуцией ==="
git log --all --format='%H %s' | while read -r sha subject; do
  msg=$(git log -1 --format='%B' "$sha")
  if echo "$msg" | grep -qiE 'co-authored-by:.*(claude|anthropic)|generated with.*claude|🤖|claude\.com/claude-code|anthropic\.com'; then
    echo "  $sha  $subject"
  fi
done
echo

echo "=== Переписывание сообщений ==="
echo "Ctrl+C в течение 5 секунд чтобы отменить..."
sleep 5

# Используем filter-branch с msg-filter (доступно везде).
# WARNING подавляем — мы знаем, что делаем.
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter '
  # Убираем строки с Co-Authored-By: Claude*
  # Убираем строки с "Generated with Claude Code"
  # Убираем строки с эмодзи 🤖
  # Убираем строки со ссылками на claude.com/claude-code или anthropic.com
  # Убираем пустые строки в конце сообщения, которые могли остаться
  sed -E \
    -e "/^[[:space:]]*Co-[Aa]uthored-[Bb]y:.*([Cc]laude|[Aa]nthropic|noreply@anthropic).*$/d" \
    -e "/^[[:space:]]*🤖.*[Gg]enerated with.*[Cc]laude.*$/d" \
    -e "/^[[:space:]]*[Gg]enerated with.*[Cc]laude [Cc]ode.*$/d" \
    -e "/claude\.com\/claude-code/d" \
    -e "/anthropic\.com/Id" \
  | awk "
    BEGIN { blank = 0 }
    /^$/ { blank++; next }
    {
      while (blank-- > 0) print \"\"
      blank = 0
      print
    }
  "
' --tag-name-filter cat -- --all

echo
echo "=== Готово ==="
echo "Проверьте: git log --oneline --all | head -20"
echo "Если всё ок, выполните force-push:"
echo "  git push --force-with-lease origin main"
echo "  git push --force-with-lease origin audit/frp-2025-and-sqlite-vec"
echo
echo "Если что-то не так, откатить:"
echo "  git reset --hard $BACKUP_TAG"
echo "  git update-ref refs/heads/main $BACKUP_TAG"
