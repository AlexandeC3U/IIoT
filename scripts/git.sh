#!/bin/bash
# =============================================================================
# NEXUS Edge - Git Sync Script
# Automatically commits and pushes changes to remote
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Navigate to project root (parent of scripts folder)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}                    NEXUS Edge - Git Sync                       ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo -e "${RED}Error: Not a git repository${NC}"
    exit 1
fi

# Show current branch
BRANCH=$(git branch --show-current)
echo -e "${BLUE}Branch:${NC} $BRANCH"
echo ""

# Show git status
echo -e "${YELLOW}Current changes:${NC}"
echo "─────────────────────────────────────────────────────────────────"
git status --short
echo "─────────────────────────────────────────────────────────────────"
echo ""

# Check if there are changes to commit
if git diff --quiet && git diff --cached --quiet; then
    echo -e "${GREEN}✓ Working directory clean - nothing to commit${NC}"
    
    # Check if we need to push
    LOCAL=$(git rev-parse @)
    REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "")
    
    if [ -z "$REMOTE" ]; then
        echo -e "${YELLOW}No upstream branch set${NC}"
    elif [ "$LOCAL" = "$REMOTE" ]; then
        echo -e "${GREEN}✓ Already up to date with remote${NC}"
    else
        echo -e "${YELLOW}Local commits not pushed. Pushing...${NC}"
        git push
        echo -e "${GREEN}✓ Pushed to remote${NC}"
    fi
    exit 0
fi

# Count changes
STAGED=$(git diff --cached --numstat | wc -l | tr -d ' ')
UNSTAGED=$(git diff --numstat | wc -l | tr -d ' ')
UNTRACKED=$(git ls-files --others --exclude-standard | wc -l | tr -d ' ')

echo -e "${BLUE}Summary:${NC}"
echo -e "  Staged:    ${GREEN}$STAGED${NC} files"
echo -e "  Modified:  ${YELLOW}$UNSTAGED${NC} files"
echo -e "  Untracked: ${CYAN}$UNTRACKED${NC} files"
echo ""

# Ask for commit message
echo -e "${YELLOW}Enter commit message (or 'q' to quit):${NC}"
read -r COMMIT_MSG

# Check if user wants to quit
if [ "$COMMIT_MSG" = "q" ] || [ "$COMMIT_MSG" = "Q" ]; then
    echo -e "${YELLOW}Aborted.${NC}"
    exit 0
fi

# Validate commit message
if [ -z "$COMMIT_MSG" ]; then
    echo -e "${RED}Error: Commit message cannot be empty${NC}"
    exit 1
fi

# Add all changes
echo ""
echo -e "${BLUE}Adding all changes...${NC}"
git add -A

# Commit
echo -e "${BLUE}Committing...${NC}"
git commit -m "$COMMIT_MSG"

# Push to remote
echo ""
echo -e "${BLUE}Pushing to remote...${NC}"
if git push 2>&1; then
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Successfully committed and pushed!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
else
    echo ""
    echo -e "${YELLOW}Push failed. You may need to pull first or set upstream:${NC}"
    echo -e "  git pull --rebase"
    echo -e "  git push -u origin $BRANCH"
fi

