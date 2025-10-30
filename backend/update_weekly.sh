#!/bin/bash
# Manual update script for College Football Imperial Map
# Usage: ./update_weekly.sh [season]
# Example: ./update_weekly.sh 2025

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SEASON=${1:-2025}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  College Football Imperial Map - Manual Update${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Season: ${SEASON}${NC}"
echo ""

# Check if virtual environment is activated
if [[ -z "${VIRTUAL_ENV}" ]]; then
    echo -e "${YELLOW}⚠️  Virtual environment not activated${NC}"
    echo -e "Attempting to activate venv..."

    if [ -d "${SCRIPT_DIR}/venv" ]; then
        source "${SCRIPT_DIR}/venv/bin/activate"
        echo -e "${GREEN}✓ Virtual environment activated${NC}"
    else
        echo -e "${RED}✗ Virtual environment not found. Please run:${NC}"
        echo -e "  cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
        exit 1
    fi
fi

# Check for .env file with API key
if [ ! -f "${SCRIPT_DIR}/.env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found${NC}"
    echo -e "Create ${SCRIPT_DIR}/.env with your CollegeFootballData API key:"
    echo -e "  CFBD_API_KEY=your_key_here"
    echo ""
    read -p "Continue without API key? (may hit rate limits) [y/N]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

cd "${SCRIPT_DIR}"

# Step 1: Ingest latest games
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Ingesting game results${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
python ingest_games.py --season ${SEASON} --season-type both
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Game results ingested${NC}"
else
    echo -e "${RED}✗ Failed to ingest game results${NC}"
    exit 1
fi

# Step 2: Apply territory transfers
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Applying territory transfers${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
python apply_transfers.py --season ${SEASON}
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Territory transfers applied${NC}"
else
    echo -e "${RED}✗ Failed to apply transfers${NC}"
    exit 1
fi

# Step 3: Compute leaderboards
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3: Computing leaderboards${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
python compute_leaderboards.py --season ${SEASON}
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Leaderboards computed${NC}"
else
    echo -e "${YELLOW}⚠️  Failed to compute leaderboards (non-critical)${NC}"
fi

# Step 4: Show summary of changes
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Summary of Changes${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd ..
CHANGES=$(git status --short frontend/public/data/)
if [ -z "$CHANGES" ]; then
    echo -e "${YELLOW}No changes detected${NC}"
else
    echo -e "${GREEN}Modified files:${NC}"
    git status --short frontend/public/data/
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Update complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff frontend/public/data/"
echo "  2. Commit changes: git add frontend/public/data/ && git commit -m 'Update territories'"
echo "  3. Push to deploy: git push"
echo ""
