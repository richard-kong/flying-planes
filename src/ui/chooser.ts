// DOM adapter for the Flight chooser (002 T024/T030; Aircraft section added in 003 T016):
// a native-radio modal that emits lifecycle events — it never steers, throttles, or touches
// renderer state. Session transitions live in sim/session.ts; this file only reflects
// ChooserState into the DOM and reports user intent back. Busy states disable
// Fly/Cancel/selection without trapping focus; Escape acts as Cancel only when the session
// allows it.
import type { ThemeId } from "../sim/themes";
import { AIRCRAFT_ORDER, type AircraftTypeId } from "../sim/aircraft";
import { cancelOffered, isBusy, type ChooserState } from "../sim/session";

export interface ChooserCallbacks {
  onSelect(id: ThemeId): void;
  onSelectAircraft(id: AircraftTypeId): void;
  onFly(): void;
  onCancel(): void;
  onRetry(): void;
}

/** Card address shared with the preview pipeline: a ThemeId or an AircraftTypeId. */
export interface PreviewCardKey {
  kind: "theme" | "aircraft";
  id: string;
}

export interface ChooserHandle {
  /** Reflect a session state into the DOM (phase, selections, busy, errors, Cancel). */
  sync(state: ChooserState): void;
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  /** Attach a decoded card image URL (or mark the card failed). */
  setCardImage(card: PreviewCardKey, url: string | null, failed?: boolean): void;
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
  const themeRadios = new Map<ThemeId, HTMLInputElement>();
  const themeImages = new Map<string, HTMLImageElement>();
  const themeFallbacks = new Map<string, HTMLElement>();
  for (const id of THEME_ORDER) {
    themeRadios.set(
      id,
      root.querySelector(`input[name="theme"][value="${id}"]`) as HTMLInputElement,
    );
    themeImages.set(
      id,
      root.querySelector(`img[data-theme-img="${id}"]`) as HTMLImageElement,
    );
    themeFallbacks.set(
      id,
      root.querySelector(`[data-theme-fallback="${id}"]`) as HTMLElement,
    );
  }
  const aircraftRadios = new Map<AircraftTypeId, HTMLInputElement>();
  const aircraftImages = new Map<string, HTMLImageElement>();
  const aircraftFallbacks = new Map<string, HTMLElement>();
  for (const id of AIRCRAFT_ORDER) {
    aircraftRadios.set(
      id,
      root.querySelector(`input[name="aircraft"][value="${id}"]`) as HTMLInputElement,
    );
    aircraftImages.set(
      id,
      root.querySelector(`img[data-aircraft-img="${id}"]`) as HTMLImageElement,
    );
    aircraftFallbacks.set(
      id,
      root.querySelector(`[data-aircraft-fallback="${id}"]`) as HTMLElement,
    );
  }

  let open = false;
  let lastFocused: Element | null = null;
  let cancelAllowed = false;

  themeRadios.forEach((input, id) => {
    input.addEventListener("change", () => {
      if (input.checked) cb.onSelect(id);
    });
  });
  aircraftRadios.forEach((input, id) => {
    input.addEventListener("change", () => {
      if (input.checked) cb.onSelectAircraft(id);
    });
  });
  flyBtn.addEventListener("click", () => cb.onFly());
  cancelBtn.addEventListener("click", () => cb.onCancel());

  // Escape = Cancel only when a prior flight exists; Space/Enter/arrows are native radios.
  // Listener sits on document: when the busy state disables every control, focus falls to
  // <body> — outside this dialog — and a chooser-scoped keydown would never see the key.
  document.addEventListener("keydown", (e) => {
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
      // move focus into the dialog — Fly is the primary action; while it is disabled
      // (booting, preparing) the dialog root takes focus instead
      (flyBtn.disabled ? root : flyBtn).focus();
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
      const sel = themeRadios.get(state.selection);
      if (sel && !sel.checked) sel.checked = true;
      const selAircraft = aircraftRadios.get(state.aircraftSelection);
      if (selAircraft && !selAircraft.checked) selAircraft.checked = true;
      // session isBusy excludes booting (previews aren't an operation) but the chooser
      // is inert until its cards resolve
      flyBtn.disabled = busy || state.phase === "booting";
      // offered during preparing too — a mid-prep Cancel abandons the candidate and
      // rebuilds the paused world; disabled only while the rebuild itself runs
      cancelAllowed = cancelOffered(state);
      cancelBtn.hidden = !cancelAllowed;
      cancelBtn.disabled = state.phase === "restoring";
      themeRadios.forEach((r) => {
        r.disabled = busy;
      });
      aircraftRadios.forEach((r) => {
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

    setCardImage(card: PreviewCardKey, url: string | null, failed = false) {
      const img = (card.kind === "theme" ? themeImages : aircraftImages).get(card.id);
      const fb = (card.kind === "theme" ? themeFallbacks : aircraftFallbacks).get(card.id);
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
      (flyBtn.disabled ? root : flyBtn).focus();
    },
  };
}
