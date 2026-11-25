#!/bin/zsh
# Commit and push asked-about.json when it has changed and passes validation.
# Run twice a day by ~/Library/LaunchAgents/com.indrayam.sightings-autopush.plist.
# Log: tmp/autopush.log (ignored by Git and Vercel).
set -u

REPO="${SIGHTINGS_REPO:-$HOME/Dropbox/dev/indrayam.com/sightings}"
ENVDIR="$HOME/Dropbox/dev"
FILE="asked-about.json"
LOG="$REPO/tmp/autopush.log"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

mkdir -p "$REPO/tmp"
exec >>"$LOG" 2>&1
log() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

cd "$REPO" || { log "ERROR: cannot cd to $REPO"; exit 1; }

branch=$(git symbolic-ref --short -q HEAD)
if [[ "$branch" != "main" ]]; then log "SKIP: on branch '$branch', not main"; exit 0; fi
if [[ -d .git/rebase-merge || -d .git/rebase-apply || -f .git/MERGE_HEAD ]]; then
  log "SKIP: a rebase or merge is in progress"; exit 0
fi

if [[ -z "$(git status --porcelain -- "$FILE")" ]]; then
  log "no change"
  exit 0
fi

# Validate: parses, top-level count, per-category counts, unique ids, known categories.
if ! problems=$(python3 -I - "$FILE" <<'PY'
import json, sys, collections
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception as e:
    print(f"invalid JSON: {e}"); sys.exit(1)
items = d.get("items")
errs = []
if not isinstance(items, list) or not items:
    print("items missing or empty"); sys.exit(1)
if d.get("count") != len(items):
    errs.append(f"count {d.get('count')} != {len(items)} items")
ids = [i.get("id") for i in items]
dups = [k for k, n in collections.Counter(ids).items() if n > 1]
if dups:
    errs.append(f"duplicate ids: {dups}")
cats = {c.get("id"): c.get("count") for c in d.get("categories", [])}
actual = collections.Counter(i.get("cat_id") for i in items)
for cid in actual.keys() - cats.keys():
    errs.append(f"unknown cat_id {cid!r}")
for cid, n in cats.items():
    if actual.get(cid, 0) != n:
        errs.append(f"category {cid!r} count {n} != {actual.get(cid, 0)}")
if errs:
    print("; ".join(errs)); sys.exit(1)
print(f"{len(items)} items OK")
PY
); then
  log "SKIP: validation failed: $problems"
  exit 0
fi

# Don't push over remote commits we haven't seen.
if ! direnv exec "$ENVDIR" git fetch -q origin main; then log "ERROR: fetch failed"; exit 1; fi
if ! git merge-base --is-ancestor origin/main HEAD; then
  log "SKIP: origin/main has commits not in the local branch; pull first"; exit 0
fi

stamp=$(TZ=America/Chicago date '+%Y-%m-%d %H:%M %Z')
git add -- "$FILE" &&
  git commit -q -m "Update Sightings (auto, $stamp)" -- "$FILE" || { log "ERROR: commit failed"; exit 1; }
if direnv exec "$ENVDIR" git push -q origin main; then
  log "pushed $(git rev-parse --short HEAD) ($problems)"
else
  log "ERROR: push failed; commit $(git rev-parse --short HEAD) is local only"
  exit 1
fi
