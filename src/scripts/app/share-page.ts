/**
 * Client-side share page initialisation.
 *
 * Fetches the share link payload from GET /api/share/:token (unauthenticated)
 * and renders the appropriate view based on `scope`:
 *   - 'board'   → read-only grid of board items with real aspect ratios
 *   - 'project' → project assets in review/approved state (legacy)
 *   - 'asset'   → single asset view (legacy)
 */

interface SharedBoardView {
  scope: "board";
  boardName: string;
  orgName: string;
  allowComments: boolean;
  items: { id: string; url: string; note: string | null; width: number | null; height: number | null }[];
}

interface SharedProjectView {
  projectName: string;
  orgName: string;
  allowComments: boolean;
  assets: { id: string; url: string; name: string | null; reviewState: string }[];
}

type SharePayload = (SharedBoardView | SharedProjectView) & { error?: { message?: string } };

function isBoard(p: SharePayload): p is SharedBoardView {
  return "scope" in p && p.scope === "board";
}

async function initSharePage(): Promise<void> {
  const root = document.getElementById("sharePage");
  if (!root) return;
  const token = root.getAttribute("data-token");
  if (!token) return;

  try {
    const response = await fetch(`/api/share/${encodeURIComponent(token)}`);
    const payload = (await response.json()) as SharePayload;
    if (!response.ok) throw new Error(payload.error?.message || "This link isn't available.");

    const title = document.getElementById("shareTitle");
    const org = document.getElementById("shareOrg");
    const description = document.getElementById("shareDescription");
    const disclosure = document.getElementById("shareDisclosure");
    const grid = document.getElementById("shareGrid");

    if (isBoard(payload)) {
      // Board scope — render a read-only image grid
      if (title) title.textContent = payload.boardName;
      if (org) org.textContent = payload.orgName || "Shared workspace";
      const itemCount = payload.items.length;
      const accessLine = payload.allowComments ? "comments enabled" : "view only";
      if (description) {
        description.textContent = `Shared with you — ${accessLine} · ${itemCount} item${itemCount === 1 ? "" : "s"}`;
      }

      if (grid) {
        grid.innerHTML = "";
        for (const item of payload.items) {
          const figure = document.createElement("figure");
          figure.className = "share-asset";
          const img = document.createElement("img");
          img.src = item.url;
          img.alt = item.note || "Board item";
          img.loading = "lazy";
          // Real aspect ratio — use intrinsic dimensions if available
          if (item.width && item.height) {
            img.width = item.width;
            img.height = item.height;
            img.style.aspectRatio = `${item.width}/${item.height}`;
          }
          figure.appendChild(img);
          if (item.note) {
            const caption = document.createElement("figcaption");
            caption.textContent = item.note;
            figure.appendChild(caption);
          }
          grid.appendChild(figure);
        }
      }
    } else {
      // Legacy project/asset scope
      if (title) title.textContent = payload.projectName;
      if (org) org.textContent = payload.orgName || "Shared workspace";
      if (description) {
        description.textContent = `${payload.assets.length} asset${payload.assets.length === 1 ? "" : "s"}${payload.allowComments ? " · Comments enabled" : ""}`;
      }
      if (grid) {
        grid.innerHTML = "";
        for (const asset of payload.assets) {
          const figure = document.createElement("figure");
          figure.className = "share-asset";
          const img = document.createElement("img");
          img.src = asset.url;
          img.alt = asset.name || "Shared asset";
          img.loading = "lazy";
          figure.appendChild(img);
          const caption = document.createElement("figcaption");
          caption.textContent = asset.name || asset.reviewState.replaceAll("_", " ");
          figure.appendChild(caption);
          grid.appendChild(figure);
        }
      }
    }

    // Show the disclosure note
    if (disclosure) disclosure.hidden = false;
  } catch (err) {
    const title = document.getElementById("shareTitle");
    const description = document.getElementById("shareDescription");
    if (title) title.textContent = "Link unavailable";
    if (description) description.textContent = "";
    const error = document.getElementById("shareError");
    if (error) {
      error.textContent = err instanceof Error ? err.message : "This link isn't available.";
      error.hidden = false;
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initSharePage());
} else {
  void initSharePage();
}
