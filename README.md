# Sightings

Source for [sightings.indrayam.com](https://sightings.indrayam.com/): products, SDKs, frameworks, and ideas that caught my eye and may deserve a second look.

Sightings is the companion to [Field Notes](https://fieldnotes.indrayam.com/). Field Notes are long-form explainers on things I have studied up close; Sightings are the quick log of things spotted in passing. A sighting that holds up may later earn a Field Notes explainer.

## How it works

- `asked-about.json` is the data. A research bot regenerates it; nothing else in the repo needs to change when it does.
- `index.html`, `styles.css`, and `app.js` are a dependency-free single page. `app.js` fetches `asked-about.json` on every load and builds the cards, the Past week / Past month / All tabs, the category chips, and the search filter in the browser.
- `vercel.json` sets `Cache-Control: max-age=0, must-revalidate` on the JSON so visitors always see the latest push.
- `404.html` is the custom not-found page; `images/og-sightings.png` is the share image, rendered from `tools/og-sightings.html` (not deployed).
- Filters are kept in the URL (`?r=week&c=models&q=rust`), so a filtered view can be shared.

## Updating

Replace `asked-about.json` with the bot's latest output, commit, and push to `main`. Vercel (Git-connected) deploys automatically.

```sh
direnv exec "$HOME/Dropbox/dev" git -C "$HOME/Dropbox/dev/indrayam.com/sightings" push origin main
```

## JSON fields the page uses

`updated`, `categories[] {id, label}`, `filters.recency[] {id, label, days, default}`, `filters.search_placeholder`, `filters.category_all_label`, and `items[]` with `tech`, `href`, `cat`, `cat_id`, `times`, `why`, `sources[] {label, url}`, `last` (YYYY-MM-DD), `first_referenced`, `first_has_time`, `last_referenced`, `last_has_time`. The bot's `title`, `subtitle`, `footer`, `ref`, and `source_page` are not shown; the page carries its own public copy.

## Local preview

`fetch` does not work from `file://`. Serve the folder instead (the workspace's `.claude/launch.json` has a `sightings` entry on port 8086), or run:

```sh
python3 -m http.server 8080
```
