(function () {
  "use strict";

  // The bot rewrites this file; vercel.json makes browsers revalidate it on every load.
  var DATA_URL = "./asked-about.json";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Warm, orange-family hues assigned to categories in the order the JSON lists them.
  var HUES = ["#e7651a", "#b42318", "#ca8a04", "#c2410c", "#d9480f", "#a16207", "#9a3412", "#e8590c", "#92400e", "#dc2626"];
  var FRESH_DAYS = 7;
  var DEFAULT_RECENCY = [
    { id: "week", label: "Past week", days: 7 },
    { id: "month", label: "Past month", days: 31 },
    { id: "all", label: "All", default: true },
  ];

  var els = {
    tabs: document.getElementById("recency-tabs"),
    chips: document.getElementById("category-chips"),
    search: document.getElementById("search"),
    cards: document.getElementById("cards"),
    status: document.getElementById("results-status"),
    updated: document.getElementById("masthead-updated"),
    count: document.getElementById("masthead-count"),
  };

  var data = null;
  var recencies = DEFAULT_RECENCY;
  var categories = [];
  var hueById = {};
  var state = { r: "all", c: "all", q: "" };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeUrl(url) {
    return /^https?:\/\//i.test(String(url || "")) ? String(url) : null;
  }

  function highlight(text, query) {
    var raw = String(text == null ? "" : text);
    if (!query) return escapeHtml(raw);
    var lower = raw.toLowerCase();
    var needle = query.toLowerCase();
    var out = "";
    var i = 0;
    var at;
    while ((at = lower.indexOf(needle, i)) !== -1) {
      out += escapeHtml(raw.slice(i, at)) + "<mark>" + escapeHtml(raw.slice(at, at + needle.length)) + "</mark>";
      i = at + needle.length;
    }
    return out + escapeHtml(raw.slice(i));
  }

  function localIsoDate(date) {
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + m + "-" + d;
  }

  function cutoff(days) {
    var date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return localIsoDate(date);
  }

  // Timestamps in the JSON are already in Central Time, so read the wall-clock
  // parts straight from the string instead of converting to the viewer's zone.
  function parseStamp(value, hasTime) {
    if (!value) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
    if (!m) return null;
    var stamp = { key: value, year: +m[1], month: +m[2], day: +m[3], date: m[1] + "-" + m[2] + "-" + m[3] };
    if (hasTime && m[4]) {
      var h = +m[4];
      stamp.time = ((h + 11) % 12) + 1 + ":" + m[5] + " " + (h < 12 ? "AM" : "PM") + " CT";
    }
    return stamp;
  }

  function formatStamp(stamp) {
    var text = MONTHS[stamp.month - 1] + " " + stamp.day;
    if (stamp.year !== new Date().getFullYear()) text += ", " + stamp.year;
    if (stamp.time) text += ", " + stamp.time;
    return text;
  }

  function dateLine(item) {
    var first = parseStamp(item.first_referenced, item.first_has_time);
    var last = parseStamp(item.last_referenced, item.last_has_time);
    if (!first && !last) return "Date unknown";
    if (!first || !last || first.key === last.key) return "Spotted " + formatStamp(last || first);
    return "First " + formatStamp(first) + " · Last " + formatStamp(last);
  }

  function sortKey(item) {
    return item.last_referenced || item.last || "";
  }

  function searchText(item) {
    var parts = [item.tech, item.why, item.cat];
    (item.sources || []).forEach(function (s) {
      parts.push(s.label);
    });
    return parts.join(" \n ").toLowerCase();
  }

  function matchesRecency(item, recencyId) {
    var r = recencies.find(function (x) {
      return x.id === recencyId;
    });
    if (!r || !r.days) return true;
    return Boolean(item.last) && item.last >= cutoff(r.days);
  }

  function matchesCategory(item, catId) {
    return catId === "all" || item.cat_id === catId;
  }

  function matchesQuery(item) {
    return !state.q || item._search.indexOf(state.q.toLowerCase()) !== -1;
  }

  function readUrlState() {
    var params = new URLSearchParams(location.search);
    var def = recencies.find(function (r) {
      return r.default;
    });
    state.r = def ? def.id : "all";
    if (params.get("r") && recencies.some(function (r) { return r.id === params.get("r"); })) state.r = params.get("r");
    state.c = params.get("c") && hueById[params.get("c")] ? params.get("c") : "all";
    state.q = (params.get("q") || "").trim();
    els.search.value = state.q;
  }

  function writeUrlState() {
    var params = new URLSearchParams();
    var def = recencies.find(function (r) {
      return r.default;
    });
    if (state.r !== (def ? def.id : "all")) params.set("r", state.r);
    if (state.c !== "all") params.set("c", state.c);
    if (state.q) params.set("q", state.q);
    var qs = params.toString();
    history.replaceState(null, "", qs ? "?" + qs : location.pathname);
  }

  function renderTabs() {
    els.tabs.innerHTML = recencies
      .map(function (r) {
        var n = data.items.filter(function (it) {
          return matchesRecency(it, r.id) && matchesCategory(it, state.c) && matchesQuery(it);
        }).length;
        return (
          '<button type="button" class="tab" data-r="' + escapeHtml(r.id) + '" aria-pressed="' + (state.r === r.id) + '">' +
          escapeHtml(r.label) + '<span class="tab-count">' + n + "</span></button>"
        );
      })
      .join("");
  }

  function renderChips() {
    var base = data.items.filter(function (it) {
      return matchesRecency(it, state.r) && matchesQuery(it);
    });
    var allLabel = (data.filters && data.filters.category_all_label) || "All categories";
    var html =
      '<button type="button" class="chip is-all" data-c="all" aria-pressed="' + (state.c === "all") + '">' +
      escapeHtml(allLabel) + '<span class="chip-count">' + base.length + "</span></button>";
    categories.forEach(function (cat) {
      var n = base.filter(function (it) {
        return it.cat_id === cat.id;
      }).length;
      html +=
        '<button type="button" class="chip' + (n ? "" : " is-empty") + '" data-c="' + escapeHtml(cat.id) +
        '" style="--hue:' + hueById[cat.id] + '" aria-pressed="' + (state.c === cat.id) + '">' +
        escapeHtml(cat.label) + '<span class="chip-count">' + n + "</span></button>";
    });
    els.chips.innerHTML = html;
  }

  function renderCard(item) {
    var q = state.q;
    var hue = hueById[item.cat_id] || HUES[0];
    var href = safeUrl(item.href);
    var title = href
      ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener">' + highlight(item.tech, q) + "</a>"
      : highlight(item.tech, q);
    var fresh = Boolean(item.last) && item.last >= cutoff(FRESH_DAYS);
    var times = Math.max(1, Number(item.times) || 1);
    var badges = '<span class="badge" data-times="' + Math.min(times, 3) + '" title="Came up ' + times +
      (times === 1 ? " time" : " times") + '">Asked ' + times + "×</span>";
    if (fresh) badges = '<span class="badge is-new">New</span>' + badges;

    var sources = (item.sources || [])
      .map(function (s) {
        var url = safeUrl(s.url);
        return url
          ? '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + highlight(s.label, q) + "</a>"
          : "<span>" + highlight(s.label, q) + "</span>";
      })
      .join("");

    return (
      '<article class="card' + (fresh ? " is-fresh" : "") + '" style="--hue:' + hue + '">' +
      '<div class="card-head"><h2 class="card-title">' + title + '</h2><div class="badges">' + badges + "</div></div>" +
      '<div class="card-meta"><button type="button" class="card-cat" data-c="' + escapeHtml(item.cat_id) +
      '" title="Show only ' + escapeHtml(item.cat) + '">' + highlight(item.cat, q) + "</button>" +
      '<span class="card-dates">' + escapeHtml(dateLine(item)) + "</span></div>" +
      '<p class="card-why">' + highlight(item.why, q) + "</p>" +
      (sources ? '<div class="card-sources"><span class="card-sources-label">Sources</span>' + sources + "</div>" : "") +
      "</article>"
    );
  }

  function render() {
    renderTabs();
    renderChips();
    var visible = data.items.filter(function (it) {
      return matchesRecency(it, state.r) && matchesCategory(it, state.c) && matchesQuery(it);
    });
    els.cards.innerHTML = visible.length
      ? visible.map(renderCard).join("")
      : '<p class="empty">No sightings match these filters.</p>';
    els.cards.setAttribute("aria-busy", "false");

    var def = recencies.find(function (r) {
      return r.default;
    });
    var filtered = state.r !== (def ? def.id : "all") || state.c !== "all" || state.q;
    var total = data.items.length;
    els.status.innerHTML =
      "Showing " + visible.length + " of " + total + (total === 1 ? " sighting" : " sightings") +
      (filtered ? ' <button type="button" id="reset-filters">Clear filters</button>' : "");
  }

  // render() rebuilds the tab and chip buttons, so put focus back on the
  // equivalent new button, or on `fallback` when the focused control is gone.
  function update(changes, fallback) {
    var active = document.activeElement;
    var target = null;
    if (active && els.tabs.contains(active) && active.dataset.r) {
      target = { box: els.tabs, sel: '[data-r="' + CSS.escape(active.dataset.r) + '"]' };
    } else if (active && els.chips.contains(active) && active.dataset.c) {
      target = { box: els.chips, sel: '[data-c="' + CSS.escape(active.dataset.c) + '"]' };
    }
    Object.assign(state, changes);
    writeUrlState();
    render();
    var next = target && target.box.querySelector(target.sel);
    if (next) next.focus();
    else if (fallback && (!document.activeElement || document.activeElement === document.body)) {
      next = typeof fallback === "function" ? fallback() : fallback;
      if (next) next.focus();
    }
  }

  function renderMasthead() {
    var total = data.items.length;
    els.count.textContent = total + (total === 1 ? " Sighting" : " Sightings");
    var updated = data.updated ? new Date(data.updated) : null;
    if (updated && !isNaN(updated)) {
      els.updated.textContent =
        "Updated " + updated.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      els.updated.dateTime = data.updated;
    } else {
      els.updated.textContent = "Sightings";
    }
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function textOrNull(value) {
    return typeof value === "string" ? value : value == null ? null : String(value);
  }

  function normalizeItem(item) {
    var it = Object.assign({}, item);
    ["tech", "why", "cat", "cat_id", "last"].forEach(function (k) {
      it[k] = textOrNull(it[k]) || "";
    });
    ["href", "first_referenced", "last_referenced"].forEach(function (k) {
      it[k] = textOrNull(it[k]);
    });
    it.sources = (Array.isArray(it.sources) ? it.sources : []).filter(isObject).map(function (s) {
      return { label: textOrNull(s.label) || "", url: textOrNull(s.url) };
    });
    return it;
  }

  function prepare(json) {
    data = json;
    // Tolerate malformed entries so one bad item can't take down the page.
    data.items = (Array.isArray(json.items) ? json.items : []).filter(isObject).map(normalizeItem);
    if (json.filters && Array.isArray(json.filters.recency) && json.filters.recency.length) {
      recencies = json.filters.recency;
    }
    if (json.filters && json.filters.search_placeholder) {
      els.search.placeholder = json.filters.search_placeholder;
    }

    categories = (Array.isArray(json.categories) ? json.categories : []).filter(isObject);
    data.items.forEach(function (it) {
      if (it.cat_id && !categories.some(function (c) { return c.id === it.cat_id; })) {
        categories.push({ id: it.cat_id, label: it.cat || it.cat_id });
      }
    });
    categories.forEach(function (cat, i) {
      hueById[cat.id] = HUES[i % HUES.length];
    });

    data.items.forEach(function (it) {
      it._search = searchText(it);
    });
    // Newest first; undated items go last.
    data.items.sort(function (a, b) {
      var ka = sortKey(a);
      var kb = sortKey(b);
      if (!ka !== !kb) return ka ? -1 : 1;
      return kb.localeCompare(ka) || String(a.tech).localeCompare(String(b.tech));
    });
  }

  function bindEvents() {
    els.tabs.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-r]");
      if (btn) update({ r: btn.dataset.r });
    });
    els.chips.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-c]");
      if (btn) update({ c: btn.dataset.c });
    });
    els.cards.addEventListener("click", function (e) {
      var btn = e.target.closest(".card-cat[data-c]");
      if (!btn) return;
      var cat = btn.dataset.c;
      update({ c: cat }, function () {
        return els.chips.querySelector('[data-c="' + CSS.escape(cat) + '"]');
      });
      els.chips.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    els.status.addEventListener("click", function (e) {
      if (e.target.id !== "reset-filters") return;
      var def = recencies.find(function (r) {
        return r.default;
      });
      els.search.value = "";
      update({ r: def ? def.id : "all", c: "all", q: "" }, els.search);
    });
    var timer;
    els.search.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        update({ q: els.search.value.trim() });
      }, 120);
    });
    window.addEventListener("popstate", function () {
      readUrlState();
      render();
    });
  }

  function showError() {
    els.updated.textContent = "Unavailable";
    els.cards.setAttribute("aria-busy", "false");
    els.cards.innerHTML =
      '<p class="empty" data-state="error">The sightings log could not be loaded. Please try again in a moment.</p>';
  }

  fetch(DATA_URL)
    .then(function (res) {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    })
    .then(function (json) {
      prepare(json);
      readUrlState();
      renderMasthead();
      bindEvents();
      render();
    })
    .catch(showError);
})();
