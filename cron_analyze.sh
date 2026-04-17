#!/usr/bin/env bash
# Hourly observation + analysis pipeline
# 1. Trigger the observe edge function to fetch new Moltbook data
# 2. Run sync_and_analyze.py on all complete snapshots that lack metrics
#
# Usage: ./cron_analyze.sh
# Setup: crontab -e → 0 * * * * /home/yun/Desktop/moltbook/cron_analyze.sh >> /home/yun/Desktop/moltbook/cron.log 2>&1

set -euo pipefail
cd "$(dirname "$0")"

# Load environment
set -a
source .env
set +a

LOGPFX="[$(date '+%Y-%m-%d %H:%M:%S')]"

echo "$LOGPFX Starting hourly observe + analyze cycle"

# Step 1: Trigger observation (fetch new data from Moltbook API)
echo "$LOGPFX Triggering observe edge function..."
OBS_RESP=$(curl -s -w "\n%{http_code}" -X POST \
  "${SUPABASE_URL}/functions/v1/observe" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY:-${SUPABASE_KEY}}" \
  -H "Content-Type: application/json" \
  2>&1) || true

OBS_CODE=$(echo "$OBS_RESP" | tail -1)
OBS_BODY=$(echo "$OBS_RESP" | head -n -1)
echo "$LOGPFX Observe response ($OBS_CODE): $OBS_BODY"

# Step 2: Run analysis on latest snapshot
echo "$LOGPFX Running sync_and_analyze.py..."
python3 sync_and_analyze.py 2>&1

echo "$LOGPFX Done."
