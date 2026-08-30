/**
 * injected.js — runs in the PAGE'S MAIN WORLD.
 *
 * document.modelContext is only exposed to the page's own main world, so the
 * isolated-world content script cannot touch it directly. This script is the
 * only code with access; it talks to content.js exclusively via
 * window.postMessage using a namespaced protocol with a strict origin check.
 *
 * Protocol (all messages carry `source` so we ignore anyone else's traffic):
 *   content -> page:  { source: "wmt-cs", id, op, name?, args? }
 *   page -> content:  { source: "wmt-page", id, ok, result?, error? }
 *   page -> content:  { source: "wmt-page", event: "toolchange" }
 *   page -> content:  { source: "wmt-page", event: "ready", available }
 */
(function () {
  "use strict";

  var CS = "wmt-cs"; // messages FROM the content script
  var PAGE = "wmt-page"; // messages FROM this page script
  var ORIGIN = window.location.origin;

  function getCtx() {
    // navigator.modelContext is deprecated; probe document.modelContext first.
    if (typeof document !== "undefined" && document.modelContext) return document.modelContext;
    if (typeof navigator !== "undefined" && navigator.modelContext) return navigator.modelContext;
    return null;
  }

  function post(msg) {
    msg.source = PAGE;
    // Target our own origin only — never "*".
    window.postMessage(msg, ORIGIN);
  }

  // Serialize a RegisteredTool into a structured-clone-safe plain object.
  function serializeTool(t) {
    var schema = t.inputSchema;
    // Canary may hand back inputSchema as a JSON string — normalize to a string
    // on the wire; the panel decides how to parse/display it.
    var schemaOut = null;
    if (typeof schema === "string") {
      schemaOut = schema;
    } else if (schema && typeof schema === "object") {
      try {
        schemaOut = JSON.stringify(schema);
      } catch {
        schemaOut = null;
      }
    }
    var ann = t.annotations || {};
    return {
      name: t.name,
      title: t.title || null,
      description: t.description || "",
      inputSchema: schemaOut, // always a string or null on the wire
      origin: t.origin || ORIGIN,
      annotations: {
        readOnlyHint: ann.readOnlyHint === true,
        untrustedContentHint: ann.untrustedContentHint === true
      }
    };
  }

  // Keep the live RegisteredTool objects here; executeTool needs the real object.
  var liveTools = [];

  function refreshTools(ctx) {
    return ctx.getTools().then(function (tools) {
      liveTools = tools || [];
      return liveTools.map(serializeTool);
    });
  }

  function handle(msg) {
    var ctx = getCtx();
    if (!ctx) {
      post({ id: msg.id, ok: false, error: "document.modelContext is not available on this page." });
      return;
    }

    if (msg.op === "listTools") {
      refreshTools(ctx).then(
        function (list) { post({ id: msg.id, ok: true, result: list }); },
        function (err) { post({ id: msg.id, ok: false, error: String(err && err.message ? err.message : err) }); }
      );
      return;
    }

    if (msg.op === "executeTool") {
      // Find the live RegisteredTool object by name (refresh if we don't have it).
      var run = function () {
        var tool = null;
        for (var i = 0; i < liveTools.length; i++) {
          if (liveTools[i].name === msg.name) { tool = liveTools[i]; break; }
        }
        if (!tool) {
          post({ id: msg.id, ok: false, error: "Tool not found: " + msg.name });
          return;
        }
        var args = msg.args && typeof msg.args === "object" ? msg.args : {};
        // ARGUMENT ENCODING — verified against Chrome Canary 154. The IDL says
        // executeTool takes an `object`, but Canary JSON.parse()s what it gets,
        // so a real object becomes JSON.parse("[object Object]") and rejects
        // with "Failed to parse input arguments". Send the stringified form
        // first (works today), then fall back to the object form (spec-correct,
        // future Chrome). executeTool resolves to a string either way.
        var done = function (resultStr, encoding) {
          post({
            id: msg.id,
            ok: true,
            encoding: encoding,
            result: typeof resultStr === "string" ? resultStr : JSON.stringify(resultStr)
          });
        };
        var describe = function (err) {
          var name = err && err.name ? err.name : "Error";
          var text = err && err.message ? err.message : String(err);
          return name + ": " + text;
        };
        ctx.executeTool(tool, JSON.stringify(args)).then(
          function (resultStr) { done(resultStr, "string"); },
          function (err1) {
            ctx.executeTool(tool, args).then(
              function (resultStr) { done(resultStr, "object"); },
              function (err2) {
                post({
                  id: msg.id,
                  ok: false,
                  error: "string-form: " + describe(err1) + " | object-form: " + describe(err2)
                });
              }
            );
          }
        );
      };
      // Make sure liveTools is populated before looking up.
      if (liveTools.length === 0) {
        refreshTools(ctx).then(run, function (err) {
          post({ id: msg.id, ok: false, error: String(err && err.message ? err.message : err) });
        });
      } else {
        run();
      }
      return;
    }

    post({ id: msg.id, ok: false, error: "Unknown op: " + msg.op });
  }

  window.addEventListener("message", function (ev) {
    // Strict origin check + only accept our content script's messages.
    if (ev.source !== window) return;
    if (ev.origin !== ORIGIN) return;
    var msg = ev.data;
    if (!msg || msg.source !== CS) return;
    handle(msg);
  });

  // Subscribe to toolchange so late registration is never missed.
  var ctx0 = getCtx();
  if (ctx0 && typeof ctx0.addEventListener === "function") {
    ctx0.addEventListener("toolchange", function () {
      post({ event: "toolchange" });
    });
  }

  // Announce readiness so the panel can probe availability immediately.
  post({ event: "ready", available: !!ctx0 });
})();
