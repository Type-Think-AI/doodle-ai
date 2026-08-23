/* Shared @/#// mention system for the contenteditable composer
   (PromptComposer.astro), used by both home.ts and chat.ts.

   @ -> pick a saved character (character-store.ts)     -> attaches its photo
   / -> pick a skill (lib/skills.ts, runnable only)      -> pins it (via callback)
   # -> pick a saved moodboard image (moodboard.ts)      -> extra reference image

   Trigger detection: on each keystroke, look at the text between the start
   of the current text node and the caret. If it ends with `@query`,
   `/query`, or `#query` where the trigger char is at the very start of the
   line or preceded by whitespace, open a popover listing matches. */

import { listCharacters, type Character } from "./character-store";
import { SKILLS } from "../../lib/skills";
import { loadMoodboard, type MoodboardItem } from "./moodboard";
import { setImageSrc } from "./dom-utils";

export type MentionType = "character" | "skill" | "ref";

interface MentionItem {
  id: string;
  label: string;
  thumbUrl?: string;
}

export interface SerializedComposer {
  text: string;
  characterId?: string;
  skillId?: string;
  refImageId?: string;
}

export interface MentionCallbacks {
  onSkillSelect?: (skillId: string, skillName: string) => void;
}

const TRIGGER_RE = /(?:^|\s)([@/#])(\S*)$/;

function itemsForTrigger(trigger: string, query: string): MentionItem[] {
  const q = query.trim().toLowerCase();
  if (trigger === "@") {
    return listCharacters()
      .filter((c: Character) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({ id: c.id, label: c.name, thumbUrl: c.imageUrl }));
  }
  if (trigger === "/") {
    return SKILLS.filter((s) => s.runnable && (!q || s.name.toLowerCase().includes(q))).map((s) => ({
      id: s.id,
      label: s.name,
    }));
  }
  // "#"
  return loadMoodboard()
    .slice(0, 12)
    .map((m: MoodboardItem, i: number) => ({ id: m.id, label: `Doodle #${i + 1}`, thumbUrl: m.url }));
}

export function initMentions(
  el: HTMLElement,
  popover: HTMLElement,
  callbacks: MentionCallbacks = {},
): { close: () => void; triggerFor: (t: "@" | "/" | "#") => void } {
  let open = false;
  let trigger: "@" | "/" | "#" | null = null;
  let items: MentionItem[] = [];
  let activeIndex = 0;
  let anchorNode: Text | null = null;
  let anchorOffset = 0; // position of the trigger char in anchorNode

  const box = el.closest<HTMLElement>(".composer-box") || el.parentElement!;

  function close(): void {
    open = false;
    trigger = null;
    popover.hidden = true;
    popover.innerHTML = "";
  }

  function positionPopover(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    popover.style.left = `${Math.max(0, rect.left - boxRect.left)}px`;

    // Flip upward when there isn't room below (composer pinned near the
    // bottom of the viewport, e.g. the Chat page) — otherwise the popover
    // gets clipped by the screen edge.
    const popoverHeight = popover.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < popoverHeight + 12) {
      popover.style.top = "auto";
      popover.style.bottom = `${boxRect.bottom - rect.top + 6}px`;
    } else {
      popover.style.bottom = "auto";
      popover.style.top = `${rect.bottom - boxRect.top + 6}px`;
    }
  }

  function renderPopover(): void {
    popover.innerHTML = "";
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "mention-popover-empty";
      empty.textContent = trigger === "@" ? "No characters yet — add one on /characters" : trigger === "#" ? "No moodboard doodles yet" : "No matching skills";
      popover.appendChild(empty);
      return;
    }
    items.forEach((item, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mention-popover-item";
      btn.dataset.active = String(i === activeIndex);
      if (item.thumbUrl) {
        const img = document.createElement("img");
        img.alt = "";
        setImageSrc(img, item.thumbUrl);
        btn.appendChild(img);
      }
      const label = document.createElement("span");
      label.textContent = item.label;
      btn.appendChild(label);
      btn.addEventListener("mousedown", (e) => {
        // mousedown (not click) so it fires before the contenteditable loses focus/selection
        e.preventDefault();
        selectItem(item);
      });
      popover.appendChild(btn);
    });
  }

  function openPopover(t: "@" | "/" | "#", query: string, node: Text, offsetOfTrigger: number): void {
    trigger = t;
    anchorNode = node;
    anchorOffset = offsetOfTrigger;
    items = itemsForTrigger(t, query);
    activeIndex = 0;
    open = true;
    popover.hidden = false;
    renderPopover();
    positionPopover();
  }

  function mentionTypeFor(t: "@" | "/" | "#"): MentionType {
    return t === "@" ? "character" : t === "/" ? "skill" : "ref";
  }

  function selectItem(item: MentionItem): void {
    if (!trigger || !anchorNode) return;
    const type = mentionTypeFor(trigger);
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      close();
      return;
    }

    // Remove the typed "@query" (from the trigger char to the caret).
    const caretRange = sel.getRangeAt(0);
    const deleteRange = document.createRange();
    deleteRange.setStart(anchorNode, anchorOffset);
    deleteRange.setEnd(caretRange.endContainer, caretRange.endOffset);
    deleteRange.deleteContents();

    const pill = document.createElement("span");
    pill.contentEditable = "false";
    pill.className = "mention-pill";
    pill.dataset.mentionType = type;
    pill.dataset.mentionId = item.id;
    if (item.thumbUrl) {
      const img = document.createElement("img");
      img.alt = "";
      setImageSrc(img, item.thumbUrl);
      pill.appendChild(img);
    }
    const label = document.createElement("span");
    label.textContent = `${trigger}${item.label}`;
    pill.appendChild(label);

    deleteRange.insertNode(pill);
    const space = document.createTextNode(" ");
    pill.parentNode?.insertBefore(space, pill.nextSibling);

    const newRange = document.createRange();
    newRange.setStartAfter(space);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    if (type === "skill") callbacks.onSkillSelect?.(item.id, item.label);
    close();
    el.focus();
  }

  function detectTrigger(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) {
      close();
      return;
    }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !el.contains(node)) {
      close();
      return;
    }
    const text = (node as Text).data.slice(0, range.startOffset);
    const match = TRIGGER_RE.exec(text);
    if (!match) {
      close();
      return;
    }
    const [, t, query] = match;
    const triggerOffset = text[match.index] === t ? match.index : match.index + 1;
    openPopover(t as "@" | "/" | "#", query, node as Text, triggerOffset);
  }

  el.addEventListener("input", detectTrigger);
  el.addEventListener("click", detectTrigger);

  // Capture phase so this runs before the page's own Enter-to-send handler.
  el.addEventListener(
    "keydown",
    (e) => {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        activeIndex = Math.min(activeIndex + 1, Math.max(items.length - 1, 0));
        renderPopover();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        activeIndex = Math.max(activeIndex - 1, 0);
        renderPopover();
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (items[activeIndex]) {
          e.preventDefault();
          e.stopPropagation();
          selectItem(items[activeIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    },
    true,
  );

  document.addEventListener("click", (e) => {
    if (open && !popover.contains(e.target as Node) && e.target !== el) close();
  });

  // Programmatic trigger for toolbar buttons (e.g. the character icon) that
  // want the same popover typing "@" opens, without the user typing it.
  function triggerFor(t: "@" | "/" | "#"): void {
    el.focus();
    const sel = window.getSelection();
    let range: Range;
    if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer)) {
      range = sel.getRangeAt(0).cloneRange();
    } else {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    range.deleteContents();

    const before = range.startContainer.nodeType === Node.TEXT_NODE ? (range.startContainer as Text).data.slice(0, range.startOffset) : "";
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const textNode = document.createTextNode(needsLeadingSpace ? ` ${t}` : t);
    range.insertNode(textNode);

    const newRange = document.createRange();
    newRange.setStart(textNode, textNode.length);
    newRange.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(newRange);

    detectTrigger();
  }

  return { close, triggerFor };
}

export function serializeComposer(el: HTMLElement): SerializedComposer {
  let text = "";
  let characterId: string | undefined;
  let skillId: string | undefined;
  let refImageId: string | undefined;

  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const elNode = node as HTMLElement;
    if (!elNode.classList.contains("mention-pill")) {
      text += elNode.textContent || "";
      return;
    }
    const type = elNode.dataset.mentionType as MentionType | undefined;
    const id = elNode.dataset.mentionId;
    if (!type || !id) return;
    if (type === "character") characterId = id;
    else if (type === "skill") skillId = id;
    else if (type === "ref") refImageId = id;
  });

  return { text: text.replace(/ /g, " ").trim(), characterId, skillId, refImageId };
}

export function clearComposer(el: HTMLElement): void {
  el.innerHTML = "";
}
