/* Chat page state — thread identity, style, skill pin, attachment lifecycle.
   Pure state getters/setters with no DOM or network IO. */

import { STYLE_THEME_STORAGE_KEY } from "../../../lib/doodle-constants";
import { getSkill } from "../../../lib/skills";
import {
  clearThreadSkill,
  getThreadSkill,
  setThreadSkill,
} from "../chat-store";

/* ---- Thread identity ---- */

export function threadIdFromPath(): string | null {
  const match = window.location.pathname.match(/\/c\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function getStyleId(): string {
  try {
    return localStorage.getItem(STYLE_THEME_STORAGE_KEY) || "pastel";
  } catch {
    return "pastel";
  }
}

/* ---- Skill pin ---- */

export interface SkillPinState {
  pinnedSkillId: string | undefined;
}

export function createSkillPinState(threadId: string): SkillPinState {
  return { pinnedSkillId: getThreadSkill(threadId) };
}

export function pinSkill(state: SkillPinState, threadId: string, skillId: string): void {
  state.pinnedSkillId = skillId;
  setThreadSkill(threadId, skillId);
}

export function clearSkillPin(state: SkillPinState, threadId: string): void {
  state.pinnedSkillId = undefined;
  clearThreadSkill(threadId);
}

export function getSkillName(skillId: string | undefined): string | undefined {
  return skillId ? getSkill(skillId)?.name : undefined;
}

/* ---- Attachment state ---- */

export interface AttachmentState {
  attachedUrl: string | null;
  attachedPreviewUrl: string | null;
  uploading: boolean;
}

export function createAttachmentState(): AttachmentState {
  return { attachedUrl: null, attachedPreviewUrl: null, uploading: false };
}

export function clearAttachmentState(state: AttachmentState): void {
  if (state.attachedPreviewUrl) URL.revokeObjectURL(state.attachedPreviewUrl);
  state.attachedUrl = null;
  state.attachedPreviewUrl = null;
}

/* ---- Send state ---- */

export interface SendState {
  sending: boolean;
  activeAbort: AbortController | null;
}

export function createSendState(): SendState {
  return { sending: false, activeAbort: null };
}
