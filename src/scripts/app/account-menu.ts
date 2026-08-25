/* Controller for #accountMenu (src/components/app/AccountMenu.astro).
 *
 * Opened from the sidebar's auth-user row (sidebar.ts) instead of navigating
 * straight to /settings. Fetches GET /api/v1/orgs for the switcher list —
 * this is a fresh request rather than reusing whatever /api/v1/me returned
 * at page load, since a user can create or join a team in another tab and
 * this menu should reflect that the next time it opens.
 */
import { showToast } from "./toast";

interface OrgDto {
  id: string;
  name: string;
  slug: string;
  role: string;
  isPersonal: boolean;
  balance: number;
  memberCount: number;
}

function initAccountMenu(): void {
  const menu = document.getElementById("accountMenu") as (HTMLElement & { showPopover?: () => void }) | null;
  const trigger = document.getElementById("sidebarAuthUser");
  const teamsList = document.getElementById("accountMenuTeamsList");
  const createBtn = document.getElementById("accountMenuCreateTeam");
  const joinBtn = document.getElementById("accountMenuJoinTeam");
  if (!menu || !trigger || !teamsList) return;

  const position = (): void => {
    const rect = trigger.getBoundingClientRect();
    // Anchored above the trigger (the sidebar row sits at the bottom of the
    // rail, so there's rarely room below it) and clamped to the viewport so
    // a narrow window never pushes the menu off-screen.
    const width = 260;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    menu.style.left = `${left}px`;
    menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  };

  trigger.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("#sidebarSignOut")) return;
    event.preventDefault();
    event.stopPropagation();
    position();
    menu.showPopover?.();
    void loadTeams();
  });

  createBtn?.addEventListener("click", () => {
    menu.hidePopover?.();
    window.dispatchEvent(new Event("doodleai:open-team-name"));
  });
  joinBtn?.addEventListener("click", () => {
    menu.hidePopover?.();
    window.dispatchEvent(new Event("doodleai:open-team-join"));
  });

  window.addEventListener("resize", () => {
    if (menu.matches(":popover-open")) position();
  });

  async function loadTeams(): Promise<void> {
    if (!teamsList) return;
    teamsList.innerHTML = '<div class="account-menu-loading">Loading…</div>';
    try {
      const res = await fetch("/api/v1/orgs", { credentials: "include" });
      if (!res.ok) throw new Error();
      const payload = (await res.json()) as { orgs: OrgDto[]; activeOrgId: string };
      renderTeams(payload.orgs, payload.activeOrgId);
    } catch {
      teamsList.innerHTML = '<div class="account-menu-loading">Couldn\'t load your teams.</div>';
    }
  }

  function renderTeams(orgs: OrgDto[], activeOrgId: string): void {
    if (!teamsList) return;
    teamsList.innerHTML = "";
    orgs.forEach((org) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "account-menu-team";
      row.dataset.active = String(org.id === activeOrgId);

      const avatar = document.createElement("span");
      avatar.className = "account-menu-team-avatar";
      avatar.textContent = org.name.charAt(0).toUpperCase();

      const meta = document.createElement("span");
      meta.className = "account-menu-team-meta";
      const name = document.createElement("span");
      name.className = "account-menu-team-name";
      name.textContent = org.isPersonal ? "Just you" : org.name;
      const sub = document.createElement("span");
      sub.className = "account-menu-team-sub";
      sub.textContent = `${org.balance} credit${org.balance === 1 ? "" : "s"} · ${org.memberCount} member${org.memberCount === 1 ? "" : "s"}`;
      meta.appendChild(name);
      meta.appendChild(sub);

      row.appendChild(avatar);
      row.appendChild(meta);

      if (org.id === activeOrgId) {
        const check = document.createElement("span");
        check.className = "account-menu-team-check";
        check.innerHTML =
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        row.appendChild(check);
      } else {
        row.addEventListener("click", () => void switchTeam(org));
      }

      teamsList.appendChild(row);
    });
  }

  async function switchTeam(org: OrgDto): Promise<void> {
    menu?.hidePopover?.();
    try {
      const res = await fetch(`/api/v1/orgs/${org.id}/switch`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      showToast(`Switched to ${org.isPersonal ? "your workspace" : org.name}`);
      // Hard reload rather than in-place rescoping — every store caches its
      // scoped key at module load, matching switchOrg()'s own reasoning in
      // api-client.ts.
      window.setTimeout(() => window.location.reload(), 300);
    } catch {
      showToast("Couldn't switch teams — try again.");
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAccountMenu);
} else {
  initAccountMenu();
}
