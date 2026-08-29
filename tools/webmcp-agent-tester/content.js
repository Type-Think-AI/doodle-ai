/**
 * content.js — ISOLATED WORLD.
 *
 * Bridges the side panel (via chrome.runtime messaging) to the page's main
 * world (via window.postMessage). It:
 *   1. Injects injected.js into the MAIN world.
 *   2. Forwards listTools/executeTool requests down to the page.
 *   3. Relays results and the toolchange event back up to the extension.
 *
 * The content script never touches document.modelContext itself — it can't,
 * that object lives in the page's main world.
 */
(function () {
  "use strict";

  var CS = "wmt-cs";
  var PAGE = "wmt-page";
  var ORIGIN = window.location.origin;

  var pending = {}; // id -> { resolve }
  var seq = 0;

  // ---- Inject the main-world script ----
  function inject() {
    try {
      var url = chrome.runtime.getURL("injected.js");
      var s = document.createElement("script");
      s.src = url;
      s.async = false;
      s.onload = function () { s.remove(); };
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {
      // best effort
    }
  }
  inject();

  // ---- Page -> content relay ----
  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    if (ev.origin !== ORIGIN) return;
    var msg = ev.data;
    if (!msg || msg.source !== PAGE) return;

    if (msg.event === "toolchange") {
      chrome.runtime.sendMessage({ type: "wmt-event", event: "toolchange", origin: ORIGIN }).catch(function () {});
      return;
    }
    if (msg.event === "ready") {
      chrome.runtime.sendMessage({ type: "wmt-event", event: "ready", available: !!msg.available, origin: ORIGIN }).catch(function () {});
      return;
    }
    if (typeof msg.id !== "undefined" && pending[msg.id]) {
      var p = pending[msg.id];
      delete pending[msg.id];
      p.resolve(msg);
    }
  });

  function callPage(op, name, args) {
    return new Promise(function (resolve) {
      var id = "wmt-" + (++seq) + "-" + Date.now();
      pending[id] = { resolve: resolve };
      window.postMessage({ source: CS, id: id, op: op, name: name, args: args }, ORIGIN);
      // Safety timeout so a hung page never wedges the panel.
      setTimeout(function () {
        if (pending[id]) {
          delete pending[id];
          resolve({ id: id, ok: false, error: "Timed out waiting for the page (10s)." });
        }
      }, 10000);
    });
  }

  // ---- Extension -> content handler ----
  chrome.runtime.onMessage.addListener(function (req, sender, sendResponse) {
    if (!req || req.type !== "wmt-bridge") return false;

    if (req.op === "listTools") {
      callPage("listTools").then(function (r) { sendResponse(r); });
      return true; // async
    }
    if (req.op === "executeTool") {
      callPage("executeTool", req.name, req.args).then(function (r) { sendResponse(r); });
      return true; // async
    }
    if (req.op === "probe") {
      // Cheap availability probe = a listTools round-trip.
      callPage("listTools").then(function (r) {
        sendResponse({ ok: r.ok, available: r.ok, error: r.error || null, count: r.ok ? (r.result || []).length : 0 });
      });
      return true;
    }
    return false;
  });
})();
