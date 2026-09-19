---
status: accepted
---

# Three.js as the sole runtime dependency, with a fully procedural asset-free world

The app must feel "stunning" while shipping minimum code and hitting a 600 KB gzipped, 60 fps
budget. We chose Three.js as the single runtime dependency (rejecting raw WebGL2 as too much
code to own, and 2D canvas as unable to deliver the look) and decided that every landscape is
generated from a Seed and Biome parameters with no binary assets in the repo. Hand-authored
heightmaps, textures, or models would give finer visual control but break the payload budget and
make the repo undiffable; procedural generation also makes terrain deterministic and therefore
unit-testable.

## Consequences

- Visual variety must come from Biome parameters and shaders, not files.
- Any second runtime dependency needs its own ADR and a constitution amendment.
