// Assemble the Lavish review page for the 003 aircraft study from captured PNGs + designs.json.
// Usage: npx vite-node scripts/build-aircraft-review.ts [dir]   (dir defaults to .lavish/aircraft-prototypes)
import { readFileSync, writeFileSync } from "node:fs";

const DIR = process.argv[2] ?? ".lavish/aircraft-prototypes";
const designs = JSON.parse(readFileSync(`${DIR}/designs.json`, "utf8")) as {
  id: string;
  type: string;
  name: string;
  description: string;
}[];

const TYPES: { id: string; label: string; cues: string }[] = [
  { id: "helicopter", label: "Helicopter", cues: "rounded glazed cabin, tail boom, main + tail rotor, skids" },
  { id: "light", label: "Light Plane", cues: "compact cabin, high wing, conventional tail, nose prop, fixed wheels" },
  { id: "fighter", label: "Fighter Jet", cues: "pointed nose, swept wings, canopy, tail, intake + exhaust" },
  { id: "airliner", label: "Passenger Jet", cues: "long fuselage, cockpit, window row, swept wings, two underwing engines" },
  { id: "biplane", label: "Biplane", cues: "two stacked wings, struts, open cockpit, prop, fixed wheels" },
  { id: "glider", label: "Glider", cues: "long slender wings, slim fuselage, canopy, tail, no engine" },
];

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const card = (d: { id: string; name: string; description: string }): string => `
<article class="cand" id="cand-${d.id}">
  <figure>
    <img class="shot" src="img/${d.id}-card.png" width="640" height="360" alt="${esc(d.name)} card view" data-id="${d.id}" loading="lazy">
    <figcaption>
      <span class="id">${d.id}</span>
      <strong>${esc(d.name)}</strong>
      <span class="desc">${esc(d.description)}</span>
    </figcaption>
  </figure>
  <fieldset class="views" aria-label="View for ${d.id}">
    <label><input type="radio" name="view-${d.id}" value="card" checked> Card</label>
    <label><input type="radio" name="view-${d.id}" value="detail"> Rear ¾</label>
    <label><input type="radio" name="view-${d.id}" value="level"> Chase</label>
    <label><input type="radio" name="view-${d.id}" value="bank"> Banking</label>
  </fieldset>
</article>`;

const section = (t: { id: string; label: string; cues: string }): string => {
  const list = designs.filter((d) => d.type === t.id);
  return `
<section class="type" id="type-${t.id}">
  <header>
    <h2>${t.label}</h2>
    <p class="cues">Spec cues: ${t.cues}.</p>
  </header>
  <div class="grid">${list.map(card).join("")}</div>
  <form class="pick" data-lavish-question="pick-${t.id}" onsubmit="queuePick(event, '${t.id}', '${t.label}')">
    <span class="pick-label">Direction for the ${t.label}:</span>
    ${list
      .map(
        (d) =>
          `<label><input type="radio" name="pick" value="${d.id}" data-name="${esc(d.name)}"> <b>${d.id}</b> ${esc(d.name)}</label>`,
      )
      .join("")}
    <label class="note"><span>Notes (optional)</span><input type="text" name="note" placeholder="e.g. keep L2 wheels, use L1 paint"></label>
    <button type="submit">Queue this choice</button>
    <output name="status" aria-live="polite"></output>
  </form>
</section>`;
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aircraft prototypes · 30 directions for Flying Planes</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :where(.grid, .flex) > * { min-width: 0; }
  :where(p, h1, h2, h3, li, figcaption) { overflow-wrap: anywhere; }
  :where(img, svg) { max-width: 100%; height: auto; }
  :root { color-scheme: dark; --ink: #f4f7fa; --muted: #b9c6d2; --panel: #10202e; --line: #ffffff26; --accent: #b8f1ea; }
  html { background: #0b1722; }
  body { margin: 0; color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    background: linear-gradient(180deg, #0b1722 0%, #12283a 40%, #0b1722 100%); }
  main { max-width: 1240px; margin: 0 auto; padding: 32px 20px 96px; }
  .hero small { letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  h1 { margin: 6px 0 10px; font-size: 30px; font-weight: 500; }
  .hero p { margin: 0 0 8px; color: var(--muted); max-width: 72ch; }
  nav.toc { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 8px; }
  nav.toc a { color: var(--ink); text-decoration: none; padding: 6px 12px; border: 1px solid var(--line); border-radius: 20px; background: #ffffff0d; }
  nav.toc a:hover { border-color: var(--accent); }
  .legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin: 16px 0 0; padding: 0; list-style: none; }
  .legend li { padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: #ffffff0a; font-size: 14px; color: var(--muted); }
  .legend b { color: var(--ink); }
  section.type { margin-top: 44px; padding-top: 20px; border-top: 1px solid var(--line); }
  section.type h2 { margin: 0; font-size: 24px; font-weight: 500; }
  .cues { margin: 4px 0 16px; color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
  .cand { border: 1px solid var(--line); border-radius: 16px; background: var(--panel); overflow: hidden; display: flex; flex-direction: column; }
  .cand figure { margin: 0; }
  .shot { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: linear-gradient(#6fa7d6 0%, #b9d6e8 55%, #dfece9 100%); }
  .shot.chase { object-fit: none; object-position: 50% 44%; }
  figcaption { padding: 12px 14px 4px; display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: baseline; }
  .id { font-family: ui-monospace, monospace; font-size: 13px; padding: 1px 8px; border-radius: 10px; background: var(--accent); color: #06231f; font-weight: 600; }
  figcaption strong { font-weight: 600; }
  .desc { grid-column: 1 / -1; color: var(--muted); font-size: 14px; }
  .views { margin: 6px 10px 12px; padding: 0; border: 0; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 13px; color: var(--muted); }
  .views label { display: inline-flex; gap: 5px; align-items: center; cursor: pointer; }
  .pick { margin-top: 16px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; background: #ffffff0a; display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; }
  .pick-label { font-weight: 600; }
  .pick label { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
  .pick .note { flex: 1 1 260px; display: flex; gap: 8px; align-items: center; color: var(--muted); }
  .pick input[type=text] { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); background: #0b1722; color: var(--ink); font: inherit; }
  .pick button { padding: 9px 16px; border: 0; border-radius: 24px; background: var(--accent); color: #06231f; font: inherit; font-weight: 600; cursor: pointer; }
  .pick output { font-size: 13px; color: var(--accent); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .global { margin-top: 48px; padding: 18px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); }
  .global h2 { margin: 0 0 6px; font-size: 20px; font-weight: 500; }
  .global fieldset { border: 0; padding: 0; margin: 10px 0; display: flex; flex-wrap: wrap; gap: 8px 18px; }
  .global label { display: inline-flex; gap: 6px; align-items: center; }
  .global textarea { width: 100%; min-height: 72px; margin-top: 8px; padding: 10px; border-radius: 10px; border: 1px solid var(--line); background: #0b1722; color: var(--ink); font: inherit; }
  .global button { margin-top: 10px; padding: 9px 16px; border: 0; border-radius: 24px; background: var(--accent); color: #06231f; font: inherit; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
<main>
  <div class="hero">
    <small>Flying Planes · feature 003 · design study</small>
    <h1>30 procedural aircraft directions, five per type</h1>
    <p>Every candidate is built from Three.js primitives and lofted cross-sections only (no models or textures), lit and framed like the future chooser cards. Each card can flip to a rear three-quarter view and to the two chase-camera views at the app's current on-screen size.</p>
    <p>Pick one direction per type (or mix parts in the notes), then send. Choices stay local until you press <em>Queue this choice</em>.</p>
    <nav class="toc" aria-label="Aircraft types">${TYPES.map((t) => `<a href="#type-${t.id}">${t.label}</a>`).join("")}</nav>
    <ul class="legend">
      <li><b>Card</b> · front three-quarter, the chooser card framing (bounding sphere fit).</li>
      <li><b>Rear ¾</b> · tail, engines and trailing edges.</li>
      <li><b>Chase / Banking</b> · the in-flight camera (60° FOV, 55 m behind), crop of a 1280×720 frame, aircraft scaled to the present 8 m box plane's footprint.</li>
      <li><b>Paint</b> · one fixed scheme per candidate; the chosen type's scheme can be swapped for any other in the row.</li>
    </ul>
  </div>
  ${TYPES.map(section).join("")}
  <section class="global">
    <h2>Whole-set questions</h2>
    <form data-lavish-question="global" onsubmit="queueGlobal(event)">
      <fieldset>
        <legend>In-flight size (all chase shots use the app's current footprint)</legend>
        <label><input type="radio" name="size" value="keep" checked> Keep current size</label>
        <label><input type="radio" name="size" value="x1.5"> About 1.5× larger</label>
        <label><input type="radio" name="size" value="x2"> About 2× larger</label>
      </fieldset>
      <fieldset>
        <legend>Shading</legend>
        <label><input type="radio" name="shading" value="phong" checked> Soft Phong as shown</label>
        <label><input type="radio" name="shading" value="flat"> Flat low-poly facets</label>
        <label><input type="radio" name="shading" value="toon"> Cel / toon bands</label>
      </fieldset>
      <textarea name="notes" placeholder="Anything that applies to all six: proportions, paint, glass tint, wheel sizes, rotor blade count..."></textarea>
      <button type="submit">Queue whole-set answers</button>
      <output name="status" aria-live="polite"></output>
    </form>
  </section>
</main>
<script>
  // View switcher: swap the candidate image; chase shots are shown as a centred crop (object-fit: none).
  document.querySelectorAll('.views').forEach((fs) => {
    fs.addEventListener('change', (e) => {
      const view = e.target.value;
      const img = fs.parentElement.querySelector('img.shot');
      img.src = 'img/' + img.dataset.id + '-' + view + '.png';
      img.classList.toggle('chase', view === 'level' || view === 'bank');
      img.alt = img.dataset.id + ' ' + view + ' view';
    });
  });
  function queuePick(event, type, label) {
    event.preventDefault();
    const form = event.currentTarget;
    const chosen = form.querySelector('input[name=pick]:checked');
    const note = form.note.value.trim();
    if (!chosen && !note) { form.status.value = 'Choose a direction or add a note first.'; return; }
    const summary = (chosen ? chosen.value + ' ' + chosen.dataset.name : 'no single pick') + (note ? ' — ' + note : '');
    window.lavish.queuePrompt(
      'For the ' + label + ', proceed with ' + summary + '.',
      { tag: 'aircraft-pick', text: label + ': ' + summary, element: form, queueKey: 'pick-' + type,
        data: { type, pick: chosen ? chosen.value : null, note } },
    );
    form.status.value = 'Queued: ' + summary;
  }
  function queueGlobal(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = { size: form.size.value, shading: form.shading.value, notes: form.notes.value.trim() };
    window.lavish.queuePrompt(
      'Whole-set: in-flight size ' + data.size + ', shading ' + data.shading + (data.notes ? '. Notes: ' + data.notes : '.'),
      { tag: 'aircraft-global', text: 'Whole-set answers', element: form, queueKey: 'global', data },
    );
    form.status.value = 'Queued whole-set answers.';
  }
</script>
</body>
</html>
`;
writeFileSync(`${DIR}/index.html`, html);
console.log(`wrote ${DIR}/index.html with ${designs.length} candidates`);
