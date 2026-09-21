// DOM adapter for the Theme chooser (002 T024/T030): a native-radio modal that emits
// lifecycle events — it never steers, throttles, or touches renderer state. Session
// transitions live in sim/session.ts; this file only reflects ChooserState into the DOM
// and reports user intent back. Busy states disable Fly/Cancel/selection without trapping
// focus; Escape acts as Cancel only when the session allows it.
import type { ThemeId } from "../sim/themes";
import { cancelOffered, isBusy, type ChooserState } from "../sim/session";

export interface ChooserCallbacks {
  onSelect(id: ThemeId): void;
  onFly(): void;
  onCancel(): void;
  onRetry(): void;
}

export interface ChooserHandle {
  /** Reflect a session state into the DOM (phase, selection, busy, errors, Cancel). */
  sync(state: ChooserState): void;
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  /** Attach a decoded card image URL (or mark the card failed). */
  setCardImage(id: ThemeId, url: string | null, failed?: boolean): void;
  setStatus(text: string): void;
  focus(): void;
}

const THEME_ORDER: ThemeId[] = ["nature", "alien", "arctic"];

export function createChooser(cb: ChooserCallbacks): ChooserHandle {
  const root = document.getElementById("chooser") as HTMLElement;
  const panel = root.querySelector(".chooser-panel") as HTMLElement;
  const flyBtn = document.getElementById("fly") as HTMLButtonElement;
  const cancelBtn = document.getElementById("cancel") as HTMLButtonElement;
  const statusEl = document.getElementById("chooser-status") as HTMLElement;
  const errorEl = document.getElementById("chooser-error") as HTMLElement;
  const radios = new Map<ThemeId, HTMLInputElement>();
  const images = new Map<ThemeId, HTMLImageElement>();
  const fallbacks = new Map<ThemeId, HTMLElement>();
  for (const id of THEME_ORDER) {
    radios.set(id, root.querySelector(`input[value="${id}"]`) as HTMLInputElement);
    images.set(id, root.querySelector(`img[data-theme-img="${id}"]`) as HTMLImageElement);
    fallbacks.set(id, root.querySelector(`[data-theme-fallback="${id}"]`) as HTMLElement);
  }

  let open = false;
  let lastFocused: Element | null = null;
  let cancelAllowed = false;

  radios.forEach((input, id) => {
    input.addEventListener("change", () => {
      if (input.checked) cb.onSelect(id);
    });
  });
  flyBtn.addEventListener("click", () => cb.onFly());
  cancelBtn.addEventListener("click", () => cb.onCancel());

  // Escape = Cancel only when a prior flight exists; Space/Enter/arrows are native radios.
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && cancelAllowed) {
      e.stopPropagation();
      cb.onCancel();
      return;
    }
    if (e.key === "Tab") {
      // keep focus cycling inside the dialog while it is open (never a trap on a disabled
      // control — disabled buttons are skipped)
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>("input, button"),
      ).filter(
        (el) => !(el as HTMLInputElement | HTMLButtonElement).disabled && el.offsetParent !== null,
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  return {
    get isOpen() {
      return open;
    },

    open() {
      if (open) return;
      open = true;
      lastFocused = document.activeElement;
      root.hidden = false;
      // move focus into the dialog — Fly is the primary action
      flyBtn.focus();
    },

    close() {
      if (!open) return;
      open = false;
      root.hidden = true;
      // return focus to Change theme (or whatever had it) per the DOM contract
      (lastFocused as HTMLElement | null)?.focus?.();
      lastFocused = null;
    },

    sync(state: ChooserState) {
      const busy = isBusy(state);
      panel.classList.toggle("chooser-busy", busy);
      const sel = radios.get(state.selection);
      if (sel && !sel.checked) sel.checked = true;
      flyBtn.disabled = busy;
      // offered during preparing too — a mid-prep Cancel abandons the candidate and
      // rebuilds the paused world; disabled only while the rebuild itself runs
      cancelAllowed = cancelOffered(state);
      cancelBtn.hidden = !cancelAllowed;
      cancelBtn.disabled = state.phase === "restoring";
      radios.forEach((r) => {
        r.disabled = busy;
      });
      if (state.error) {
        errorEl.hidden = false;
        errorEl.textContent = `Could not ${state.error.kind === "startup" ? "start" : state.error.kind === "launch" ? "launch" : "restore"}: ${state.error.message}`;
      } else {
        errorEl.hidden = true;
        errorEl.textContent = "";
      }
    },

    setCardImage(id: ThemeId, url: string | null, failed = false) {
      const img = images.get(id);
      const fb = fallbacks.get(id);
      if (!img || !fb) return;
      if (url) {
        img.src = url;
        img.dataset.state = "ready";
        fb.dataset.state = "ready";
      } else if (failed) {
        img.removeAttribute("src");
        img.dataset.state = "failed";
        fb.dataset.state = "failed";
      } else {
        img.dataset.state = "pending";
        fb.dataset.state = "pending";
      }
    },

    setStatus(text: string) {
      statusEl.textContent = text;
    },

    focus() {
      flyBtn.focus();
    },
  };
}
