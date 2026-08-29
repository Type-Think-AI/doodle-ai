/**
 * background.js — MV3 service worker.
 *
 * Responsibilities:
 *   - Open the side panel when the toolbar icon is clicked.
 *   - On demand (from the panel), make sure content.js is present in the active
 *     tab. content_scripts already inject it at document_idle, but a tab that
 *     was open before the extension was (re)loaded won't have it — so we offer
 *     an explicit re-inject via chrome.scripting using activeTab.
 *   - Relay the page's toolchange/ready events up to the side panel.
 */

// Open the side panel from the toolbar action.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});

chrome.action.onClicked.addListener(function (tab) {
  if (tab && tab.id != null) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(function () {});
  }
});

// Relay page events (toolchange / ready) from content scripts to the panel.
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === "wmt-event") {
    // Forward to any open side panel(s). runtime.sendMessage reaches the panel.
    chrome.runtime.sendMessage({
      type: "wmt-page-event",
      event: msg.event,
      available: msg.available,
      origin: msg.origin,
      tabId: sender && sender.tab ? sender.tab.id : null
    }).catch(function () {});
    return false;
  }

  if (msg && msg.type === "wmt-ensure-content") {
    var tabId = msg.tabId;
    if (tabId == null) { sendResponse({ ok: false, error: "no tabId" }); return true; }
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"]
    }).then(
      function () { sendResponse({ ok: true }); },
      function (err) { sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }); }
    );
    return true; // async
  }
  return false;
});
