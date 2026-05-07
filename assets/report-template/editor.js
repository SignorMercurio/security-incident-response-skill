(() => {
  // src/state.js
  var KEY = "ir-report.draft.v1";
  var shell = document.getElementById("report-root");
  var body = document.body;
  var elStatus = document.getElementById("edStatus");
  var btnToggle = document.getElementById("edToggle");
  var btnPdf = document.getElementById("edPdf");
  var btnHtml = document.getElementById("edHtml");
  var btnDiscard = document.getElementById("edDiscard");
  var btnUndo = document.getElementById("edUndo");
  var btnRedo = document.getElementById("edRedo");
  var PAGE_WIDTH = 900;
  var PAGE_HEIGHT = 1273;
  var MOBILE_PAGE_MARGIN = 24;
  var MOBILE_PAGE_GAP = 28;
  var MIN_VIEWPORT_WIDTH = 320;
  var MIN_VIEWPORT_SCALE = 0.32;
  var MIN_TOUCH_TARGET = 44;
  var editing = false;
  var writeDepth = 0;
  function setEditingState(on) {
    editing = !!on;
  }
  function incWriteDepth() {
    writeDepth++;
  }
  function decWriteDepth() {
    writeDepth--;
  }
  var ACTION_LABELS = {
    "img-del": "\u5220\u9664\u56FE\u7247",
    "row-del": "\u5220\u9664\u672C\u884C",
    "tl-add": "\u65B0\u589E\u65F6\u95F4\u70B9",
    "tl-acc": "\u5207\u6362\u65F6\u95F4\u70B9\u9AD8\u4EAE",
    "tl-del": "\u5220\u9664\u65F6\u95F4\u70B9",
    "chain-add": "\u65B0\u589E\u6B65\u9AA4",
    "step-acc": "\u5207\u6362\u6B65\u9AA4\u9AD8\u4EAE",
    "step-del": "\u5220\u9664\u6B65\u9AA4",
    "grid-add-col": "\u65B0\u589E\u6218\u672F\u5217",
    "col-add": "\u65B0\u589E\u884C",
    "col-del": "\u5220\u9664\u6218\u672F\u5217",
    "action-add": "\u65B0\u589E\u52A8\u4F5C",
    "action-del": "\u5220\u9664\u52A8\u4F5C",
    "list-add": "\u65B0\u589E\u6761\u76EE",
    "rev-add": "\u65B0\u589E\u4FEE\u8BA2\u884C",
    "rev-del": "\u5220\u9664\u4FEE\u8BA2\u884C",
    "kv-add": "\u65B0\u589E\u5B57\u6BB5",
    "page-add-sub": "\u65B0\u589E\u5C0F\u8282",
    "sub-addchild": "\u65B0\u589E\u5B50\u5C0F\u8282",
    "sub-del": "\u5220\u9664\u5C0F\u8282",
    "toc-add": "\u65B0\u589E\u76EE\u5F55\u6761\u76EE",
    "toc-add-sub": "\u65B0\u589E\u76EE\u5F55\u5B50\u6761\u76EE"
  };
  var SIZE_LABELS = {
    sm: "\u56FE\u7247\u5BBD\u5EA6\u4E09\u5206\u4E4B\u4E00",
    md: "\u56FE\u7247\u5BBD\u5EA6\u4E09\u5206\u4E4B\u4E8C",
    full: "\u56FE\u7247\u6EE1\u5BBD"
  };
  var EDITABLE_SELECTOR = [
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "td",
    "th",
    "blockquote",
    ".kv .k",
    ".kv .v",
    ".cover-meta .k",
    ".cover-meta .v",
    ".cover-meta small",
    ".timeline .t",
    ".timeline .h",
    ".timeline .ts",
    ".chain .step .n",
    ".chain .step .t",
    ".chain .step .d",
    ".chain .step .label",
    ".chain .step .ttl",
    ".action .t",
    ".action .d",
    ".action .status",
    ".callout .k",
    ".rev .hd",
    ".rev .cl",
    ".attack-col .h",
    ".attack-col .c",
    ".asset-card .idx",
    ".asset-card .field .k",
    ".asset-card .field .v",
    ".toc-row .n",
    ".toc-row .t",
    ".toc-row .pg",
    ".cover-hero .sev",
    ".cover-hero .cat",
    ".cover-hero .sub",
    ".client",
    ".eyebrow",
    ".num",
    ".rhs",
    ".phase .n",
    ".phase .t",
    ".phase .meta",
    ".runhead .brand",
    ".runhead .sec",
    ".runhead .cls",
    ".end-rule"
  ].join(",");
  var MULTILINE_SELECTOR = "p, li, blockquote";
  var IMAGE_BLOCK_HOST = "p, h2, h3, h4, li, blockquote";
  var REWIRED_CONTROLS_SEL = ".item-tools,.tail-tools,.page-tools";
  var CHAPTER_RE = /^§\s*([一二三四五六七八九十]+)\s*·/;
  var PAGE_SUB_RE = /^§\s*(\d+\.\d+)\s*·/;
  var SUB_RE = /^\d+\.\d+$/;
  var CN_NUM = {
    \u4E00: 1,
    \u4E8C: 2,
    \u4E09: 3,
    \u56DB: 4,
    \u4E94: 5,
    \u516D: 6,
    \u4E03: 7,
    \u516B: 8,
    \u4E5D: 9,
    \u5341: 10
  };

  // src/util.js
  var pad2 = (n) => String(n).padStart(2, "0");
  var hms = () => {
    const t = /* @__PURE__ */ new Date();
    return pad2(t.getHours()) + ":" + pad2(t.getMinutes()) + ":" + pad2(t.getSeconds());
  };
  function updateViewportScale() {
    const width = Math.max(
      MIN_VIEWPORT_WIDTH,
      document.documentElement.clientWidth || window.innerWidth || 900
    );
    const scale = Math.min(
      1,
      Math.max(MIN_VIEWPORT_SCALE, (width - MOBILE_PAGE_MARGIN) / PAGE_WIDTH)
    );
    const r = document.documentElement.style;
    r.setProperty("--viewport-scale", String(scale));
    r.setProperty("--scaled-page-w", Math.round(PAGE_WIDTH * scale) + "px");
    r.setProperty("--scaled-page-gap", Math.round(MOBILE_PAGE_GAP * scale) + "px");
    r.setProperty("--page-scale-offset", Math.round(PAGE_HEIGHT * scale - PAGE_HEIGHT) + "px");
    r.setProperty("--touch-target-unscaled", Math.ceil(MIN_TOUCH_TARGET / scale) + "px");
  }
  function initViewport() {
    updateViewportScale();
    window.addEventListener("resize", updateViewportScale, { passive: true });
  }
  function dotCount(value) {
    return (value && value.match(/\./g) || []).length;
  }
  function setCollapsedSelection(setStart) {
    const sel = document.getSelection();
    if (!sel) return;
    const range = document.createRange();
    setStart(range);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function placeCaretFromPoint(x, y) {
    let r = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
    if (!r && document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) {
        r = document.createRange();
        r.setStart(p.offsetNode, p.offset);
      }
    }
    if (!r) return;
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
  function asElement(node) {
    return node.nodeType === 3 ? node.parentElement : node;
  }
  var TOOL_SEL = REWIRED_CONTROLS_SEL + ",.tool-anchor";
  function textExcluding(el, excludeSel) {
    const sel = excludeSel ? excludeSel + "," + TOOL_SEL : TOOL_SEL;
    return Array.from(el.childNodes).filter((n) => {
      if (n.nodeType === 3) return true;
      if (n.nodeType === 1) return !n.matches(sel);
      return false;
    }).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
  }
  function renderDate(canonical, format) {
    const y = canonical.slice(0, 4);
    const m = canonical.slice(4, 6);
    const d = canonical.slice(6, 8);
    if (format === "slash") return y + "/" + m + "/" + d;
    if (format === "slash-pad") return y + " / " + m + " / " + d;
    return y + m + d;
  }

  // src/idb.js
  var dbp;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const req = indexedDB.open("ir-report", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbp;
  }
  function tx(mode, fn) {
    return open().then(
      (db) => new Promise((res, rej) => {
        const t = db.transaction("kv", mode);
        const req = fn(t.objectStore("kv"));
        t.oncomplete = () => res(req ? req.result : void 0);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      })
    );
  }
  var idb = {
    get: (k) => tx("readonly", (s) => s.get(k)),
    set: (k, v) => tx("readwrite", (s) => s.put(v, k)),
    del: (k) => tx("readwrite", (s) => s.delete(k))
  };

  // src/widgets.js
  function mkTail(html) {
    const el = document.createElement("div");
    el.className = "tail-tools tool-anchor";
    el.setAttribute("contenteditable", "false");
    el.innerHTML = html;
    labelButtons(el);
    return el;
  }
  function mkItemTools(pos, html) {
    const el = document.createElement("div");
    el.className = "item-tools";
    el.setAttribute("contenteditable", "false");
    el.style.cssText = pos;
    el.innerHTML = html;
    labelButtons(el);
    return el;
  }
  function addDelete(row, pos, onDeleted) {
    const t = mkItemTools(
      pos,
      '<button class="btn danger" data-act="row-del" title="\u5220\u9664">\u2715</button>'
    );
    row.appendChild(t);
    t.addEventListener("click", (e) => {
      if (e.target.getAttribute("data-act") !== "row-del") return;
      row.remove();
      if (onDeleted) onDeleted();
    });
  }
  function wireTimeline(tl) {
    tl.querySelectorAll(".tl-item").forEach(addTlItemTools);
    const tail = mkTail(
      '<button class="btn" data-act="tl-add">+ \u65F6\u95F4\u70B9</button>'
    );
    tl.insertAdjacentElement("afterend", tail);
    tail.addEventListener("click", (e) => {
      if (e.target.getAttribute("data-act") !== "tl-add") return;
      const it = document.createElement("div");
      it.className = "tl-item";
      it.innerHTML = '<div class="t">YYYY/MM/DD \xB7 \u65F6\u95F4</div><div class="h">\u4E8B\u4EF6\u6807\u9898</div><p>\u4E8B\u4EF6\u63CF\u8FF0\u3002</p>';
      tl.appendChild(it);
      addTlItemTools(it);
    });
  }
  function addTlItemTools(it) {
    const t = mkItemTools(
      "right:0;top:4px;",
      '<button class="btn" data-act="tl-acc" title="\u5207\u6362\u9AD8\u4EAE">\u25CF</button><button class="btn danger" data-act="tl-del" title="\u5220\u9664">\u2715</button>'
    );
    it.appendChild(t);
    t.addEventListener("click", (e) => {
      const act = e.target.getAttribute("data-act");
      if (act === "tl-acc") it.classList.toggle("acc");
      if (act === "tl-del") it.remove();
    });
  }
  function wireChain(ch) {
    ch.style.gridTemplateColumns = "";
    ch.classList.add("dynamic");
    ch.style.setProperty("--cols", ch.querySelectorAll(".step").length);
    ch.querySelectorAll(".step").forEach((s) => addStepTools(s, ch));
    const tail = mkTail(
      '<button class="btn" data-act="chain-add">+ \u6B65\u9AA4</button>'
    );
    ch.insertAdjacentElement("afterend", tail);
    tail.addEventListener("click", (e) => {
      if (e.target.getAttribute("data-act") !== "chain-add") return;
      const s = document.createElement("div");
      s.className = "step";
      s.innerHTML = '<div class="n">NN \xB7 \u9636\u6BB5</div><div class="ico"></div><div class="ttl">\u6807\u9898</div><div class="d">\u8BF4\u660E\u3002</div>';
      ch.appendChild(s);
      addStepTools(s, ch);
      ch.style.setProperty("--cols", ch.querySelectorAll(".step").length);
    });
  }
  function addStepTools(step2, ch) {
    const t = mkItemTools(
      "right:4px;top:4px;",
      '<button class="btn" data-act="step-acc" title="\u5207\u6362\u9AD8\u4EAE">\u2605</button><button class="btn danger" data-act="step-del" title="\u5220\u9664">\u2715</button>'
    );
    step2.appendChild(t);
    t.addEventListener("click", (e) => {
      const act = e.target.getAttribute("data-act");
      if (act === "step-acc") step2.classList.toggle("acc");
      if (act === "step-del") {
        step2.remove();
        ch.style.setProperty("--cols", ch.querySelectorAll(".step").length);
      }
    });
  }
  function wireAttackGrid(grid) {
    grid.querySelectorAll(".attack-col").forEach((col) => addColTools(col));
    const tail = mkTail(
      '<button class="btn" data-act="grid-add-col">+ \u6218\u672F\u5217</button>'
    );
    grid.insertAdjacentElement("afterend", tail);
    tail.addEventListener("click", (e) => {
      if (e.target.getAttribute("data-act") !== "grid-add-col") return;
      const col = document.createElement("div");
      col.className = "attack-col";
      col.innerHTML = '<div class="h">\u65B0\u6218\u672F</div><div class="c">\u6280\u672F</div>';
      grid.appendChild(col);
      addColTools(col);
    });
    grid.addEventListener("click", (e) => {
      if (!editing) return;
      if (e.target.closest(".item-tools")) return;
      const c = e.target.closest(".c");
      if (!c || !grid.contains(c)) return;
      if (e.target === c) cycleAttackCell(c);
    });
  }
  function addColTools(col) {
    const h = col.querySelector(".h");
    const t = mkItemTools(
      "right:2px;top:2px;",
      '<button class="btn" data-act="col-add" title="\u65B0\u589E\u884C">+</button><button class="btn danger" data-act="col-del" title="\u5220\u9664\u5217">\u2715</button>'
    );
    if (h) h.appendChild(t);
    t.addEventListener("click", (e) => {
      const act = e.target.getAttribute("data-act");
      if (act === "col-add") {
        const c = document.createElement("div");
        c.className = "c";
        c.textContent = "\u65B0\u6280\u672F";
        col.appendChild(c);
      }
      if (act === "col-del") col.remove();
      e.stopPropagation();
    });
  }
  function cycleAttackCell(c) {
    c.classList.toggle("used");
    syncEditingA11y(c.parentElement || c);
  }
  function findPhaseFor(ac) {
    let el = ac.previousElementSibling;
    while (el && !el.classList.contains("phase")) el = el.previousElementSibling;
    return el;
  }
  function parsePhaseMeta(phase) {
    const out = {
      unit: "\u9879",
      labels: { done: "\u5B8C\u6210", wip: "\u8FDB\u884C\u4E2D", todo: "\u672A\u5F00\u59CB" }
    };
    const meta = phase && phase.querySelector(".meta");
    if (!meta) return out;
    const txt = meta.textContent.trim();
    const head = txt.match(/^\d+\s*([^·]+?)\s*(?:·\s*(.+))?$/);
    if (!head) return out;
    out.unit = head[1].trim() || out.unit;
    const rest = (head[2] || "").trim();
    if (!rest || rest === "\u5168\u90E8\u5B8C\u6210") return out;
    rest.split(/\s*·\s*/).forEach((seg) => {
      const m = seg.match(/^\d+\s*(.+?)$/);
      if (!m) return;
      const lbl = m[1].trim();
      if (!lbl) return;
      if (/完成/.test(lbl)) out.labels.done = lbl;
      else if (/进行中/.test(lbl)) out.labels.wip = lbl;
      else out.labels.todo = lbl;
    });
    return out;
  }
  function refreshActions(ac) {
    ac.querySelectorAll(".action").forEach((row, i) => {
      const n = row.querySelector(".n");
      if (n) n.textContent = pad2(i + 1);
    });
    const phase = findPhaseFor(ac);
    if (!phase) return;
    const meta = phase.querySelector(".meta");
    if (!meta) return;
    const cfg = parsePhaseMeta(phase);
    const items = ac.querySelectorAll(".action");
    const total = items.length;
    let done = 0, wip = 0, todo = 0;
    items.forEach((it) => {
      const s = it.querySelector(".status");
      if (s && s.classList.contains("done")) done++;
      else if (s && s.classList.contains("wip")) wip++;
      else todo++;
    });
    let text = total + " " + cfg.unit;
    if (total > 0 && done === total) {
      text += " \xB7 \u5168\u90E8\u5B8C\u6210";
    } else {
      const segs = [];
      if (done) segs.push(done + " " + cfg.labels.done);
      if (wip) segs.push(wip + " " + cfg.labels.wip);
      if (todo) segs.push(todo + " " + cfg.labels.todo);
      if (segs.length) text += " \xB7 " + segs.join(" \xB7 ");
    }
    meta.textContent = text;
  }
  function wireActions(ac) {
    ac.querySelectorAll(".action").forEach(addActionTools);
    const tail = mkTail(
      '<button class="btn" data-act="action-add">+ \u52A8\u4F5C</button>'
    );
    ac.insertAdjacentElement("afterend", tail);
    tail.addEventListener("click", (e) => {
      if (e.target.getAttribute("data-act") !== "action-add") return;
      const row = document.createElement("div");
      row.className = "action";
      row.innerHTML = '<div class="n">00</div><div class="t">\u52A8\u4F5C\u63CF\u8FF0\u3002</div><span class="status todo"><span class="dot"></span>\u672A\u5F00\u59CB</span>';
      ac.appendChild(row);
      addActionTools(row);
      refreshActions(ac);
    });
    ac.addEventListener("click", (e) => {
      if (!editing) return;
      const pill = e.target.closest(".status");
      if (!pill || !ac.contains(pill)) return;
      if (e.target.closest(".item-tools")) return;
      cycleStatus(pill);
      refreshActions(ac);
      e.preventDefault();
    });
    refreshActions(ac);
  }
  function addActionTools(row) {
    const t = mkItemTools(
      "right:-4px;top:-4px;",
      '<button class="btn danger" data-act="action-del" title="\u5220\u9664">\u2715</button>'
    );
    row.appendChild(t);
    t.addEventListener("click", (e) => {
      if (e.target.getAttribute("data-act") !== "action-del") return;
      const ac = row.parentElement;
      row.remove();
      if (ac) refreshActions(ac);
    });
  }
  function cycleStatus(pill) {
    const order = ["todo", "wip", "done"];
    const label = { todo: "\u672A\u5F00\u59CB", wip: "\u8FDB\u884C\u4E2D", done: "\u5DF2\u5B8C\u6210" };
    const cur = order.find((o) => pill.classList.contains(o)) || "todo";
    const next = order[(order.indexOf(cur) + 1) % order.length];
    order.forEach((o) => pill.classList.remove(o));
    pill.classList.add(next);
    pill.innerHTML = '<span class="dot" contenteditable="false"></span>' + label[next];
    syncEditingA11y(pill.parentElement || pill);
  }
  function wireSimpleList(container, childSel, tailLabel, addFn, itemPos) {
    container.querySelectorAll(childSel).forEach((row) => addDelete(row, itemPos || "right:4px;top:4px;"));
    const tail = mkTail(
      '<button class="btn" data-act="list-add">' + tailLabel + "</button>"
    );
    container.insertAdjacentElement("afterend", tail);
    tail.addEventListener("click", (e) => {
      if (e.target.getAttribute("data-act") !== "list-add") return;
      const row = addFn(container);
      if (row) addDelete(row, itemPos || "right:4px;top:4px;");
    });
  }
  function wireRev(rev) {
    const cells = Array.from(rev.children);
    for (let i = 4; i < cells.length; i += 4) {
      addRevDelete(rev, cells.slice(i, i + 4));
    }
    const tail = mkTail(
      '<button class="btn" data-act="rev-add">+ \u4FEE\u8BA2\u884C</button>'
    );
    rev.insertAdjacentElement("afterend", tail);
    tail.addEventListener("click", (e) => {
      if (e.target.getAttribute("data-act") !== "rev-add") return;
      const mk = (cls, text) => {
        const d = document.createElement("div");
        d.className = cls;
        d.textContent = text;
        return d;
      };
      const c = [
        mk("cl mono", "YYYY/MM/DD"),
        mk("cl mono", "1.0"),
        mk("cl", "\u63CF\u8FF0"),
        mk("cl", "\u4F5C\u8005")
      ];
      c.forEach((n) => rev.appendChild(n));
      addRevDelete(rev, c);
    });
  }
  function addRevDelete(rev, c4) {
    const t = mkItemTools(
      "right:-18px;top:8px;",
      '<button class="btn danger" data-act="rev-del" title="\u5220\u9664\u672C\u884C">\u2715</button>'
    );
    c4[c4.length - 1].appendChild(t);
    t.addEventListener("click", (e) => {
      if (e.target.getAttribute("data-act") === "rev-del")
        c4.forEach((n) => n.remove());
    });
  }
  function wireAssetCards() {
    const all = Array.from(shell.querySelectorAll(".asset-card"));
    const groups = [];
    let cur = [];
    all.forEach((card) => {
      if (cur.length && cur[cur.length - 1].nextElementSibling === card) {
        cur.push(card);
      } else {
        if (cur.length) groups.push(cur);
        cur = [card];
      }
    });
    if (cur.length) groups.push(cur);
    const TEMPLATES = {
      ecs: [
        { k: "\u516C\u7F51 IP", v: "x.x.x.x" },
        { k: "\u79C1\u7F51 IP", v: "x.x.x.x" },
        { k: "\u5B9E\u4F8B ID", v: "[ \u5B9E\u4F8B ID ]" },
        { k: "\u5B9E\u4F8B\u540D\u79F0", v: "[ \u5B9E\u4F8B\u540D\u79F0 ]" },
        { k: "\u8D44\u4EA7\u7528\u9014", v: "\u516C\u7F51 Web \u5E94\u7528\u4E3B\u673A\uFF0C\u901A\u8FC7\u4E91\u8D1F\u8F7D\u5747\u8861 TCP/443 \u5BF9\u5916\u63D0\u4F9B\u670D\u52A1\u3002", full: true, zh: true }
      ],
      ak: [
        { k: "AccessKey ID", v: "[ AccessKey ID ]" },
        { k: "RAM \u5B50\u8D26\u6237", v: "[ RAM \u5B50\u8D26\u6237\u540D\u79F0 ]" },
        { k: "\u6743\u9650\u8303\u56F4", v: "\u4E8B\u4EF6\u53D1\u751F\u65F6\u5BF9\u4E91\u79DF\u6237\u62E5\u6709\u5B8C\u6574\u7684\u7BA1\u7406\u6743\u9650\uFF08Administrator\uFF09\u3002", full: true, zh: true }
      ],
      custom: [
        { k: "\u5B57\u6BB5", v: "\u503C" },
        { k: "\u8BF4\u660E", v: "\u8D44\u4EA7\u63CF\u8FF0\u3002", full: true, zh: true }
      ]
    };
    const esc = (s) => String(s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
    function buildAssetCard(n, tpl) {
      const fields = TEMPLATES[tpl].map((f) => {
        const cls = "field" + (f.full ? " full" : "");
        const vCls = "v" + (f.zh ? " zh" : "");
        return '<div class="' + cls + '"><div class="k">' + esc(f.k) + '</div><div class="' + vCls + '">' + esc(f.v) + "</div></div>";
      }).join("");
      const card = document.createElement("div");
      card.className = "asset-card";
      card.innerHTML = '<div class="idx">' + pad2(n) + '</div><div class="body">' + fields + "</div>";
      return card;
    }
    const LABELS = { ecs: "+ ECS", ak: "+ AK", custom: "+ \u81EA\u5B9A\u4E49" };
    const btns = Object.keys(TEMPLATES).map((k) => '<button class="btn" data-act="asset-' + k + '">' + LABELS[k] + "</button>").join("");
    function liveCards(tail) {
      const out = [];
      for (let el = tail.previousElementSibling; el && el.classList && el.classList.contains("asset-card"); el = el.previousElementSibling)
        out.unshift(el);
      return out;
    }
    function reindex(tail) {
      liveCards(tail).forEach((c, i) => {
        const idx = c.querySelector(".idx");
        if (idx) idx.textContent = pad2(i + 1);
      });
    }
    groups.forEach((group) => {
      const tail = mkTail(btns);
      group[group.length - 1].insertAdjacentElement("afterend", tail);
      group.forEach(
        (card) => addDelete(card, "right:6px;top:6px;", () => reindex(tail))
      );
      tail.addEventListener("click", (e) => {
        const act = e.target.getAttribute("data-act") || "";
        if (!act.startsWith("asset-")) return;
        const tpl = act.slice(6);
        if (!TEMPLATES[tpl]) return;
        const next = liveCards(tail).length + 1;
        const card = buildAssetCard(next, tpl);
        tail.parentNode.insertBefore(card, tail);
        addDelete(card, "right:6px;top:6px;", () => reindex(tail));
      });
    });
  }
  function wireKvGroups() {
    const byParent = /* @__PURE__ */ new Map();
    shell.querySelectorAll(".kv").forEach((kv) => {
      const p = kv.parentElement;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(kv);
    });
    byParent.forEach((kvs) => {
      kvs.forEach((kv) => addDelete(kv, "right:4px;top:4px;"));
      const tail = mkTail(
        '<button class="btn" data-act="kv-add">+ \u5B57\u6BB5</button>'
      );
      kvs[kvs.length - 1].insertAdjacentElement("afterend", tail);
      tail.addEventListener("click", (e) => {
        if (e.target.getAttribute("data-act") !== "kv-add") return;
        const kv = document.createElement("div");
        kv.className = "kv";
        kv.innerHTML = '<div class="k">\u540D\u79F0</div><div class="v">\u503C</div>';
        tail.parentNode.insertBefore(kv, tail);
        addDelete(kv, "right:4px;top:4px;");
      });
    });
  }

  // src/images.js
  function isImageType(type) {
    return !!type && type.startsWith("image/");
  }
  function findImageInDT(dt) {
    if (!dt || !dt.items) return null;
    for (const it of dt.items) {
      if (isImageType(it.type)) return it.getAsFile();
    }
    return null;
  }
  function imagesFromDT(dt) {
    return [...dt && dt.files || []].filter((f) => isImageType(f.type));
  }
  function hasImage(dt) {
    if (!dt) return false;
    if (dt.items && [...dt.items].some((i) => isImageType(i.type))) return true;
    if (dt.files && [...dt.files].some((f) => isImageType(f.type))) return true;
    return false;
  }
  function readAsDataURL(file, forceMime) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(forceMime ? file.slice(0, file.size, forceMime) : file);
    });
  }
  function downscaleIfNeeded(dataUrl, maxW = 1600) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth <= maxW) return res(dataUrl);
        const scale = maxW / img.naturalWidth;
        const c = document.createElement("canvas");
        c.width = maxW;
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => res(dataUrl);
      img.src = dataUrl;
    });
  }
  function makeImgNode(dataUrl) {
    const wrap = document.createElement("figure");
    wrap.className = "img-wrap";
    wrap.setAttribute("contenteditable", "false");
    const img = document.createElement("img");
    img.className = "inserted";
    img.src = dataUrl;
    img.alt = "";
    wrap.appendChild(img);
    return wrap;
  }
  var IMG_SIZE_CLASSES = ["size-sm", "size-md", "size-full"];
  function setImgSize(figure, size) {
    figure.classList.remove(...IMG_SIZE_CLASSES);
    figure.classList.add("size-" + size);
  }
  function addImageTools(figure) {
    if (figure.querySelector(":scope > .item-tools")) return;
    const tools = mkItemTools(
      "right:6px;top:6px;",
      '<button class="btn" data-size="sm" title="\u5C0F">\u2153</button><button class="btn" data-size="md" title="\u4E2D">\u2154</button><button class="btn" data-size="full" title="\u6EE1">\u25AD</button><button class="btn danger" data-act="img-del" title="\u5220\u9664">\u2715</button>'
    );
    figure.appendChild(tools);
    tools.addEventListener("click", (e) => {
      const button = e.target instanceof Element ? e.target.closest("button[data-size],button[data-act]") : null;
      if (!button || !tools.contains(button)) return;
      const size = button.getAttribute("data-size");
      if (size) setImgSize(figure, size);
      else if (button.getAttribute("data-act") === "img-del") figure.remove();
    });
  }
  async function insertImageFromFile(file) {
    try {
      const raw = await readAsDataURL(file);
      const small = await downscaleIfNeeded(raw);
      insertImageBlock(makeImgNode(small));
    } catch (err) {
      console.error("[ir-report] image insert failed", err);
    }
  }
  function insertImageBlock(node) {
    const sel = document.getSelection();
    let host = null;
    let range = null;
    if (sel && sel.rangeCount && sel.anchorNode) {
      range = sel.getRangeAt(0);
      const base = asElement(sel.anchorNode);
      host = base && base.closest(IMAGE_BLOCK_HOST);
    }
    if (!host) {
      const pages = shell.querySelectorAll(".page");
      if (pages.length) {
        const page = pages[pages.length - 1];
        const foot = page.querySelector(".runfoot");
        const anchor = foot || null;
        if (anchor) page.insertBefore(node, anchor);
        else page.appendChild(node);
      } else {
        shell.appendChild(node);
      }
    } else if (range && host.matches("p, blockquote") && host.contains(range.startContainer)) {
      const tail = host.cloneNode(false);
      const tailRange = document.createRange();
      tailRange.setStart(range.startContainer, range.startOffset);
      tailRange.setEnd(host, host.childNodes.length);
      tail.appendChild(tailRange.extractContents());
      const parent = host.parentElement;
      parent.insertBefore(node, host.nextSibling);
      parent.insertBefore(tail, node.nextSibling);
      if (!host.textContent && !host.querySelector("br, img")) host.remove();
    } else {
      host.parentElement.insertBefore(node, host.nextSibling);
    }
    addImageTools(node);
    focusAfterFigure(node);
  }
  function focusAfterFigure(figure) {
    const next = figure.nextElementSibling;
    const reusable = next && next.tagName === "P" && next.textContent.trim() === "";
    let target;
    if (reusable) {
      target = next;
    } else {
      target = document.createElement("p");
      target.appendChild(document.createElement("br"));
      figure.parentElement.insertBefore(target, figure.nextSibling);
      if (editing) target.setAttribute("contenteditable", "true");
    }
    setCollapsedSelection((r) => {
      r.selectNodeContents(target);
    });
    if (target.focus) target.focus();
  }

  // src/pages.js
  var PAGE_LIMIT_PX = (() => {
    const firstPage = shell.querySelector(".page");
    if (!firstPage) return 1123;
    return parseFloat(getComputedStyle(firstPage).minHeight) || 1123;
  })();
  var OVERFLOW_TOLERANCE = 60;
  function addPageTools(page) {
    const tools = document.createElement("div");
    tools.className = "page-tools tool-anchor";
    tools.setAttribute("contenteditable", "false");
    tools.innerHTML = '<button class="btn" data-act="page-add-sub">+ \u5C0F\u8282</button>';
    page.insertAdjacentElement("afterend", tools);
    tools.addEventListener("click", (e) => {
      if (e.target.getAttribute("data-act") === "page-add-sub")
        addSubSection(page);
    });
  }
  function wirePageTools() {
    shell.querySelectorAll(".page").forEach(addPageTools);
  }
  function addSubSection(page) {
    const anchor = page.querySelector(".end-rule") || page.querySelector(".runfoot");
    const h3 = document.createElement("h3");
    h3.className = "sub";
    h3.innerHTML = '<span class="n">N.N</span> \u65B0\u5C0F\u8282 <span class="en">New Subsection</span>';
    const p = document.createElement("p");
    p.textContent = "\u5C0F\u8282\u5185\u5BB9\u3002";
    page.insertBefore(h3, anchor);
    page.insertBefore(p, anchor);
    wireSubSectionTools(h3);
    renumberSubsections();
  }
  function isStructuralBoundary(el) {
    return el.classList.contains("end-rule") || el.classList.contains("runfoot") || el.classList.contains("page-tools");
  }
  function isSameOrShallowerSubsection(el, parentDepth) {
    return el.tagName === "H3" && el.classList.contains("sub") && dotCount(el.querySelector(".n")?.textContent) <= parentDepth;
  }
  function findSectionBoundary(startEl, parentDepth) {
    let cur = startEl.nextElementSibling;
    while (cur) {
      if (isStructuralBoundary(cur) || isSameOrShallowerSubsection(cur, parentDepth))
        return cur;
      cur = cur.nextElementSibling;
    }
    return null;
  }
  function addSubSubSection(parentH3) {
    const h3 = document.createElement("h3");
    h3.className = "sub";
    h3.innerHTML = '<span class="n">N.N.N</span> \u65B0\u5B50\u5C0F\u8282 <span class="en">New Sub-subsection</span>';
    const p = document.createElement("p");
    p.textContent = "\u5B50\u5C0F\u8282\u5185\u5BB9\u3002";
    const parentEl = parentH3.parentElement;
    const parentDepth = dotCount(parentH3.querySelector(".n")?.textContent);
    const anchor = findSectionBoundary(parentH3, parentDepth);
    if (anchor) {
      parentEl.insertBefore(h3, anchor);
      parentEl.insertBefore(p, anchor);
    } else {
      parentEl.appendChild(h3);
      parentEl.appendChild(p);
    }
    wireSubSectionTools(h3);
    renumberSubsections();
  }
  function wireSubSectionTools(h3) {
    if (h3.querySelector(":scope > .item-tools")) return;
    const n = h3.querySelector(".n");
    if (!n) return;
    const is3level = dotCount(n.textContent) >= 2;
    const html = is3level ? '<button class="btn danger" data-act="sub-del" title="\u5220\u9664">\u2715</button>' : '<button class="btn" data-act="sub-addchild" title="\u65B0\u589E\u5B50\u5C0F\u8282">+ \u5B50</button><button class="btn danger" data-act="sub-del" title="\u5220\u9664">\u2715</button>';
    const tools = mkItemTools(
      "right:0;top:50%;transform:translateY(-50%);",
      html
    );
    h3.appendChild(tools);
    tools.addEventListener("click", (e) => {
      const act = e.target.getAttribute("data-act");
      if (act === "sub-addchild") addSubSubSection(h3);
      else if (act === "sub-del") {
        deleteSubsection(h3);
        renumberSubsections();
      }
    });
  }
  function deleteSubsection(h3) {
    const nSpan = h3.querySelector(".n");
    const targetDots = dotCount(nSpan && nSpan.textContent);
    const parent = h3.parentElement;
    const boundary = findSectionBoundary(h3, targetDots);
    const toRemove = [h3];
    let cur = h3.nextElementSibling;
    while (cur && cur !== boundary) {
      toRemove.push(cur);
      cur = cur.nextElementSibling;
    }
    toRemove.forEach((el) => el.remove());
    if (parent && parent.tagName === "DIV" && !parent.className && parent.children.length === 0 && parent.parentElement) {
      parent.remove();
    }
  }
  function renumberSubsections() {
    const pages = [...shell.querySelectorAll(".page")];
    let chapter = null;
    let lvl2 = 0;
    let lvl3 = 0;
    for (const page of pages) {
      const numEl = page.querySelector(".sec-head .num");
      if (numEl) {
        const txt = numEl.textContent.trim();
        const mChap = CHAPTER_RE.exec(txt);
        const mSub = PAGE_SUB_RE.exec(txt);
        const mPlate = /^§\s*(\d+)\s*·/.exec(txt);
        if (mChap) {
          const newChap = String(CN_NUM[mChap[1]] || mChap[1]);
          if (newChap !== chapter) {
            chapter = newChap;
            lvl2 = 0;
            lvl3 = 0;
          }
        } else if (mSub) {
          const newChap = mSub[1].split(".")[0];
          if (newChap !== chapter) {
            chapter = newChap;
            lvl2 = 0;
            lvl3 = 0;
          }
          lvl2 += 1;
          lvl3 = 0;
          const newNum = chapter + "." + lvl2;
          const rest = txt.replace(/^§\s*\d+\.\d+\s*·\s*/, "");
          numEl.textContent = "\xA7 " + newNum + " \xB7 " + rest;
          page.querySelectorAll(".runhead > div:not(.brand)").forEach((d) => {
            d.textContent = d.textContent.replace(/§\s*\d+\.\d+/, "\xA7 " + newNum);
          });
        } else if (mPlate) {
          const newChap = mPlate[1];
          if (newChap !== chapter) {
            chapter = newChap;
            lvl2 = 0;
            lvl3 = 0;
          }
        }
      }
      if (chapter === null) continue;
      page.querySelectorAll("h3.sub").forEach((h3) => {
        const n = h3.querySelector(".n");
        if (!n) return;
        if (dotCount(n.textContent) >= 2 && lvl2 > 0) {
          lvl3 += 1;
          n.textContent = chapter + "." + lvl2 + "." + lvl3;
        } else {
          lvl2 += 1;
          lvl3 = 0;
          n.textContent = chapter + "." + lvl2;
        }
      });
    }
  }
  function pageAnchor(page) {
    const n = page.nextElementSibling;
    return n && n.classList.contains("page-tools") ? n : page;
  }
  var LIST_STRUCTURES = [
    { sel: ".timeline", itemSel: ".tl-item", rewire: (c) => wireTimeline(c) },
    { sel: ".actions", itemSel: ".action", rewire: (c) => wireActions(c) }
  ];
  function splitPage(page) {
    const rh = page.querySelector(".runhead");
    const rf = page.querySelector(".runfoot");
    const pageRect = page.getBoundingClientRect();
    const limitY = pageRect.top + PAGE_LIMIT_PX - 80;
    const kids = Array.from(page.children).filter((c) => c !== rh && c !== rf);
    const bottomOf = (el) => {
      const r = el.getBoundingClientRect();
      const mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
      return r.bottom + mb;
    };
    let splitAt = -1;
    for (let i = 0; i < kids.length; i++) {
      if (bottomOf(kids[i]) > limitY) {
        splitAt = i;
        break;
      }
    }
    while (splitAt > 0 && kids[splitAt].classList.contains("tail-tools"))
      splitAt--;
    if (splitAt > 0 && /^H[1-6]$/.test(kids[splitAt - 1].tagName))
      splitAt--;
    let nested = null;
    if (splitAt <= 0) {
      for (const child of kids) {
        const lt = LIST_STRUCTURES.find((x) => child.matches(x.sel));
        if (!lt) continue;
        const items = Array.from(child.querySelectorAll(":scope > " + lt.itemSel));
        for (let i = 1; i < items.length; i++) {
          if (items[i].getBoundingClientRect().bottom > limitY) {
            nested = { container: child, items, start: i, rewire: lt.rewire };
            break;
          }
        }
        if (nested) break;
      }
    }
    if (splitAt <= 0 && !nested) return false;
    const np = document.createElement("section");
    np.className = "page";
    np.setAttribute("data-screen-label", "\u7EED\u9875");
    if (rh) np.appendChild(rh.cloneNode(true));
    if (nested) {
      const clone = nested.container.cloneNode(false);
      np.appendChild(clone);
      for (let i = nested.start; i < nested.items.length; i++) {
        const it = nested.items[i];
        it.querySelectorAll(".item-tools").forEach((n) => n.remove());
        clone.appendChild(it);
      }
      nested.rewire(clone);
    } else {
      for (let i = splitAt; i < kids.length; i++) np.appendChild(kids[i]);
    }
    if (rf) np.appendChild(rf.cloneNode(true));
    pageAnchor(page).insertAdjacentElement("afterend", np);
    addPageTools(np);
    applyGuards();
    return true;
  }
  function checkOverflow() {
    shell.querySelectorAll(".page").forEach((p) => {
      p.classList.toggle("overflow", p.offsetHeight > PAGE_LIMIT_PX + OVERFLOW_TOLERANCE);
    });
  }
  function renumberFooters() {
    const pages = shell.querySelectorAll(".page");
    const total = pad2(pages.length);
    pages.forEach((p, i) => {
      const pg = p.querySelector(".runfoot .pg");
      if (!pg) return;
      const next = pad2(i + 1) + " / " + total;
      if (pg.textContent !== next) pg.textContent = next;
    });
  }
  function safeAutoPaginate() {
    try {
      autoPaginate();
    } catch (err) {
      console.error("[ir-report] auto-paginate failed", err);
    }
  }
  function autoPaginate(tolerance = OVERFLOW_TOLERANCE) {
    for (let iter = 0; iter < 30; iter++) {
      let changed = false;
      const pages = Array.from(shell.querySelectorAll(".page"));
      for (const p of pages) {
        if (p.offsetHeight > PAGE_LIMIT_PX + tolerance) {
          if (splitPage(p)) {
            changed = true;
            break;
          }
        }
      }
      if (!changed) break;
    }
    reapEmptyPages();
    renumberFooters();
    checkOverflow();
  }
  function reapEmptyPages() {
    const pages = shell.querySelectorAll(".page");
    if (pages.length <= 1) return;
    pages.forEach((p) => {
      const hasBody = [...p.children].some(
        (c) => !c.classList.contains("runhead") && !c.classList.contains("runfoot")
      );
      if (hasBody) return;
      const tools = p.nextElementSibling;
      p.remove();
      if (tools && tools.classList.contains("page-tools")) tools.remove();
    });
  }

  // src/toc.js
  function selectionIn(selector) {
    const s = window.getSelection && window.getSelection();
    if (!s || !s.anchorNode) return false;
    const el = asElement(s.anchorNode);
    return !!(el && el.closest && el.closest(selector));
  }
  function rebuildToc() {
    const toc = shell.querySelector(".toc");
    if (!toc) return;
    if (selectionIn(".toc")) return;
    const subtitleByKey = /* @__PURE__ */ new Map();
    toc.querySelectorAll(":scope > .toc-row:not(.sub)").forEach((row) => {
      const small = row.querySelector(".t small");
      if (!small) return;
      const nEl = row.querySelector(".n");
      if (nEl) subtitleByKey.set(nEl.textContent.trim(), small.outerHTML);
    });
    const chaptersWithSubs = /* @__PURE__ */ new Set();
    toc.querySelectorAll(":scope > .toc-row.sub").forEach((row) => {
      const n = row.querySelector(".n")?.textContent.trim();
      if (n) chaptersWithSubs.add(n.split(".")[0]);
    });
    const pages = Array.from(shell.querySelectorAll(".page"));
    const indexOf = (p) => pages.indexOf(p);
    const mainChapters = /* @__PURE__ */ new Set();
    for (const page of pages) {
      const numEl = page.querySelector(".sec-head .num");
      if (!numEl) continue;
      const m = CHAPTER_RE.exec(numEl.textContent.trim());
      if (m && CN_NUM[m[1]] != null) mainChapters.add(String(CN_NUM[m[1]]));
    }
    const subChapterOf = (key) => key.split(".")[0];
    const pushed = /* @__PURE__ */ new Set();
    const rows = [];
    for (const page of pages) {
      const numEl = page.querySelector(".sec-head .num");
      if (numEl) {
        const txt = numEl.textContent.trim();
        const chMatch = CHAPTER_RE.exec(txt);
        if (chMatch) {
          const chNum = chMatch[1];
          const h2 = page.querySelector(".sec-head h2");
          if (h2 && !pushed.has("C:" + chNum)) {
            rows.push({
              sub: false,
              n: chNum,
              title: textExcluding(h2, ".en"),
              subtitle: subtitleByKey.get(chNum) || "",
              pg: indexOf(page) + 1
            });
            pushed.add("C:" + chNum);
          }
        } else {
          const psMatch = PAGE_SUB_RE.exec(txt);
          if (psMatch && mainChapters.has(subChapterOf(psMatch[1])) && chaptersWithSubs.has(subChapterOf(psMatch[1])) && !pushed.has("S:" + psMatch[1])) {
            const h2 = page.querySelector(".sec-head h2");
            if (h2) {
              rows.push({
                sub: true,
                n: psMatch[1],
                title: textExcluding(h2, ".en"),
                subtitle: "",
                pg: indexOf(page) + 1
              });
              pushed.add("S:" + psMatch[1]);
            }
          }
        }
      }
      const addSubRow = (nTxt, title, pgNum2) => {
        if (!SUB_RE.test(nTxt)) return;
        if (!mainChapters.has(subChapterOf(nTxt))) return;
        if (!chaptersWithSubs.has(subChapterOf(nTxt))) return;
        if (pushed.has("S:" + nTxt)) return;
        rows.push({ sub: true, n: nTxt, title, subtitle: "", pg: pgNum2 });
        pushed.add("S:" + nTxt);
      };
      const pgNum = indexOf(page) + 1;
      page.querySelectorAll("h3.sub").forEach((h3) => {
        const nSpan = h3.querySelector(".n");
        if (!nSpan) return;
        addSubRow(nSpan.textContent.trim(), textExcluding(h3, ".n,.en"), pgNum);
      });
      page.querySelectorAll(".phase").forEach((ph) => {
        const nEl = ph.querySelector(":scope > .n");
        const tEl = ph.querySelector(":scope > .t");
        if (!nEl || !tEl) return;
        addSubRow(nEl.textContent.trim(), textExcluding(tEl, ".en"), pgNum);
      });
    }
    rows.sort((a, b) => {
      const ka = a.sub ? Number(a.n.split(".")[0]) : CN_NUM[a.n];
      const kb = b.sub ? Number(b.n.split(".")[0]) : CN_NUM[b.n];
      if (ka !== kb) return ka - kb;
      if (!a.sub && b.sub) return -1;
      if (a.sub && !b.sub) return 1;
      if (a.sub && b.sub) {
        const pa = Number(a.n.split(".")[1]);
        const pb = Number(b.n.split(".")[1]);
        return pa - pb;
      }
      return 0;
    });
    const current = Array.from(toc.querySelectorAll(":scope > .toc-row")).map((r) => ({
      sub: r.classList.contains("sub"),
      n: r.querySelector(".n")?.textContent.trim() || "",
      title: textExcluding(r.querySelector(".t") || r, "small"),
      subtitle: r.querySelector(".t small")?.outerHTML || "",
      pg: r.querySelector(".pg")?.textContent.trim() || ""
    }));
    const same = current.length === rows.length && current.every((c, i) => {
      const r = rows[i];
      return c.sub === r.sub && c.n === r.n && c.title === r.title && c.subtitle === r.subtitle && c.pg === pad2(r.pg);
    });
    if (same) return;
    toc.querySelectorAll(":scope > .toc-row").forEach((r) => r.remove());
    for (const row of rows) {
      const el = document.createElement("div");
      el.className = "toc-row" + (row.sub ? " sub" : "");
      const t = document.createElement("div");
      t.className = "t";
      t.textContent = row.title;
      if (row.subtitle) t.insertAdjacentHTML("beforeend", row.subtitle);
      const n = document.createElement("div");
      n.className = "n";
      n.textContent = row.n;
      const pg = document.createElement("div");
      pg.className = "pg";
      pg.textContent = pad2(row.pg);
      el.appendChild(n);
      el.appendChild(t);
      el.appendChild(pg);
      toc.appendChild(el);
      if (editing) addDelete(el, "right:4px;top:4px;");
    }
    applyGuards();
  }

  // src/editing.js
  function labelButtons(root) {
    root.querySelectorAll("button").forEach((button) => {
      if (!button.hasAttribute("type")) {
        button.setAttribute("type", "button");
      }
      if (button.getAttribute("aria-haspopup") === "menu" && !button.hasAttribute("aria-expanded")) {
        button.setAttribute("aria-expanded", "false");
      }
      if (button.hasAttribute("aria-label")) return;
      const size = button.getAttribute("data-size");
      const act = button.getAttribute("data-act");
      let label = "";
      if (size && SIZE_LABELS[size]) {
        label = SIZE_LABELS[size];
      } else if (act && ACTION_LABELS[act]) {
        label = ACTION_LABELS[act];
      } else {
        label = button.getAttribute("title") || button.textContent.trim();
      }
      if (label) button.setAttribute("aria-label", label);
    });
  }
  function setButtonLike(el, on, label) {
    if (on) {
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-label", label);
    } else {
      el.removeAttribute("role");
      el.removeAttribute("tabindex");
      el.removeAttribute("aria-label");
      el.removeAttribute("aria-pressed");
    }
  }
  function syncEditingA11y(root) {
    const scope = root || shell;
    scope.querySelectorAll(".action .status").forEach((el) => {
      const label = "\u5207\u6362\u5904\u7F6E\u72B6\u6001\uFF1A" + el.textContent.trim();
      setButtonLike(el, editing, label);
    });
    scope.querySelectorAll(".attack-col .c").forEach((el) => {
      const used = el.classList.contains("used");
      setButtonLike(el, editing, "\u5207\u6362\u6280\u672F\u662F\u5426\u547D\u4E2D\uFF1A" + el.textContent.trim());
      if (editing) el.setAttribute("aria-pressed", String(used));
    });
  }
  function markEditableLeaves(on, scope) {
    const root = scope || shell;
    if (!on) {
      root.querySelectorAll('[contenteditable="true"]').forEach((el) => {
        if (el.closest(".tool-anchor,.edit-bar")) return;
        el.removeAttribute("contenteditable");
      });
      return;
    }
    const candidates = [];
    if (scope && scope.matches && scope.matches(EDITABLE_SELECTOR))
      candidates.push(scope);
    root.querySelectorAll(EDITABLE_SELECTOR).forEach((el) => candidates.push(el));
    candidates.forEach((el) => {
      if (el.closest(".tool-anchor,.edit-bar")) return;
      const gate = el.closest("[data-edit], .page[data-noedit]");
      if (gate && gate.matches(".page[data-noedit]")) return;
      if (el.parentElement && el.parentElement.closest('[contenteditable="true"]'))
        return;
      el.setAttribute("contenteditable", "true");
    });
  }
  function applyGuards() {
    shell.querySelectorAll(REWIRED_CONTROLS_SEL + ",.tool-anchor").forEach((el) => el.setAttribute("contenteditable", "false"));
    labelButtons(shell);
    syncEditingA11y();
  }
  function runSilently(fn) {
    incWriteDepth();
    try {
      return fn();
    } finally {
      setTimeout(() => {
        decWriteDepth();
      }, 0);
    }
  }
  function setEditing(on) {
    setEditingState(on);
    body.classList.toggle("editing", editing);
    if (editing) {
      markEditableLeaves(true);
      applyGuards();
      btnToggle.textContent = "\u2713 \u5B8C\u6210";
      btnToggle.title = "\u9000\u51FA\u7F16\u8F91\u6A21\u5F0F";
      btnToggle.setAttribute("aria-pressed", "true");
      elStatus.textContent = "\u7F16\u8F91\u4E2D";
    } else {
      markEditableLeaves(false);
      safeAutoPaginate();
      try {
        rebuildToc();
      } catch (err) {
        console.error("[ir-report] toc rebuild failed", err);
      }
      btnToggle.textContent = "\u270E \u7F16\u8F91";
      btnToggle.title = "\u8FDB\u5165\u7F16\u8F91\u6A21\u5F0F";
      btnToggle.setAttribute("aria-pressed", "false");
      elStatus.textContent = "\u6D4F\u89C8\u6A21\u5F0F";
      syncEditingA11y();
    }
    labelButtons(shell);
  }
  function insertPlainTextWithBreaks(text) {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const frag = document.createDocumentFragment();
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (i > 0) frag.appendChild(document.createElement("br"));
      if (line) frag.appendChild(document.createTextNode(line));
    });
    const last = frag.lastChild;
    range.insertNode(frag);
    if (!last) return;
    setCollapsedSelection((after) => {
      if (last.nodeType === 3) after.setStart(last, last.length);
      else after.setStartAfter(last);
    });
  }
  function maybeBulletAutoformat() {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    const node = r.startContainer;
    if (node.nodeType !== 3) return;
    const offset = r.startOffset;
    if (offset < 1) return;
    const markerPos = offset - 1;
    const marker = node.data[markerPos];
    if (marker !== "-" && marker !== "*" && marker !== "+") return;
    const parent = node.parentElement;
    if (!parent || !parent.matches(MULTILINE_SELECTOR)) return;
    let i = markerPos;
    while (i > 0 && /\s/.test(node.data[i - 1])) i--;
    if (i > 0) return;
    const prev = node.previousSibling;
    if (prev && !(prev.nodeType === 1 && prev.tagName === "BR")) return;
    node.data = node.data.slice(0, markerPos) + "\u2022" + node.data.slice(markerPos + 1);
    setCollapsedSelection((after) => after.setStart(node, markerPos + 1));
  }
  function maybeBulletContinuation() {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const r = sel.getRangeAt(0);
    const node = r.startContainer;
    if (node.nodeType !== 3) return false;
    const parent = node.parentElement;
    if (!parent || !parent.matches(MULTILINE_SELECTOR)) return false;
    let lineText = node.data.slice(0, r.startOffset);
    let prev = node.previousSibling;
    while (prev && !(prev.nodeType === 1 && prev.tagName === "BR")) {
      lineText = (prev.textContent || "") + lineText;
      prev = prev.previousSibling;
    }
    const m = lineText.match(/^\s*•\s/);
    if (!m) return false;
    const restOfLine = lineText.slice(m[0].length);
    if (restOfLine.trim() === "") {
      const bulletStart = node.data.lastIndexOf("\u2022", r.startOffset);
      node.data = node.data.slice(0, bulletStart) + node.data.slice(r.startOffset);
      const br = document.createElement("br");
      node.parentNode.insertBefore(br, node.nextSibling);
      setCollapsedSelection((after) => after.setStart(node, bulletStart));
      return true;
    }
    document.execCommand("insertLineBreak");
    document.execCommand("insertText", false, "\u2022 ");
    return true;
  }
  function setupShellEvents() {
    shell.addEventListener("paste", (e) => {
      if (!editing) return;
      const dt = e.clipboardData || window.clipboardData;
      const file = findImageInDT(dt);
      if (file) {
        e.preventDefault();
        insertImageFromFile(file);
        return;
      }
      e.preventDefault();
      insertPlainTextWithBreaks(dt.getData("text/plain"));
    });
    shell.addEventListener("dragover", (e) => {
      if (editing && hasImage(e.dataTransfer)) e.preventDefault();
    });
    shell.addEventListener("drop", (e) => {
      if (!editing) return;
      const files = imagesFromDT(e.dataTransfer);
      if (!files.length) return;
      e.preventDefault();
      placeCaretFromPoint(e.clientX, e.clientY);
      files.forEach(insertImageFromFile);
    });
    shell.addEventListener("keydown", (e) => {
      if (!editing) return;
      if (e.key === "Enter" || e.key === " ") {
        const active = document.activeElement;
        const status = active && active.matches && active.matches(".action .status");
        const attackCell = active && active.matches && active.matches(".attack-col .c");
        if (status || attackCell) {
          e.preventDefault();
          if (status) cycleStatus(active);
          if (attackCell) cycleAttackCell(active);
          return;
        }
      }
      if (e.key === " ") maybeBulletAutoformat();
      if (e.key === "Enter") {
        const active = document.activeElement;
        const inProse = active && active.matches && active.matches(MULTILINE_SELECTOR);
        if (!inProse) {
          e.preventDefault();
          return;
        }
        if (!e.shiftKey && maybeBulletContinuation()) {
          e.preventDefault();
          return;
        }
        if (!e.shiftKey) {
          e.preventDefault();
          document.execCommand("insertLineBreak");
        }
        return;
      }
      if (e.key === "Backspace") {
        const s = document.getSelection();
        if (!s || !s.rangeCount || !s.isCollapsed) return;
        const r = s.getRangeAt(0);
        const anchor = asElement(r.startContainer);
        const host = anchor && anchor.closest('[contenteditable="true"]');
        if (!host) return;
        const probe = document.createRange();
        probe.selectNodeContents(host);
        probe.setEnd(r.startContainer, r.startOffset);
        if (probe.toString().length !== 0) return;
        const prev = host.previousElementSibling;
        if (!prev) return;
        if (prev.classList && prev.classList.contains("img-wrap")) {
          e.preventDefault();
          prev.remove();
          return;
        }
        const hostEmpty = host.childNodes.length === 0 || host.textContent.trim() === "" && !host.querySelector("img, figure");
        if (hostEmpty && host.tagName === "P" && prev.getAttribute("contenteditable") === "true") {
          e.preventDefault();
          host.remove();
          const nr = document.createRange();
          nr.selectNodeContents(prev);
          nr.collapse(false);
          s.removeAllRanges();
          s.addRange(nr);
          if (prev.focus) prev.focus();
        }
      }
    });
    shell.addEventListener("input", () => {
      if (!editing) return;
      const sel = document.getSelection();
      const node = sel && sel.anchorNode;
      if (!node) return;
      const host = asElement(node);
      const el = host ? host.closest("[data-var]") : null;
      if (!el) return;
      const name = el.getAttribute("data-var");
      const peers = shell.querySelectorAll('[data-var="' + CSS.escape(name) + '"]');
      if (name === "date") {
        const canon = el.textContent.replace(/\D/g, "");
        if (canon.length !== 8) return;
        peers.forEach((peer) => {
          if (peer === el) return;
          const next = renderDate(canon, peer.getAttribute("data-format") || "compact");
          if (peer.textContent !== next) peer.textContent = next;
        });
        return;
      }
      const value = el.textContent;
      peers.forEach((peer) => {
        if (peer !== el && peer.textContent !== value) peer.textContent = value;
      });
    });
  }

  // src/structures.js
  function wireStructures() {
    wirePageTools();
    shell.querySelectorAll("figure.img-wrap").forEach(addImageTools);
    shell.querySelectorAll("h3.sub").forEach(wireSubSectionTools);
    shell.querySelectorAll(".timeline").forEach(wireTimeline);
    shell.querySelectorAll(".chain").forEach(wireChain);
    shell.querySelectorAll(".attack-grid").forEach(wireAttackGrid);
    shell.querySelectorAll(".actions").forEach(wireActions);
    wireAssetCards();
    shell.querySelectorAll(".toc").forEach((toc) => {
      toc.querySelectorAll(".toc-row").forEach(
        (row) => addDelete(row, "right:4px;top:4px;")
      );
      const tail = mkTail(
        '<button class="btn" data-act="toc-add">+ \u6761\u76EE</button><button class="btn" data-act="toc-add-sub">+ \u5B50\u6761\u76EE</button>'
      );
      toc.insertAdjacentElement("afterend", tail);
      tail.addEventListener("click", (e) => {
        const act = e.target.getAttribute("data-act");
        if (act !== "toc-add" && act !== "toc-add-sub") return;
        const row = document.createElement("div");
        row.className = "toc-row" + (act === "toc-add-sub" ? " sub" : "");
        row.innerHTML = '<div class="n">N</div><div class="t">\u6807\u9898<small>\u526F\u6807\u9898</small></div><div class="pg">NN</div>';
        toc.appendChild(row);
        addDelete(row, "right:4px;top:4px;");
      });
    });
    shell.querySelectorAll(".rev").forEach(wireRev);
    shell.querySelectorAll(".cover-meta").forEach(
      (meta) => wireSimpleList(
        meta,
        ":scope > .cell",
        "+ \u5143\u4FE1\u606F",
        (c) => {
          const cell = document.createElement("div");
          cell.className = "cell";
          cell.innerHTML = '<div class="k">\u540D\u79F0</div><div class="v">\u503C<small>\u8BF4\u660E</small></div>';
          c.appendChild(cell);
          return cell;
        },
        "right:4px;top:2px;"
      )
    );
    wireKvGroups();
  }
  function rewire() {
    runSilently(() => {
      shell.querySelectorAll(REWIRED_CONTROLS_SEL).forEach((n) => n.remove());
      shell.querySelectorAll(".chain.dynamic").forEach((c) => c.classList.remove("dynamic"));
      applyGuards();
      wireStructures();
      renumberSubsections();
      checkOverflow();
    });
  }

  // src/history.js
  var MAX_HISTORY = 50;
  var MAX_HISTORY_CHARS = 20 * 1024 * 1024;
  var historyStack = [];
  var futureStack = [];
  var historyChars = 0;
  var lastGoodHtml = null;
  function setLastGoodHtml(v) {
    lastGoodHtml = v;
  }
  function updateUndoBtn() {
    btnUndo.disabled = historyStack.length === 0;
    btnRedo.disabled = futureStack.length === 0;
  }
  function shiftOldest(stack) {
    const s = stack.shift();
    if (s !== void 0) historyChars -= s.length;
    return s;
  }
  function pushStack(stack, snap) {
    stack.push(snap);
    historyChars += snap.length;
    evictStacks();
  }
  function popStack(stack) {
    const s = stack.pop();
    if (s !== void 0) historyChars -= s.length;
    return s;
  }
  function clearStack(stack) {
    while (stack.length) shiftOldest(stack);
  }
  function evictStacks() {
    while (historyStack.length > MAX_HISTORY) shiftOldest(historyStack);
    while (futureStack.length > MAX_HISTORY) shiftOldest(futureStack);
    while (historyChars > MAX_HISTORY_CHARS && historyStack.length)
      shiftOldest(historyStack);
    while (historyChars > MAX_HISTORY_CHARS && futureStack.length)
      shiftOldest(futureStack);
  }
  function stripInjectedControls(root, includeBanner) {
    const sel = REWIRED_CONTROLS_SEL + (includeBanner ? ",.draft-banner" : "");
    root.querySelectorAll(sel).forEach((n) => n.remove());
    root.querySelectorAll(".page.overflow").forEach((n) => n.classList.remove("overflow"));
    root.querySelectorAll(".chain.dynamic").forEach((n) => {
      const cols = n.querySelectorAll(".step").length;
      n.classList.remove("dynamic");
      if (cols) n.style.gridTemplateColumns = "repeat(" + cols + ",1fr)";
    });
  }
  function serializeShellForDraft() {
    const c = shell.cloneNode(true);
    stripInjectedControls(c);
    return c.innerHTML;
  }
  function restoreSnapshot(html, prefix) {
    runSilently(() => {
      shell.innerHTML = html;
      rewire();
      if (editing) markEditableLeaves(true);
      lastGoodHtml = html;
      doSave(html, prefix);
      updateUndoBtn();
    });
  }
  function step(from, to, prefix) {
    if (!from.length) return;
    pushStack(to, serializeShellForDraft());
    restoreSnapshot(popStack(from), prefix);
  }
  var undo = () => step(historyStack, futureStack, "\u5DF2\u64A4\u9500");
  var redo = () => step(futureStack, historyStack, "\u5DF2\u91CD\u505A");
  var saveTimer = null;
  function scheduleSave() {
    if (!editing || writeDepth > 0) return;
    elStatus.textContent = "\u672A\u4FDD\u5B58\u2026";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      runSilently(() => {
        const snap = serializeShellForDraft();
        if (lastGoodHtml != null && snap !== lastGoodHtml) {
          pushStack(historyStack, lastGoodHtml);
          clearStack(futureStack);
        }
        doSave(snap, "\u5DF2\u4FDD\u5B58");
        lastGoodHtml = snap;
        updateUndoBtn();
      });
    }, 500);
  }
  async function doSave(html, prefix) {
    try {
      await idb.set(KEY, { html, savedAt: (/* @__PURE__ */ new Date()).toISOString() });
      body.classList.add("has-draft");
      elStatus.textContent = (prefix || "\u5DF2\u4FDD\u5B58") + " " + hms();
    } catch (err) {
      elStatus.textContent = "\u4FDD\u5B58\u5931\u8D25";
      console.error("[ir-report] autosave failed", err);
    }
  }
  function setupObserver() {
    const observer = new MutationObserver((muts) => {
      if (writeDepth > 0) return;
      let saved = false;
      for (const m of muts) {
        const t = m.target;
        if (t && t.nodeType === 1 && t.closest && t.closest(".tool-anchor,.item-tools,.tail-tools,.page-tools,.edit-bar,.draft-banner"))
          continue;
        if (editing && m.type === "childList") {
          m.addedNodes.forEach((node) => {
            if (node.nodeType === 1) markEditableLeaves(true, node);
          });
        }
        if (!saved) {
          scheduleSave();
          saved = true;
        }
      }
    });
    observer.observe(shell, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }
  function showDraftBanner(savedAt) {
    const banner = document.createElement("div");
    banner.className = "draft-banner";
    banner.setAttribute("contenteditable", "false");
    const t = new Date(savedAt);
    const ts = t.getFullYear() + "/" + pad2(t.getMonth() + 1) + "/" + pad2(t.getDate()) + " " + pad2(t.getHours()) + ":" + pad2(t.getMinutes());
    banner.innerHTML = '<span class="k">\u53D1\u73B0\u8349\u7A3F</span><span>' + ts + '</span><button class="primary" data-act="load">\u52A0\u8F7D</button><button data-act="skip">\u7A0D\u540E</button><button data-act="drop">\u653E\u5F03</button>';
    labelButtons(banner);
    document.body.appendChild(banner);
    banner.addEventListener("click", async (e) => {
      const act = e.target.getAttribute("data-act");
      if (act === "load") {
        try {
          const data = await idb.get(KEY);
          if (data && data.html) {
            clearStack(historyStack);
            clearStack(futureStack);
            restoreSnapshot(data.html, "\u5DF2\u52A0\u8F7D");
          }
        } catch (err) {
          console.error(err);
        }
        banner.remove();
      } else if (act === "skip") {
        banner.remove();
      } else if (act === "drop") {
        try {
          await idb.del(KEY);
        } catch (err) {
          console.error(err);
        }
        body.classList.remove("has-draft");
        banner.remove();
      }
    });
  }

  // src/export.js
  function todayStamp() {
    const t = /* @__PURE__ */ new Date();
    return t.getFullYear() + pad2(t.getMonth() + 1) + pad2(t.getDate());
  }
  function exportFilename() {
    const clientEl = shell.querySelector(".client");
    const rawClient = clientEl ? textExcluding(clientEl, "small").replace(/[\[\]]/g, "") : "";
    const client = rawClient.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").trim() || "\u5BA2\u6237";
    const date = (shell.querySelector('[data-var="date"]')?.textContent || todayStamp()).replace(/\D/g, "");
    const seq = (shell.querySelector('[data-var="sir-seq"]')?.textContent || "01").trim();
    return client + "-\u5B89\u5168\u4E8B\u4EF6\u5E94\u6025\u54CD\u5E94\u62A5\u544A-" + date + "-" + seq;
  }
  function triggerPrint() {
    safeAutoPaginate();
    const prev = document.title;
    document.title = exportFilename();
    const restore = () => {
      document.title = prev;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }
  var MSG_FILE_ORIGIN_HINT = "\u76F4\u63A5\u53CC\u51FB index.html \u6253\u5F00\u65F6\uFF0C\u6D4F\u89C8\u5668\u4F1A\u963B\u6B62 file:// \u4E0B\u7684\u8DE8\u6E90\u6293\u53D6\uFF0C\u65E0\u6CD5\u5185\u8054 CSS/JS/\u5B57\u4F53\u3002\u8BF7\u6539\u7528 HTTP \u65B9\u5F0F\u6253\u5F00\uFF08\u4F8B\u5982\u5728\u9879\u76EE\u76EE\u5F55\u8DD1 `python3 -m http.server`\uFF0C\u6216\u76F4\u63A5\u8BBF\u95EE\u5185\u90E8\u90E8\u7F72\u5730\u5740\uFF09\uFF0C\u518D\u91CD\u8BD5\u5BFC\u51FA\uFF1B\u82E5\u53EA\u662F\u60F3\u7EE7\u7EED\u7F16\u8F91\uFF0C\u5DF2\u5BFC\u51FA\u8FC7\u7684\u5355\u6587\u4EF6 HTML \u5FEB\u7167\u4ECD\u53EF\u53CC\u51FB\u6253\u5F00\u4F7F\u7528\u3002";
  function canBuildHtmlSnapshot() {
    if (location.protocol !== "file:") return true;
    const cssExternal = document.getElementById("editor-style")?.tagName === "LINK";
    const jsExternal = !!document.getElementById("editor-script")?.src;
    return !cssExternal && !jsExternal;
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async function getCssText() {
    const el = document.getElementById("editor-style");
    if (el && el.tagName === "STYLE") return el.textContent;
    const res = await fetch("editor.css");
    if (!res.ok) throw new Error("fetch editor.css: " + res.status);
    return res.text();
  }
  async function getJsText() {
    const el = document.getElementById("editor-script");
    if (el && el.tagName === "SCRIPT" && !el.src) return el.textContent;
    const res = await fetch("editor.js");
    if (!res.ok) throw new Error("fetch editor.js: " + res.status);
    return res.text();
  }
  async function fetchAsDataUrl(url, mime) {
    const res = await fetch(url);
    if (!res.ok) return null;
    return readAsDataURL(await res.blob(), mime);
  }
  async function inlineFontsInCss(cssText) {
    const re = /url\(\s*["']?((?:\.\/)?assets\/fonts\/[^"')\s]+\.woff2)["']?\s*\)/g;
    const urls = /* @__PURE__ */ new Set();
    let m;
    while (m = re.exec(cssText)) urls.add(m[1]);
    if (urls.size === 0) return cssText;
    const map = /* @__PURE__ */ new Map();
    await Promise.all(
      [...urls].map(async (u) => {
        try {
          const data = await fetchAsDataUrl(u, "font/woff2");
          if (data) map.set(u, data);
        } catch (err) {
          console.error("font inline:", u, err);
        }
      })
    );
    return cssText.replace(re, (match, u) => {
      const data = map.get(u);
      return data ? 'url("' + data + '")' : match;
    });
  }
  async function getLogoDataUri() {
    const existing = document.querySelector("img.brand-logo");
    if (existing && existing.src.startsWith("data:")) return existing.src;
    try {
      return await fetchAsDataUrl("assets/logo.png", "image/png");
    } catch (err) {
      console.error("logo inline:", err);
      return null;
    }
  }
  async function buildHtmlSnapshot() {
    safeAutoPaginate();
    const [cssRaw, jsText, logoDataUri] = await Promise.all([
      getCssText(),
      getJsText(),
      getLogoDataUri()
    ]);
    const cssText = await inlineFontsInCss(cssRaw);
    const clone = document.documentElement.cloneNode(true);
    const link = clone.querySelector("#editor-style");
    if (link) {
      const style = document.createElement("style");
      style.id = "editor-style";
      style.textContent = cssText;
      link.replaceWith(style);
    }
    const script = clone.querySelector("#editor-script");
    if (script) {
      const inline = document.createElement("script");
      inline.id = "editor-script";
      inline.textContent = jsText;
      script.replaceWith(inline);
    }
    if (logoDataUri) {
      clone.querySelectorAll('img[src="assets/logo.png"]').forEach(
        (img) => img.setAttribute("src", logoDataUri)
      );
    }
    stripInjectedControls(clone, true);
    clone.querySelectorAll("#edHtml[disabled],#edPdf[disabled]").forEach(
      (el) => el.removeAttribute("disabled")
    );
    const statusClone = clone.querySelector("#edStatus");
    if (statusClone) statusClone.textContent = "\u6D4F\u89C8\u6A21\u5F0F";
    clone.querySelector("body")?.classList.remove("has-draft");
    const html = "<!doctype html>\n" + clone.outerHTML;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, exportFilename() + ".html");
  }

  // src/main.js
  initViewport();
  setupShellEvents();
  setupObserver();
  labelButtons(document);
  btnToggle.setAttribute("aria-pressed", "false");
  btnToggle.addEventListener("click", () => setEditing(!editing));
  btnPdf.addEventListener("click", triggerPrint);
  btnHtml.addEventListener("click", async () => {
    if (!canBuildHtmlSnapshot()) {
      alert(MSG_FILE_ORIGIN_HINT);
      return;
    }
    btnHtml.disabled = true;
    btnPdf.disabled = true;
    const prevStatus = elStatus.textContent;
    elStatus.textContent = "\u751F\u6210 HTML \u7559\u6863\u2026";
    try {
      await buildHtmlSnapshot();
    } catch (err) {
      console.error(err);
      alert("\u751F\u6210 HTML \u7559\u6863\u5931\u8D25\uFF0C\u8BE6\u60C5\u89C1\u6D4F\u89C8\u5668\u63A7\u5236\u53F0\u3002");
    } finally {
      elStatus.textContent = prevStatus;
      btnHtml.disabled = false;
      btnPdf.disabled = false;
    }
  });
  btnUndo.addEventListener("click", undo);
  btnRedo.addEventListener("click", redo);
  btnDiscard.addEventListener("click", async () => {
    if (!confirm("\u653E\u5F03\u6D4F\u89C8\u5668\u4E2D\u7684\u8349\u7A3F\uFF1F\u5F53\u524D\u7F16\u8F91\u5C06\u56DE\u5230\u78C1\u76D8\u7248\u672C\u3002")) return;
    try {
      await idb.del(KEY);
    } catch (err) {
      console.error(err);
    }
    body.classList.remove("has-draft");
    location.reload();
  });
  var exportMenu = document.querySelector(".export-menu");
  var btnExport = document.getElementById("edExport");
  function setExportOpen(open2) {
    if (btnExport) btnExport.setAttribute("aria-expanded", String(open2));
  }
  if (exportMenu && btnExport) {
    exportMenu.addEventListener("mouseenter", () => setExportOpen(true));
    exportMenu.addEventListener("mouseleave", () => setExportOpen(false));
    exportMenu.addEventListener("focusin", () => setExportOpen(true));
    exportMenu.addEventListener("focusout", () => {
      setTimeout(
        () => setExportOpen(exportMenu.contains(document.activeElement)),
        0
      );
    });
  }
  var btnHelp = document.getElementById("edHelp");
  var helpOverlay = document.getElementById("help-overlay");
  var helpClose = helpOverlay.querySelector(".help-close");
  var helpRestoreFocus = null;
  function setHelpOpen(open2) {
    if (open2) {
      helpRestoreFocus = document.activeElement;
      helpOverlay.hidden = false;
      btnHelp.setAttribute("aria-expanded", "true");
      setTimeout(() => {
        (helpClose || helpOverlay).focus();
      }, 0);
    } else {
      helpOverlay.hidden = true;
      btnHelp.setAttribute("aria-expanded", "false");
      if (helpRestoreFocus && typeof helpRestoreFocus.focus === "function")
        helpRestoreFocus.focus();
      helpRestoreFocus = null;
    }
  }
  function trapHelpFocus(e) {
    if (helpOverlay.hidden || e.key !== "Tab") return;
    const focusables = Array.from(
      helpOverlay.querySelectorAll(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.disabled);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  btnHelp.addEventListener("click", () => setHelpOpen(true));
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay || e.target.closest(".help-close"))
      setHelpOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !helpOverlay.hidden) setHelpOpen(false);
    trapHelpFocus(e);
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (!editing) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "z" && e.shiftKey || k === "y") {
        e.preventDefault();
        redo();
      } else if (k === "b") {
        e.preventDefault();
        document.execCommand("bold");
      }
    },
    true
  );
  runSilently(() => {
    applyGuards();
    wireStructures();
    renumberSubsections();
    renumberFooters();
    checkOverflow();
  });
  setLastGoodHtml(serializeShellForDraft());
  updateUndoBtn();
  (async () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.html) await idb.set(KEY, data);
        localStorage.removeItem(KEY);
      }
    } catch (err) {
      console.error(err);
    }
    try {
      const data = await idb.get(KEY);
      if (data && data.html) {
        body.classList.add("has-draft");
        showDraftBanner(data.savedAt || (/* @__PURE__ */ new Date()).toISOString());
      }
    } catch (err) {
      console.error(err);
    }
  })();
})();
