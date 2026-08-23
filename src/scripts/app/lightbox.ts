/* Generic full-screen viewer controller for Lightbox.astro. Each page that
   includes <Lightbox /> calls initLightbox() once, then openLightbox(items,
   startUrl) whenever a tile/result is clicked. */

let items: string[] = [];
let index = 0;
let ready = false;

let backdrop: HTMLElement | null = null;
let img: HTMLImageElement | null = null;
let closeBtn: HTMLElement | null = null;
let prevBtn: HTMLButtonElement | null = null;
let nextBtn: HTMLButtonElement | null = null;
let counter: HTMLElement | null = null;

function updateNav(): void {
  const multiple = items.length > 1;
  if (prevBtn) prevBtn.hidden = !multiple;
  if (nextBtn) nextBtn.hidden = !multiple;
  if (counter) {
    counter.hidden = !multiple;
    if (multiple) counter.textContent = `${index + 1} / ${items.length}`;
  }
}

function showAt(i: number): void {
  if (items.length === 0 || !img) return;
  index = (i + items.length) % items.length;
  img.src = items[index];
  updateNav();
}

export function openLightbox(list: string[], startUrl: string): void {
  if (!ready) initLightbox();
  if (!backdrop || !img) return;
  items = list;
  const start = items.indexOf(startUrl);
  backdrop.classList.add("open");
  document.body.classList.add("lightbox-lock");
  showAt(start === -1 ? 0 : start);
  closeBtn?.focus();
}

function closeLightbox(): void {
  if (!backdrop || !img) return;
  backdrop.classList.remove("open");
  document.body.classList.remove("lightbox-lock");
  img.removeAttribute("src");
}

export function initLightbox(): void {
  if (ready) return;
  backdrop = document.getElementById("lightboxBackdrop");
  img = document.getElementById("lightboxImg") as HTMLImageElement | null;
  closeBtn = document.getElementById("lightboxClose");
  prevBtn = document.getElementById("lightboxPrev") as HTMLButtonElement | null;
  nextBtn = document.getElementById("lightboxNext") as HTMLButtonElement | null;
  counter = document.getElementById("lightboxCounter");
  if (!backdrop || !img) return;

  closeBtn?.addEventListener("click", closeLightbox);
  prevBtn?.addEventListener("click", () => showAt(index - 1));
  nextBtn?.addEventListener("click", () => showAt(index + 1));
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (!backdrop!.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") showAt(index - 1);
    else if (e.key === "ArrowRight") showAt(index + 1);
  });
  ready = true;
}
