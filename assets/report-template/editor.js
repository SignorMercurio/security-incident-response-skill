(function () {
    "use strict";

    const KEY = "ir-report.draft.v1";
    const shell = document.getElementById("report-root");
    const body = document.body;

    // IDB KV store — draft HTML with embedded base64 images can
    // exceed localStorage's 5MB cap on reports with many figures.
    const idb = (() => {
        let dbp;
        function open() {
            if (dbp) return dbp;
            dbp = new Promise((res, rej) => {
                const req = indexedDB.open("ir-report", 1);
                req.onupgradeneeded = () =>
                    req.result.createObjectStore("kv");
                req.onsuccess = () => res(req.result);
                req.onerror = () => rej(req.error);
            });
            return dbp;
        }
        function tx(mode, fn) {
            return open().then(
                (db) =>
                    new Promise((res, rej) => {
                        const t = db.transaction("kv", mode);
                        const req = fn(t.objectStore("kv"));
                        t.oncomplete = () =>
                            res(req ? req.result : undefined);
                        t.onerror = () => rej(t.error);
                        t.onabort = () => rej(t.error);
                    }),
            );
        }
        return {
            get: (k) => tx("readonly", (s) => s.get(k)),
            set: (k, v) => tx("readwrite", (s) => s.put(v, k)),
            del: (k) => tx("readwrite", (s) => s.delete(k)),
        };
    })();
    const elStatus = document.getElementById("edStatus");
    const btnToggle = document.getElementById("edToggle");
    const btnPdf = document.getElementById("edPdf");
    const btnDiscard = document.getElementById("edDiscard");

    const pad2 = (n) => String(n).padStart(2, "0");
    const hms = () => {
        const t = new Date();
        return (
            pad2(t.getHours()) +
            ":" +
            pad2(t.getMinutes()) +
            ":" +
            pad2(t.getSeconds())
        );
    };

    // Per-block editable leaves. Everything NOT in this list stays
    // non-editable, which keeps the browser's default Enter/Backspace/Delete
    // behavior scoped to a single text block.
    const EDITABLE_SELECTOR = [
        // Prose blocks
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
        // KV / KPI / cover meta cells
        ".kv .k",
        ".kv .v",
        ".cover-meta .k",
        ".cover-meta .v",
        ".cover-meta small",
        // Timeline / chain / actions
        ".timeline .t",
        ".timeline .h",
        ".timeline .ts",
        ".chain .step .n",
        ".chain .step .t",
        ".chain .step .d",
        ".chain .step .label",
        ".chain .step .ttl",
        ".action .n",
        ".action .t",
        ".action .d",
        ".action .status",
        // Callout / revision / attack / assets
        ".callout .k",
        ".rev .hd",
        ".rev .cl",
        ".attack-col .h",
        ".attack-col .c",
        ".asset-card .idx",
        ".asset-card .field .k",
        ".asset-card .field .v",
        // TOC
        ".toc-row .n",
        ".toc-row .t",
        ".toc-row .pg",
        // Cover hero / colophon phases
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
        // Runheads (runfoots are auto-rendered — never editable)
        ".runhead .brand",
        ".runhead .sec",
        ".runhead .cls",
        ".end-rule",
    ].join(",");

    // Where Enter inserts <br>; everywhere else Enter is suppressed so
    // single-line cells (cover meta, KV, headings, table cells) don't break layout.
    const MULTILINE_SELECTOR = "p, li, blockquote";

    // Blocks an inserted image can sit next to as a block sibling.
    const IMAGE_BLOCK_HOST = "p, h2, h3, h4, li, blockquote";

    function markEditableLeaves(on, scope) {
        const root = scope || shell;
        if (!on) {
            root.querySelectorAll('[contenteditable="true"]').forEach(
                (el) => {
                    if (el.closest(".tool-anchor,.edit-bar")) return;
                    el.removeAttribute("contenteditable");
                },
            );
            return;
        }
        // Also mark the scope root itself if it matches (addedNode case).
        const candidates = [];
        if (
            scope &&
            scope.matches &&
            scope.matches(EDITABLE_SELECTOR)
        )
            candidates.push(scope);
        root.querySelectorAll(EDITABLE_SELECTOR).forEach((el) =>
            candidates.push(el),
        );
        candidates.forEach((el) => {
            if (el.closest(".tool-anchor,.edit-bar")) return;
            // data-edit opts individual regions back in within a data-noedit page.
            const gate = el.closest("[data-edit], .page[data-noedit]");
            if (gate && gate.matches(".page[data-noedit]")) return;
            // First match wins — children of an already-editable ancestor stay implicit.
            if (
                el.parentElement &&
                el.parentElement.closest('[contenteditable="true"]')
            )
                return;
            el.setAttribute("contenteditable", "true");
        });
    }

    function applyGuards() {
        // Tool anchors already get contenteditable="false" at creation —
        // this is a defensive pass for anything restored from a draft.
        shell
            .querySelectorAll(
                ".tool-anchor,.item-tools,.tail-tools",
            )
            .forEach((el) =>
                el.setAttribute("contenteditable", "false"),
            );
    }

    let editing = false;
    // Internal-write shield. Any code path that mutates the shell on our
    // behalf (boot, rewire, undo, the autosave post-processing pass) stacks
    // this up so the MutationObserver ignores its own churn.
    let writeDepth = 0;
    function runSilently(fn) {
        writeDepth++;
        try {
            return fn();
        } finally {
            // Defer one task so the shield outlasts the mutation-callback
            // microtask queue that innerHTML/setAttribute schedule.
            setTimeout(() => {
                writeDepth--;
            }, 0);
        }
    }

    function setEditing(on) {
        editing = !!on;
        body.classList.toggle("editing", editing);
        if (editing) {
            markEditableLeaves(true);
            applyGuards();
            btnToggle.textContent = "✓ 完成";
            btnToggle.title = "退出编辑模式";
            elStatus.textContent = "编辑中";
        } else {
            markEditableLeaves(false);
            // Re-layout now that the user is done editing.
            // Skipped mid-edit (see scheduleSave) so the caret doesn't jump.
            try {
                autoPaginate();
            } catch (err) {
                console.error(
                    "[ir-report] auto-paginate failed",
                    err,
                );
            }
            try {
                rebuildToc();
            } catch (err) {
                console.error(
                    "[ir-report] toc rebuild failed",
                    err,
                );
            }
            btnToggle.textContent = "✎ 编辑";
            btnToggle.title = "进入编辑模式";
            elStatus.textContent = "浏览模式";
        }
    }

    // Paste: image from clipboard → insert inline; otherwise plain text.
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
        document.execCommand(
            "insertText",
            false,
            dt.getData("text/plain"),
        );
    });

    // Drag-drop images from OS
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

    function findImageInDT(dt) {
        if (!dt || !dt.items) return null;
        for (const it of dt.items) {
            if (it.type && it.type.startsWith("image/"))
                return it.getAsFile();
        }
        return null;
    }
    function imagesFromDT(dt) {
        return [...((dt && dt.files) || [])].filter((f) =>
            f.type.startsWith("image/"),
        );
    }
    function hasImage(dt) {
        if (!dt) return false;
        if (
            dt.items &&
            [...dt.items].some(
                (i) => i.type && i.type.startsWith("image/"),
            )
        )
            return true;
        if (
            dt.files &&
            [...dt.files].some((f) =>
                f.type.startsWith("image/"),
            )
        )
            return true;
        return false;
    }
    function readAsDataURL(file) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(file);
        });
    }
    // Downscale oversized images so a report with many screenshots
    // stays under IDB quotas and produces a manageable export.
    function downscaleIfNeeded(dataUrl, maxW = 1600) {
        return new Promise((res) => {
            const img = new Image();
            img.onload = () => {
                if (img.naturalWidth <= maxW) return res(dataUrl);
                const scale = maxW / img.naturalWidth;
                const c = document.createElement("canvas");
                c.width = maxW;
                c.height = Math.round(
                    img.naturalHeight * scale,
                );
                c.getContext("2d").drawImage(
                    img,
                    0,
                    0,
                    c.width,
                    c.height,
                );
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
        wrap.appendChild(img);
        return wrap;
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
    // Images always land as a block-level sibling of the nearest prose block,
    // never inside a narrow grid cell / KV / heading — keeps the layout intact.
    // After insertion, caret moves to a paragraph after the figure so the user
    // can keep typing (and a subsequent Backspace can delete the image, per keydown).
    function insertImageBlock(node) {
        const sel = document.getSelection();
        let host = null;
        if (sel && sel.anchorNode) {
            const base =
                sel.anchorNode.nodeType === 3
                    ? sel.anchorNode.parentElement
                    : sel.anchorNode;
            host = base && base.closest(IMAGE_BLOCK_HOST);
        }
        if (!host) {
            const pages = shell.querySelectorAll(".page");
            if (pages.length) {
                const page = pages[pages.length - 1];
                const foot = page.querySelector(".runfoot");
                const anchor = foot || null;
                if (anchor) {
                    page.insertBefore(node, anchor);
                } else {
                    page.appendChild(node);
                }
                focusAfterFigure(node);
                return;
            }
            shell.appendChild(node);
            focusAfterFigure(node);
            return;
        }
        host.parentElement.insertBefore(node, host.nextSibling);
        focusAfterFigure(node);
    }
    function focusAfterFigure(figure) {
        const next = figure.nextElementSibling;
        // Reuse only if the next sibling is a throwaway empty <p> —
        // otherwise we'd prepend the user's text to existing content.
        const reusable =
            next &&
            next.tagName === "P" &&
            next.textContent.trim() === "";
        let target;
        if (reusable) {
            target = next;
        } else {
            target = document.createElement("p");
            target.appendChild(document.createElement("br"));
            figure.parentElement.insertBefore(
                target,
                figure.nextSibling,
            );
            if (editing)
                target.setAttribute("contenteditable", "true");
        }
        const r = document.createRange();
        r.selectNodeContents(target);
        r.collapse(true);
        const s = document.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        if (target.focus) target.focus();
    }
    function placeCaretFromPoint(x, y) {
        let r =
            document.caretRangeFromPoint &&
            document.caretRangeFromPoint(x, y);
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
    shell.addEventListener("keydown", (e) => {
        if (!editing) return;
        if (e.key === "Enter") {
            // Only allow Enter inside prose blocks; single-line leaves
            // (headings, KV cells, cover meta, etc.) refuse Enter so the
            // browser can't inject a <br> that breaks their layout.
            const active = document.activeElement;
            const inProse =
                active &&
                active.matches &&
                active.matches(MULTILINE_SELECTOR);
            if (!inProse) {
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
            // Extend native Backspace across block boundaries for two
            // cases the browser can't handle on its own under
            // per-block contenteditable:
            //   1. caret at start of block, previous sibling is an
            //      inserted image figure → delete the image
            //   2. caret at start of an *empty* <p> whose previous
            //      sibling is another editable block → remove the
            //      empty <p>, merge caret back into the previous block
            const s = document.getSelection();
            if (!s || !s.rangeCount || !s.isCollapsed) return;
            const r = s.getRangeAt(0);
            const anchor =
                r.startContainer.nodeType === 3
                    ? r.startContainer.parentElement
                    : r.startContainer;
            const host =
                anchor && anchor.closest('[contenteditable="true"]');
            if (!host) return;
            const probe = document.createRange();
            probe.selectNodeContents(host);
            probe.setEnd(r.startContainer, r.startOffset);
            if (probe.toString().length !== 0) return;
            const prev = host.previousElementSibling;
            if (!prev) return;
            if (
                prev.classList &&
                prev.classList.contains("img-wrap")
            ) {
                e.preventDefault();
                prev.remove();
                return;
            }
            const hostEmpty =
                host.childNodes.length === 0 ||
                (host.textContent.trim() === "" &&
                    !host.querySelector("img, figure"));
            if (
                hostEmpty &&
                host.tagName === "P" &&
                prev.getAttribute("contenteditable") === "true"
            ) {
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

    // data-var="date" peers render via their own data-format; the
    // source is canonical YYYYMMDD. Mid-edit (non-8-digit) input
    // no-ops so typing doesn't flicker peers.
    function renderDate(canonical, format) {
        const y = canonical.slice(0, 4);
        const m = canonical.slice(4, 6);
        const d = canonical.slice(6, 8);
        if (format === "slash") return y + "/" + m + "/" + d;
        if (format === "slash-pad")
            return y + " / " + m + " / " + d;
        return y + m + d;
    }
    shell.addEventListener("input", () => {
        if (!editing) return;
        // `input` on a contenteditable root fires with e.target === shell,
        // so locate the edited span via the caret selection instead.
        const sel = document.getSelection();
        const node = sel && sel.anchorNode;
        if (!node) return;
        const host =
            node.nodeType === 3 ? node.parentElement : node;
        const el = host ? host.closest("[data-var]") : null;
        if (!el) return;
        const name = el.getAttribute("data-var");
        const peers = shell.querySelectorAll(
            '[data-var="' + CSS.escape(name) + '"]',
        );
        if (name === "date") {
            const canon = el.textContent.replace(/\D/g, "");
            if (canon.length !== 8) return;
            peers.forEach((peer) => {
                if (peer === el) return;
                const next = renderDate(
                    canon,
                    peer.getAttribute("data-format") || "compact",
                );
                if (peer.textContent !== next)
                    peer.textContent = next;
            });
            return;
        }
        const value = el.textContent;
        peers.forEach((peer) => {
            if (peer !== el && peer.textContent !== value)
                peer.textContent = value;
        });
    });

    function mkTail(html) {
        const el = document.createElement("div");
        el.className = "tail-tools tool-anchor";
        el.setAttribute("contenteditable", "false");
        el.innerHTML = html;
        return el;
    }
    function mkItemTools(pos, html) {
        const el = document.createElement("div");
        el.className = "item-tools";
        el.setAttribute("contenteditable", "false");
        el.style.cssText = pos;
        el.innerHTML = html;
        return el;
    }
    function addDelete(row, pos, onDeleted) {
        const t = mkItemTools(
            pos,
            '<button class="btn danger" data-act="row-del" title="删除">✕</button>',
        );
        row.appendChild(t);
        t.addEventListener("click", (e) => {
            if (e.target.getAttribute("data-act") !== "row-del")
                return;
            row.remove();
            if (onDeleted) onDeleted();
        });
    }

    // ---------- Timeline ----------
    function wireTimeline(tl) {
        tl.querySelectorAll(".tl-item").forEach(addTlItemTools);
        const tail = mkTail(
            '<button class="btn" data-act="tl-add">+ 时间点</button>',
        );
        tl.insertAdjacentElement("afterend", tail);
        tail.addEventListener("click", (e) => {
            if (e.target.getAttribute("data-act") !== "tl-add")
                return;
            const it = document.createElement("div");
            it.className = "tl-item";
            it.innerHTML =
                '<div class="t">YYYY/MM/DD · 时间</div><div class="h">事件标题</div><p>事件描述。</p>';
            tl.appendChild(it);
            addTlItemTools(it);
        });
    }
    function addTlItemTools(it) {
        const t = mkItemTools(
            "right:0;top:4px;",
            '<button class="btn" data-act="tl-acc" title="切换高亮">●</button>' +
                '<button class="btn danger" data-act="tl-del" title="删除">✕</button>',
        );
        it.appendChild(t);
        t.addEventListener("click", (e) => {
            const act = e.target.getAttribute("data-act");
            if (act === "tl-acc") it.classList.toggle("acc");
            if (act === "tl-del") it.remove();
        });
    }

    // ---------- Chain ----------
    function wireChain(ch) {
        ch.classList.add("dynamic");
        ch.style.setProperty(
            "--cols",
            ch.querySelectorAll(".step").length,
        );
        ch.querySelectorAll(".step").forEach((s) =>
            addStepTools(s, ch),
        );
        const tail = mkTail(
            '<button class="btn" data-act="chain-add">+ 步骤</button>',
        );
        ch.insertAdjacentElement("afterend", tail);
        tail.addEventListener("click", (e) => {
            if (e.target.getAttribute("data-act") !== "chain-add")
                return;
            const s = document.createElement("div");
            s.className = "step";
            s.innerHTML =
                '<div class="n">NN · 阶段</div><div class="ico"></div><div class="ttl">标题</div><div class="d">说明。</div>';
            ch.appendChild(s);
            addStepTools(s, ch);
            ch.style.setProperty(
                "--cols",
                ch.querySelectorAll(".step").length,
            );
        });
    }
    function addStepTools(step, ch) {
        const t = mkItemTools(
            "right:4px;top:4px;",
            '<button class="btn" data-act="step-acc" title="切换高亮">★</button>' +
                '<button class="btn danger" data-act="step-del" title="删除">✕</button>',
        );
        step.appendChild(t);
        t.addEventListener("click", (e) => {
            const act = e.target.getAttribute("data-act");
            if (act === "step-acc") step.classList.toggle("acc");
            if (act === "step-del") {
                step.remove();
                ch.style.setProperty(
                    "--cols",
                    ch.querySelectorAll(".step").length,
                );
            }
        });
    }

    // ---------- ATT&CK matrix ----------
    function wireAttackGrid(grid) {
        grid.querySelectorAll(".attack-col").forEach((col) =>
            addColTools(col),
        );
        const tail = mkTail(
            '<button class="btn" data-act="grid-add-col">+ 战术列</button>',
        );
        grid.insertAdjacentElement("afterend", tail);
        tail.addEventListener("click", (e) => {
            if (
                e.target.getAttribute("data-act") !== "grid-add-col"
            )
                return;
            const col = document.createElement("div");
            col.className = "attack-col";
            col.innerHTML =
                '<div class="h">新战术</div><div class="c">技术</div>';
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
            '<button class="btn" data-act="col-add" title="新增行">+</button>' +
                '<button class="btn danger" data-act="col-del" title="删除列">✕</button>',
        );
        if (h) h.appendChild(t);
        t.addEventListener("click", (e) => {
            const act = e.target.getAttribute("data-act");
            if (act === "col-add") {
                const c = document.createElement("div");
                c.className = "c";
                c.textContent = "新技术";
                col.appendChild(c);
            }
            if (act === "col-del") col.remove();
            e.stopPropagation();
        });
    }
    function cycleAttackCell(c) {
        c.classList.toggle("used");
    }

    // ---------- Actions ----------
    function wireActions(ac) {
        ac.querySelectorAll(".action").forEach(addActionTools);
        const tail = mkTail(
            '<button class="btn" data-act="action-add">+ 动作</button>',
        );
        ac.insertAdjacentElement("afterend", tail);
        tail.addEventListener("click", (e) => {
            if (e.target.getAttribute("data-act") !== "action-add")
                return;
            const n = ac.querySelectorAll(".action").length + 1;
            const row = document.createElement("div");
            row.className = "action";
            row.innerHTML =
                '<div class="n">' +
                pad2(n) +
                "</div>" +
                '<div class="t">动作描述。</div>' +
                '<span class="status todo"><span class="dot"></span>未开始</span>';
            ac.appendChild(row);
            addActionTools(row);
        });
        ac.addEventListener("click", (e) => {
            if (!editing) return;
            const pill = e.target.closest(".status");
            if (!pill || !ac.contains(pill)) return;
            if (e.target.closest(".item-tools")) return;
            cycleStatus(pill);
            e.preventDefault();
        });
    }
    function addActionTools(row) {
        const t = mkItemTools(
            "right:-4px;top:-4px;",
            '<button class="btn danger" data-act="action-del" title="删除">✕</button>',
        );
        row.appendChild(t);
        t.addEventListener("click", (e) => {
            if (e.target.getAttribute("data-act") === "action-del")
                row.remove();
        });
    }
    function cycleStatus(pill) {
        const order = ["todo", "wip", "done"];
        const label = {
            todo: "未开始",
            wip: "进行中",
            done: "已完成",
        };
        const cur =
            order.find((o) => pill.classList.contains(o)) || "todo";
        const next = order[(order.indexOf(cur) + 1) % order.length];
        order.forEach((o) => pill.classList.remove(o));
        pill.classList.add(next);
        pill.innerHTML =
            '<span class="dot" contenteditable="false"></span>' +
            label[next];
    }

    // ---------- Generic row list (toc, cover-meta) ----------
    function wireSimpleList(
        container,
        childSel,
        tailLabel,
        addFn,
        itemPos,
    ) {
        container
            .querySelectorAll(childSel)
            .forEach((row) =>
                addDelete(row, itemPos || "right:4px;top:4px;"),
            );
        const tail = mkTail(
            '<button class="btn" data-act="list-add">' +
                tailLabel +
                "</button>",
        );
        container.insertAdjacentElement("afterend", tail);
        tail.addEventListener("click", (e) => {
            if (e.target.getAttribute("data-act") !== "list-add")
                return;
            const row = addFn(container);
            if (row)
                addDelete(row, itemPos || "right:4px;top:4px;");
        });
    }

    // ---------- rev history (4 cells per row, first row is header) ----------
    function wireRev(rev) {
        const cells = Array.from(rev.children);
        for (let i = 4; i < cells.length; i += 4) {
            addRevDelete(rev, cells.slice(i, i + 4));
        }
        const tail = mkTail(
            '<button class="btn" data-act="rev-add">+ 修订行</button>',
        );
        rev.insertAdjacentElement("afterend", tail);
        tail.addEventListener("click", (e) => {
            if (e.target.getAttribute("data-act") !== "rev-add")
                return;
            const mk = (cls, text) => {
                const d = document.createElement("div");
                d.className = cls;
                d.textContent = text;
                return d;
            };
            const c = [
                mk("cl mono", "YYYY/MM/DD"),
                mk("cl mono", "1.0"),
                mk("cl", "描述"),
                mk("cl", "作者"),
            ];
            c.forEach((n) => rev.appendChild(n));
            addRevDelete(rev, c);
        });
    }
    function addRevDelete(rev, c4) {
        const t = mkItemTools(
            "right:-18px;top:8px;",
            '<button class="btn danger" data-act="rev-del" title="删除本行">✕</button>',
        );
        c4[c4.length - 1].appendChild(t);
        t.addEventListener("click", (e) => {
            if (e.target.getAttribute("data-act") === "rev-del")
                c4.forEach((n) => n.remove());
        });
    }

    // ---------- Asset cards (group by contiguous siblings) ----------
    function wireAssetCards() {
        const all = Array.from(
            shell.querySelectorAll(".asset-card"),
        );
        const groups = [];
        let cur = [];
        all.forEach((card) => {
            if (
                cur.length &&
                cur[cur.length - 1].nextElementSibling === card
            ) {
                cur.push(card);
            } else {
                if (cur.length) groups.push(cur);
                cur = [card];
            }
        });
        if (cur.length) groups.push(cur);
        const TEMPLATES = {
            ecs: [
                { k: "公网 IP", v: "x.x.x.x" },
                { k: "私网 IP", v: "x.x.x.x" },
                { k: "实例 ID", v: "[ 实例 ID ]" },
                { k: "实例名称", v: "[ 实例名称 ]" },
                {
                    k: "资产用途",
                    v: "公网 Web 应用主机，通过云负载均衡 TCP/443 对外提供服务。",
                    full: true,
                    zh: true,
                },
            ],
            ak: [
                { k: "AccessKey ID", v: "[ AccessKey ID ]" },
                { k: "RAM 子账户", v: "[ RAM 子账户名称 ]" },
                {
                    k: "权限范围",
                    v: "事件发生时对云租户拥有完整的管理权限（Administrator）。",
                    full: true,
                    zh: true,
                },
            ],
            custom: [
                { k: "字段", v: "值" },
                {
                    k: "说明",
                    v: "资产描述。",
                    full: true,
                    zh: true,
                },
            ],
        };
        const esc = (s) =>
            String(s).replace(
                /[&<>"']/g,
                (c) =>
                    ({
                        "&": "&amp;",
                        "<": "&lt;",
                        ">": "&gt;",
                        '"': "&quot;",
                        "'": "&#39;",
                    })[c],
            );
        function buildAssetCard(n, tpl) {
            const fields = TEMPLATES[tpl]
                .map((f) => {
                    const cls = "field" + (f.full ? " full" : "");
                    const vCls = "v" + (f.zh ? " zh" : "");
                    return (
                        '<div class="' +
                        cls +
                        '"><div class="k">' +
                        esc(f.k) +
                        '</div><div class="' +
                        vCls +
                        '">' +
                        esc(f.v) +
                        "</div></div>"
                    );
                })
                .join("");
            const card = document.createElement("div");
            card.className = "asset-card";
            card.innerHTML =
                '<div class="idx">' +
                pad2(n) +
                "</div>" +
                '<div class="body">' +
                fields +
                "</div>";
            return card;
        }
        const LABELS = {
            ecs: "+ ECS",
            ak: "+ AK",
            custom: "+ 自定义",
        };
        const btns = Object.keys(TEMPLATES)
            .map(
                (k) =>
                    '<button class="btn" data-act="asset-' +
                    k +
                    '">' +
                    LABELS[k] +
                    "</button>",
            )
            .join("");
        // Live DOM walk — the closure-captured `group` array holds
        // stale references after deletion, so re-scan the siblings
        // before the tail whenever we need a truthful count.
        function liveCards(tail) {
            const out = [];
            for (
                let el = tail.previousElementSibling;
                el &&
                el.classList &&
                el.classList.contains("asset-card");
                el = el.previousElementSibling
            )
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
            group[group.length - 1].insertAdjacentElement(
                "afterend",
                tail,
            );
            group.forEach((card) =>
                addDelete(card, "right:6px;top:6px;", () =>
                    reindex(tail),
                ),
            );
            tail.addEventListener("click", (e) => {
                const act = e.target.getAttribute("data-act") || "";
                if (!act.startsWith("asset-")) return;
                const tpl = act.slice(6);
                if (!TEMPLATES[tpl]) return;
                const next = liveCards(tail).length + 1;
                const card = buildAssetCard(next, tpl);
                tail.parentNode.insertBefore(card, tail);
                addDelete(card, "right:6px;top:6px;", () =>
                    reindex(tail),
                );
            });
        });
    }

    // ---------- KV groups (by parent) ----------
    function wireKvGroups() {
        const byParent = new Map();
        shell.querySelectorAll(".kv").forEach((kv) => {
            const p = kv.parentElement;
            if (!byParent.has(p)) byParent.set(p, []);
            byParent.get(p).push(kv);
        });
        byParent.forEach((kvs) => {
            kvs.forEach((kv) =>
                addDelete(kv, "right:4px;top:4px;"),
            );
            const tail = mkTail(
                '<button class="btn" data-act="kv-add">+ 字段</button>',
            );
            kvs[kvs.length - 1].insertAdjacentElement(
                "afterend",
                tail,
            );
            tail.addEventListener("click", (e) => {
                if (e.target.getAttribute("data-act") !== "kv-add")
                    return;
                const kv = document.createElement("div");
                kv.className = "kv";
                kv.innerHTML =
                    '<div class="k">名称</div><div class="v">值</div>';
                tail.parentNode.insertBefore(kv, tail);
                addDelete(kv, "right:4px;top:4px;");
            });
        });
    }

    // ---------- Page-level tools ----------
    // Derived from the `.page` min-height (set in CSS as 297mm /
    // A4 height). Reading computed style returns a px value so
    // downstream overflow math stays numeric.
    const PAGE_LIMIT_PX = (() => {
        const firstPage = shell.querySelector(".page");
        if (!firstPage) return 1123;
        return (
            parseFloat(getComputedStyle(firstPage).minHeight) ||
            1123
        );
    })();
    const OVERFLOW_TOLERANCE = 60;

    function addPageTools(page) {
        const tools = document.createElement("div");
        tools.className = "page-tools tool-anchor";
        tools.setAttribute("contenteditable", "false");
        tools.innerHTML =
            '<button class="btn" data-act="page-add-sub">+ 小节</button>';
        page.insertAdjacentElement("afterend", tools);
        tools.addEventListener("click", (e) => {
            if (
                e.target.getAttribute("data-act") === "page-add-sub"
            )
                addSubSection(page);
        });
    }

    function wirePageTools() {
        shell.querySelectorAll(".page").forEach(addPageTools);
    }

    function addSubSection(page) {
        // Insert before the end-of-chapter rule if present, otherwise before runfoot.
        const anchor =
            page.querySelector(".end-rule") ||
            page.querySelector(".runfoot");
        const h3 = document.createElement("h3");
        h3.className = "sub";
        h3.innerHTML =
            '<span class="n">N.N</span> 新小节 <span class="en">New Subsection</span>';
        const p = document.createElement("p");
        p.textContent = "小节内容。";
        page.insertBefore(h3, anchor);
        page.insertBefore(p, anchor);
        wireSubSectionTools(h3);
        renumberSubsections();
    }

    function addSubSubSection(parentH3) {
        const h3 = document.createElement("h3");
        h3.className = "sub";
        h3.innerHTML =
            '<span class="n">N.N.N</span> 新子小节 <span class="en">New Sub-subsection</span>';
        const p = document.createElement("p");
        p.textContent = "子小节内容。";
        // Place after the parent h3's content block — the first <p>/content
        // right after the h3, so the new child sits under the parent's body.
        const ref = parentH3.nextElementSibling;
        if (ref && ref.parentElement === parentH3.parentElement) {
            ref.parentElement.insertBefore(h3, ref.nextSibling);
            h3.parentElement.insertBefore(p, h3.nextSibling);
        } else {
            parentH3.parentElement.insertBefore(
                h3,
                parentH3.nextSibling,
            );
            parentH3.parentElement.insertBefore(
                p,
                h3.nextSibling,
            );
        }
        wireSubSectionTools(h3);
        renumberSubsections();
    }

    // Each h3.sub gets inline controls: "+ 子" on 2-level headings,
    // "✕" on all. Depth is capped at 3 (e.g., 3.3.1), so 3-level
    // headings do not get a "+ 子" control.
    function wireSubSectionTools(h3) {
        if (h3.querySelector(":scope > .item-tools")) return;
        const n = h3.querySelector(".n");
        if (!n) return;
        const dots = (n.textContent.match(/\./g) || []).length;
        const is3level = dots >= 2;
        const html = is3level
            ? '<button class="btn danger" data-act="sub-del" title="删除">✕</button>'
            : '<button class="btn" data-act="sub-addchild" title="新增子小节">+ 子</button>' +
              '<button class="btn danger" data-act="sub-del" title="删除">✕</button>';
        const tools = mkItemTools(
            "right:0;top:50%;transform:translateY(-50%);",
            html,
        );
        h3.appendChild(tools);
        tools.addEventListener("click", (e) => {
            const act = e.target.getAttribute("data-act");
            if (act === "sub-addchild") {
                addSubSubSection(h3);
            } else if (act === "sub-del") {
                deleteSubsection(h3);
                renumberSubsections();
            }
        });
    }

    // Remove the h3 and every following sibling that belongs to it:
    // its prose, its 3-level children (if we're deleting a 2-level),
    // stopping at a sibling h3.sub of same-or-shallower depth or any
    // structural boundary (end-rule, runfoot, page-tools).
    // Also drop a plain layout wrapper (e.g. `.two > div`) that
    // becomes empty as a result — otherwise grid columns leave gaps.
    function deleteSubsection(h3) {
        const nSpan = h3.querySelector(".n");
        const targetDots = (
            (nSpan && nSpan.textContent.match(/\./g)) ||
            []
        ).length;
        const parent = h3.parentElement;
        const toRemove = [h3];
        let cur = h3.nextElementSibling;
        while (cur) {
            if (
                cur.classList &&
                (cur.classList.contains("end-rule") ||
                    cur.classList.contains("runfoot") ||
                    cur.classList.contains("page-tools"))
            )
                break;
            if (
                cur.tagName === "H3" &&
                cur.classList &&
                cur.classList.contains("sub")
            ) {
                const curN = cur.querySelector(".n");
                const curDots = (
                    (curN && curN.textContent.match(/\./g)) ||
                    []
                ).length;
                if (curDots <= targetDots) break;
            }
            toRemove.push(cur);
            cur = cur.nextElementSibling;
        }
        toRemove.forEach((el) => el.remove());
        if (
            parent &&
            parent.tagName === "DIV" &&
            !parent.className &&
            parent.children.length === 0 &&
            parent.parentElement
        ) {
            parent.remove();
        }
    }

    // Walk pages in order. Chapter boundaries come from .sec-head .num —
    // Chinese numeral ("§ 三 · Three") starts a new chapter; "§ NN ·"
    // (plate pages like "§ 00 · 卷前") starts a synthetic chapter.
    // A "§ N.M · ..." sec-head on a continuation page represents an
    // *implicit* 2-level heading owning that whole page — its sec-head
    // .num and .runhead title are rewritten to the freshly computed
    // number too, so that shifting a sibling subsection cascades.
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
                    const newChap = String(
                        CN_NUM[mChap[1]] || mChap[1],
                    );
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
                    // Page-level implicit 2-level heading.
                    lvl2 += 1;
                    lvl3 = 0;
                    const newNum = chapter + "." + lvl2;
                    const rest = txt.replace(
                        /^§\s*\d+\.\d+\s*·\s*/,
                        "",
                    );
                    numEl.textContent = "§ " + newNum + " · " + rest;
                    page.querySelectorAll(
                        ".runhead > div:not(.brand)",
                    ).forEach((d) => {
                        d.textContent = d.textContent.replace(
                            /§\s*\d+\.\d+/,
                            "§ " + newNum,
                        );
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
                const dots = (n.textContent.match(/\./g) || [])
                    .length;
                if (dots >= 2 && lvl2 > 0) {
                    lvl3 += 1;
                    n.textContent =
                        chapter + "." + lvl2 + "." + lvl3;
                } else {
                    lvl2 += 1;
                    lvl3 = 0;
                    n.textContent = chapter + "." + lvl2;
                }
            });
        }
    }

    function pageAnchor(page) {
        // Returns the element after which a sibling should be inserted —
        // either the .page-tools sitting right after, or the page itself.
        const n = page.nextElementSibling;
        return n && n.classList.contains("page-tools") ? n : page;
    }

    // Containers whose items can be split across pages by moving overflowing
    // items into a cloned shell on the next page.
    const LIST_STRUCTURES = [
        {
            sel: ".timeline",
            itemSel: ".tl-item",
            rewire: (c) => wireTimeline(c),
        },
        {
            sel: ".actions",
            itemSel: ".action",
            rewire: (c) => wireActions(c),
        },
    ];

    function splitPage(page) {
        const rh = page.querySelector(".runhead");
        const rf = page.querySelector(".runfoot");
        const pageRect = page.getBoundingClientRect();
        // Target content bottom Y: page top + 1273 - padding-bottom(80)
        const limitY = pageRect.top + PAGE_LIMIT_PX - 80;
        const kids = Array.from(page.children).filter(
            (c) => c !== rh && c !== rf,
        );

        // Include each child's margin-bottom: an element whose
        // border box fits but whose margin pushes into the padding
        // zone would otherwise cascade into a blank physical page
        // at print time.
        const bottomOf = (el) => {
            const r = el.getBoundingClientRect();
            const mb =
                parseFloat(getComputedStyle(el).marginBottom) || 0;
            return r.bottom + mb;
        };
        let splitAt = -1;
        for (let i = 0; i < kids.length; i++) {
            if (bottomOf(kids[i]) > limitY) {
                splitAt = i;
                break;
            }
        }
        while (
            splitAt > 0 &&
            kids[splitAt].classList.contains("tail-tools")
        )
            splitAt--;
        // Don't orphan a heading at the bottom of a page.
        if (
            splitAt > 0 &&
            /^H[1-6]$/.test(kids[splitAt - 1].tagName)
        )
            splitAt--;

        // Fall through to splitting inside a vertical list so
        // items whose tails spill into the padding zone also move.
        let nested = null;
        if (splitAt <= 0) {
            for (const child of kids) {
                const lt = LIST_STRUCTURES.find((x) =>
                    child.matches(x.sel),
                );
                if (!lt) continue;
                const items = Array.from(
                    child.querySelectorAll(
                        ":scope > " + lt.itemSel,
                    ),
                );
                for (let i = 1; i < items.length; i++) {
                    if (
                        items[i].getBoundingClientRect().bottom >
                        limitY
                    ) {
                        nested = {
                            container: child,
                            items,
                            start: i,
                            rewire: lt.rewire,
                        };
                        break;
                    }
                }
                if (nested) break;
            }
        }

        if (splitAt <= 0 && !nested) return false;

        const np = document.createElement("section");
        np.className = "page";
        np.setAttribute("data-screen-label", "续页");
        if (rh) np.appendChild(rh.cloneNode(true));

        if (nested) {
            // Shallow-clone the container (preserves its classes/attrs) and move
            // overflowing items in. Strip any existing .item-tools on moved items
            // so the rewire pass attaches fresh listeners without duplicates.
            const clone = nested.container.cloneNode(false);
            np.appendChild(clone);
            for (
                let i = nested.start;
                i < nested.items.length;
                i++
            ) {
                const it = nested.items[i];
                it.querySelectorAll(".item-tools").forEach((n) =>
                    n.remove(),
                );
                clone.appendChild(it);
            }
            nested.rewire(clone);
        } else {
            for (let i = splitAt; i < kids.length; i++) {
                np.appendChild(kids[i]);
            }
        }

        if (rf) np.appendChild(rf.cloneNode(true));
        pageAnchor(page).insertAdjacentElement("afterend", np);
        addPageTools(np);
        applyGuards();
        return true;
    }

    function checkOverflow() {
        shell.querySelectorAll(".page").forEach((p) => {
            p.classList.toggle(
                "overflow",
                p.offsetHeight > PAGE_LIMIT_PX + OVERFLOW_TOLERANCE,
            );
        });
    }

    // Idempotent so MutationObserver doesn't bounce on no-op writes.
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

    function autoPaginate(tolerance = OVERFLOW_TOLERANCE) {
        for (let iter = 0; iter < 30; iter++) {
            let changed = false;
            const pages = Array.from(
                shell.querySelectorAll(".page"),
            );
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
        renumberFooters();
        checkOverflow();
    }

    function wireStructures() {
        wirePageTools();
        shell
            .querySelectorAll("h3.sub")
            .forEach(wireSubSectionTools);
        shell.querySelectorAll(".timeline").forEach(wireTimeline);
        shell.querySelectorAll(".chain").forEach(wireChain);
        shell
            .querySelectorAll(".attack-grid")
            .forEach(wireAttackGrid);
        shell.querySelectorAll(".actions").forEach(wireActions);
        wireAssetCards();

        shell.querySelectorAll(".toc").forEach((toc) => {
            toc.querySelectorAll(".toc-row").forEach((row) =>
                addDelete(row, "right:4px;top:4px;"),
            );
            const tail = mkTail(
                '<button class="btn" data-act="toc-add">+ 条目</button>' +
                    '<button class="btn" data-act="toc-add-sub">+ 子条目</button>',
            );
            toc.insertAdjacentElement("afterend", tail);
            tail.addEventListener("click", (e) => {
                const act = e.target.getAttribute("data-act");
                if (act !== "toc-add" && act !== "toc-add-sub")
                    return;
                const row = document.createElement("div");
                row.className =
                    "toc-row" +
                    (act === "toc-add-sub" ? " sub" : "");
                row.innerHTML =
                    '<div class="n">N</div><div class="t">标题<small>副标题</small></div><div class="pg">NN</div>';
                toc.appendChild(row);
                addDelete(row, "right:4px;top:4px;");
            });
        });

        shell.querySelectorAll(".rev").forEach(wireRev);

        shell.querySelectorAll(".cover-meta").forEach((meta) =>
            wireSimpleList(
                meta,
                ":scope > .cell",
                "+ 元信息",
                (c) => {
                    const cell = document.createElement("div");
                    cell.className = "cell";
                    cell.innerHTML =
                        '<div class="k">名称</div><div class="v">值<small>说明</small></div>';
                    c.appendChild(cell);
                    return cell;
                },
                "right:4px;top:2px;",
            ),
        );

        wireKvGroups();
    }

    function rewire() {
        runSilently(() => {
            shell
                .querySelectorAll(".item-tools,.tail-tools,.page-tools")
                .forEach((n) => n.remove());
            shell
                .querySelectorAll(".chain.dynamic")
                .forEach((c) => c.classList.remove("dynamic"));
            applyGuards();
            wireStructures();
            renumberSubsections();
            checkOverflow();
        });
    }

    // ---------- TOC rebuild ----------
    // Main chapter ("§ 二 · Two") vs page-level sub ("§ 2.3 · 结论") vs plain sub.
    const CHAPTER_RE = /^§\s*([一二三四五六七八九十]+)\s*·/;
    const PAGE_SUB_RE = /^§\s*(\d+\.\d+)\s*·/;
    const SUB_RE = /^\d+\.\d+$/;
    const CN_NUM = {
        一: 1,
        二: 2,
        三: 3,
        四: 4,
        五: 5,
        六: 6,
        七: 7,
        八: 8,
        九: 9,
        十: 10,
    };

    // Tool anchors (inline editor controls) are always structural noise
    // in derived text — TOC titles, etc. — so exclude them unconditionally
    // in addition to the caller-supplied selector.
    const TOOL_SEL =
        ".item-tools,.tail-tools,.page-tools,.tool-anchor";
    function textExcluding(el, excludeSel) {
        const sel = excludeSel
            ? excludeSel + "," + TOOL_SEL
            : TOOL_SEL;
        return Array.from(el.childNodes)
            .filter((n) => {
                if (n.nodeType === 3) return true;
                if (n.nodeType === 1) return !n.matches(sel);
                return false;
            })
            .map((n) => n.textContent)
            .join("")
            .replace(/\s+/g, " ")
            .trim();
    }
    function selectionIn(selector) {
        const s = window.getSelection && window.getSelection();
        if (!s || !s.anchorNode) return false;
        const el =
            s.anchorNode.nodeType === 1
                ? s.anchorNode
                : s.anchorNode.parentElement;
        return !!(el && el.closest && el.closest(selector));
    }
    function rebuildToc() {
        const toc = shell.querySelector(".toc");
        if (!toc) return;
        if (selectionIn(".toc")) return;

        // Preserve chapter subtitles (<small>) keyed by chapter numeral.
        const subtitleByKey = new Map();
        toc.querySelectorAll(":scope > .toc-row:not(.sub)").forEach(
            (row) => {
                const small = row.querySelector(".t small");
                if (!small) return;
                const nEl = row.querySelector(".n");
                if (nEl)
                    subtitleByKey.set(
                        nEl.textContent.trim(),
                        small.outerHTML,
                    );
            },
        );

        // Treat the current TOC as the source of truth for which chapters
        // expand their subsections. Chapters with no .sub rows now stay
        // collapsed — otherwise an edit→exit roundtrip would permanently
        // expand every chapter regardless of the original design.
        const chaptersWithSubs = new Set();
        toc.querySelectorAll(":scope > .toc-row.sub").forEach((row) => {
            const n = row.querySelector(".n")?.textContent.trim();
            if (n) chaptersWithSubs.add(n.split(".")[0]);
        });

        const pages = Array.from(shell.querySelectorAll(".page"));
        const indexOf = (p) => pages.indexOf(p);

        // Pass 1: collect main chapters so we can gate subsections to known chapters.
        const mainChapters = new Set(); // set of leading-int (e.g. '2')
        for (const page of pages) {
            const numEl = page.querySelector(".sec-head .num");
            if (!numEl) continue;
            const m = CHAPTER_RE.exec(numEl.textContent.trim());
            if (m && CN_NUM[m[1]] != null)
                mainChapters.add(String(CN_NUM[m[1]]));
        }

        const subChapterOf = (key) => key.split(".")[0];
        const pushed = new Set(); // prevent dupes across split continuation pages

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
                            subtitle:
                                subtitleByKey.get(chNum) || "",
                            pg: indexOf(page) + 1,
                        });
                        pushed.add("C:" + chNum);
                    }
                } else {
                    const psMatch = PAGE_SUB_RE.exec(txt);
                    if (
                        psMatch &&
                        mainChapters.has(
                            subChapterOf(psMatch[1]),
                        ) &&
                        chaptersWithSubs.has(
                            subChapterOf(psMatch[1]),
                        ) &&
                        !pushed.has("S:" + psMatch[1])
                    ) {
                        const h2 =
                            page.querySelector(".sec-head h2");
                        if (h2) {
                            rows.push({
                                sub: true,
                                n: psMatch[1],
                                title: textExcluding(h2, ".en"),
                                subtitle: "",
                                pg: indexOf(page) + 1,
                            });
                            pushed.add("S:" + psMatch[1]);
                        }
                    }
                }
            }
            const addSubRow = (nTxt, title, pgNum) => {
                if (!SUB_RE.test(nTxt)) return;
                if (!mainChapters.has(subChapterOf(nTxt))) return;
                if (!chaptersWithSubs.has(subChapterOf(nTxt))) return;
                if (pushed.has("S:" + nTxt)) return;
                rows.push({
                    sub: true,
                    n: nTxt,
                    title,
                    subtitle: "",
                    pg: pgNum,
                });
                pushed.add("S:" + nTxt);
            };
            const pgNum = indexOf(page) + 1;
            // h3.sub entries — skip continuation-cloned dupes via pushed Set.
            page.querySelectorAll("h3.sub").forEach((h3) => {
                const nSpan = h3.querySelector(".n");
                if (!nSpan) return;
                addSubRow(
                    nSpan.textContent.trim(),
                    textExcluding(h3, ".n,.en"),
                    pgNum,
                );
            });
            // .phase blocks (4.1 / 4.2 / 4.3 containment / eradication / recovery).
            page.querySelectorAll(".phase").forEach((ph) => {
                const nEl = ph.querySelector(":scope > .n");
                const tEl = ph.querySelector(":scope > .t");
                if (!nEl || !tEl) return;
                addSubRow(
                    nEl.textContent.trim(),
                    textExcluding(tEl, ".en"),
                    pgNum,
                );
            });
        }

        // Order: main chapters and their subs, keeping source order but grouped.
        rows.sort((a, b) => {
            const ka = a.sub
                ? Number(a.n.split(".")[0])
                : CN_NUM[a.n];
            const kb = b.sub
                ? Number(b.n.split(".")[0])
                : CN_NUM[b.n];
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

        // No-op if unchanged — prevents autosave bumps on keystrokes outside TOC.
        const current = Array.from(
            toc.querySelectorAll(":scope > .toc-row"),
        ).map((r) => ({
            sub: r.classList.contains("sub"),
            n: r.querySelector(".n")?.textContent.trim() || "",
            title: textExcluding(
                r.querySelector(".t") || r,
                "small",
            ),
            subtitle: r.querySelector(".t small")?.outerHTML || "",
            pg: r.querySelector(".pg")?.textContent.trim() || "",
        }));
        const same =
            current.length === rows.length &&
            current.every((c, i) => {
                const r = rows[i];
                return (
                    c.sub === r.sub &&
                    c.n === r.n &&
                    c.title === r.title &&
                    c.subtitle === r.subtitle &&
                    c.pg === pad2(r.pg)
                );
            });
        if (same) return;

        // Rebuild rows in place (keep the .toc container + its .tail-tools sibling).
        toc.querySelectorAll(":scope > .toc-row").forEach((r) =>
            r.remove(),
        );
        for (const row of rows) {
            const el = document.createElement("div");
            el.className = "toc-row" + (row.sub ? " sub" : "");
            const t = document.createElement("div");
            t.className = "t";
            t.textContent = row.title;
            if (row.subtitle)
                t.insertAdjacentHTML("beforeend", row.subtitle);
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

    // ---------- Undo / Redo ----------
    // Snapshots are full serialized HTML strings; with inlined base64 images
    // they can run into MB each. Cap by count and by total size (measured in
    // UTF-16 code units — close enough to bytes for our mixed ASCII+CJK HTML)
    // across both stacks so a screenshot-heavy session can't blow memory.
    const MAX_HISTORY = 50;
    const MAX_HISTORY_CHARS = 20 * 1024 * 1024;
    const history = [];
    const future = [];
    let historyChars = 0;
    let lastGoodHtml = null;
    const btnUndo = document.getElementById("edUndo");
    const btnRedo = document.getElementById("edRedo");

    function updateUndoBtn() {
        btnUndo.disabled = history.length === 0;
        btnRedo.disabled = future.length === 0;
    }
    function shiftOldest(stack) {
        const s = stack.shift();
        if (s !== undefined) historyChars -= s.length;
        return s;
    }
    function pushStack(stack, snap) {
        stack.push(snap);
        historyChars += snap.length;
        evictStacks();
    }
    function popStack(stack) {
        const s = stack.pop();
        if (s !== undefined) historyChars -= s.length;
        return s;
    }
    function clearStack(stack) {
        while (stack.length) shiftOldest(stack);
    }
    function evictStacks() {
        while (history.length > MAX_HISTORY) shiftOldest(history);
        while (future.length > MAX_HISTORY) shiftOldest(future);
        // Drop oldest undo first when over size cap; fall back to redo tail.
        while (historyChars > MAX_HISTORY_CHARS && history.length)
            shiftOldest(history);
        while (historyChars > MAX_HISTORY_CHARS && future.length)
            shiftOldest(future);
    }
    function restoreSnapshot(html, prefix) {
        runSilently(() => {
            shell.innerHTML = html;
            rewire();
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
    const undo = () => step(history, future, "已撤销");
    const redo = () => step(future, history, "已重做");

    // ---------- Autosave ----------
    let saveTimer = null;
    function scheduleSave() {
        if (!editing || writeDepth > 0) return;
        elStatus.textContent = "未保存…";
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            // Skip autoPaginate/rebuildToc while the user is actively editing —
            // they cause DOM churn that jumps the caret and flickers images.
            // setEditing(false) runs them once on exit.
            runSilently(() => {
                const snap = serializeShellForDraft();
                if (lastGoodHtml != null && snap !== lastGoodHtml) {
                    pushStack(history, lastGoodHtml);
                    clearStack(future);
                }
                doSave(snap, "已保存");
                lastGoodHtml = snap;
                updateUndoBtn();
            });
        }, 500);
    }
    async function doSave(html, prefix) {
        try {
            await idb.set(KEY, {
                html,
                savedAt: new Date().toISOString(),
            });
            body.classList.add("has-draft");
            elStatus.textContent =
                (prefix || "已保存") + " " + hms();
        } catch (err) {
            elStatus.textContent = "保存失败";
            console.error("[ir-report] autosave failed", err);
        }
    }
    function serializeShellForDraft() {
        // Clone, strip injected controls so the saved HTML is clean
        const c = shell.cloneNode(true);
        c.querySelectorAll(
            ".item-tools,.tail-tools,.page-tools",
        ).forEach((n) => n.remove());
        c.querySelectorAll(".page.overflow").forEach((n) =>
            n.classList.remove("overflow"),
        );
        c.querySelectorAll(".chain.dynamic").forEach((n) => {
            const cols = n.querySelectorAll(".step").length;
            n.classList.remove("dynamic");
            n.style.gridTemplateColumns =
                "repeat(" + cols + ",1fr)";
        });
        return c.innerHTML;
    }

    const observer = new MutationObserver((muts) => {
        if (writeDepth > 0) return;
        let saved = false;
        for (const m of muts) {
            const t = m.target;
            if (
                t &&
                t.nodeType === 1 &&
                t.closest &&
                t.closest(
                    ".tool-anchor,.item-tools,.tail-tools,.page-tools,.edit-bar,.draft-banner",
                )
            )
                continue;
            // Newly injected structural blocks (added by "+ 资产",
            // "+ 字段" etc. buttons) need contenteditable applied
            // to their editable leaves while we're in edit mode.
            if (editing && m.type === "childList") {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType === 1)
                        markEditableLeaves(true, node);
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
        attributeFilter: ["class"],
    });

    // ---------- Draft banner ----------
    function showDraftBanner(savedAt) {
        const banner = document.createElement("div");
        banner.className = "draft-banner";
        banner.setAttribute("contenteditable", "false");
        const t = new Date(savedAt);
        const ts =
            t.getFullYear() +
            "/" +
            pad2(t.getMonth() + 1) +
            "/" +
            pad2(t.getDate()) +
            " " +
            pad2(t.getHours()) +
            ":" +
            pad2(t.getMinutes());
        banner.innerHTML =
            '<span class="k">发现草稿</span><span>' +
            ts +
            "</span>" +
            '<button class="primary" data-act="load">加载</button>' +
            '<button data-act="skip">稍后</button>' +
            '<button data-act="drop">放弃</button>';
        document.body.appendChild(banner);
        banner.addEventListener("click", async (e) => {
            const act = e.target.getAttribute("data-act");
            if (act === "load") {
                try {
                    const data = await idb.get(KEY);
                    if (data && data.html) {
                        // Loaded draft becomes the new baseline — clear history so undo
                        // can't take the user back to the pre-load state.
                        clearStack(history);
                        clearStack(future);
                        restoreSnapshot(data.html, "已加载");
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

    // ---------- Export ----------
    function todayStamp() {
        const t = new Date();
        return (
            t.getFullYear() +
            pad2(t.getMonth() + 1) +
            pad2(t.getDate())
        );
    }
    // Filename: {客户}-安全事件应急响应报告-{YYYYMMDD}-{seq}
    // Customer comes from the cover .client text (minus the <small> label);
    // date and seq come from the canonical data-var peers (same source as the SIR-… brand).
    function exportFilename() {
        const clientEl = shell.querySelector(".client");
        const rawClient = clientEl
            ? textExcluding(clientEl, "small").replace(/[\[\]]/g, "")
            : "";
        const client =
            rawClient
                .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
                .trim() || "客户";
        const date = (
            shell.querySelector('[data-var="date"]')?.textContent ||
            todayStamp()
        ).replace(/\D/g, "");
        const seq = (
            shell.querySelector('[data-var="sir-seq"]')
                ?.textContent || "01"
        ).trim();
        return client + "-安全事件应急响应报告-" + date + "-" + seq;
    }
    // ---------- Toolbar ----------
    btnToggle.addEventListener("click", () => setEditing(!editing));
    btnPdf.addEventListener("click", () => {
        // The browser uses document.title as the default PDF filename.
        const prev = document.title;
        document.title = exportFilename();
        const restore = () => {
            document.title = prev;
            window.removeEventListener("afterprint", restore);
        };
        window.addEventListener("afterprint", restore);
        window.print();
    });
    btnUndo.addEventListener("click", undo);
    btnRedo.addEventListener("click", redo);
    btnDiscard.addEventListener("click", async () => {
        if (
            !confirm("放弃浏览器中的草稿？当前编辑将回到磁盘版本。")
        )
            return;
        try {
            await idb.del(KEY);
        } catch (err) {
            console.error(err);
        }
        body.classList.remove("has-draft");
        location.reload();
    });

    // ---------- Help overlay ----------
    const btnHelp = document.getElementById("edHelp");
    const helpOverlay = document.getElementById("help-overlay");
    btnHelp.addEventListener("click", () => {
        helpOverlay.hidden = false;
    });
    helpOverlay.addEventListener("click", (e) => {
        // Close on backdrop click or ✕ button, not on card-content clicks.
        if (e.target === helpOverlay || e.target.closest(".help-close")) {
            helpOverlay.hidden = true;
        }
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !helpOverlay.hidden) {
            helpOverlay.hidden = true;
        }
    });

    // Global shortcut: ⌘/Ctrl+Z for undo, ⌘⇧Z / Ctrl+Y for redo.
    // Intercepts the browser's native contenteditable undo so we can replay
    // structural edits (adds/deletes/status cycles) alongside plain text.
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
            } else if ((k === "z" && e.shiftKey) || k === "y") {
                e.preventDefault();
                redo();
            } else if (k === "b") {
                e.preventDefault();
                document.execCommand("bold");
            }
        },
        true,
    );

    // ---------- Boot ----------
    runSilently(() => {
        applyGuards();
        wireStructures();
        renumberSubsections();
        renumberFooters();
        checkOverflow();
    });
    lastGoodHtml = serializeShellForDraft();
    updateUndoBtn();

    (async () => {
        // One-shot migration: earlier versions stored the draft in
        // localStorage. Move it into IDB so the new code path sees it.
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
                showDraftBanner(
                    data.savedAt || new Date().toISOString(),
                );
            }
        } catch (err) {
            console.error(err);
        }
    })();
})();
