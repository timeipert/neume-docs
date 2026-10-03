#!/usr/bin/env bash
# Runs the MMMO crawl until it is finished, however long that takes (about a day).
#
#   ui/scripts/crawl-mmmo-all-day.sh [--for /path/to/corpus-folder]
#
# - keeps the Mac awake (caffeinate) while it runs;
# - restarts the crawler in chunks of 110 minutes, so a stall or a crash costs at most a chunk;
# - the crawler itself is resumable and never goes faster than robots.txt allows;
# - stops when every source has been read; logs to ui/src/data/mmmo/crawl.log.
# Stop it with Ctrl+C. Run it again later to continue where it stopped.
set -u
cd "$(dirname "$0")/.."
mkdir -p src/data/mmmo
LOG=src/data/mmmo/crawl.log
caffeinate -i -w $$ &   # no sleep for as long as this script lives (macOS; ignored elsewhere)

remaining() {
  node -e "
    const fs=require('fs');const d='src/data/mmmo/';
    const l=JSON.parse(fs.readFileSync(d+'listing.json','utf8')).rows.length;
    let n=0;try{n=Object.keys(JSON.parse(fs.readFileSync(d+'details.json','utf8'))).length}catch{}
    console.log(l-n)"
}

[ -f src/data/mmmo/listing.json ] || node scripts/crawl-mmmo.mjs --phase listing --minutes 110 "$@" >> "$LOG" 2>&1

while :; do
  left=$(remaining)
  echo "$(date '+%F %T')  $left sources still to read" | tee -a "$LOG"
  [ "$left" -le 0 ] && break
  node scripts/crawl-mmmo.mjs --phase details --minutes 110 "$@" >> "$LOG" 2>&1 || sleep 120
done
node scripts/crawl-mmmo.mjs --phase merge >> "$LOG" 2>&1
echo "$(date '+%F %T')  done" | tee -a "$LOG"
