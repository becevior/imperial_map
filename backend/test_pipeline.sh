#!/bin/bash
# Test the data pipeline locally before pushing
# Usage: ./test_pipeline.sh [season]

set -e

SEASON=${1:-2026}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🧪 Testing data pipeline for season ${SEASON}..."
echo ""

# Check virtual environment
if [[ -z "${VIRTUAL_ENV}" ]]; then
    if [ -d "${SCRIPT_DIR}/venv" ]; then
        source "${SCRIPT_DIR}/venv/bin/activate"
        echo "✓ Virtual environment activated"
    else
        echo "❌ No virtual environment found"
        echo "Run: cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
        exit 1
    fi
fi

cd "${SCRIPT_DIR}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing: ingest_games.py"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
python ingest_games.py --season ${SEASON} --season-type both --provider espn
if [ $? -eq 0 ]; then
    echo "✓ ingest_games.py passed"
else
    echo "❌ ingest_games.py failed"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing: apply_transfers.py (dry-run)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
python apply_transfers.py --season ${SEASON} --dry-run
if [ $? -eq 0 ]; then
    echo "✓ apply_transfers.py passed"
else
    echo "❌ apply_transfers.py failed"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing: compute_leaderboards.py"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
python compute_leaderboards.py --season ${SEASON}
if [ $? -eq 0 ]; then
    echo "✓ compute_leaderboards.py passed"
else
    echo "⚠️  compute_leaderboards.py failed (non-critical)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing: Data file validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd ..

# Validate JSON files
echo "Checking teams.json..."
jq empty frontend/public/data/teams.json && echo "✓ teams.json is valid JSON"

echo "Checking ownership files..."
if ls frontend/public/data/ownership/${SEASON}/*.json 1> /dev/null 2>&1; then
    for file in frontend/public/data/ownership/${SEASON}/*.json; do
        jq empty "$file" 2>/dev/null || echo "⚠️  Invalid JSON: $file"
    done
    echo "✓ Ownership files validated"
else
    echo "⚠️  No ownership files found for season ${SEASON}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Pipeline test complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "If everything passed, you can run:"
echo "  ./update_weekly.sh ${SEASON}"
echo ""
