/// <reference types="vite/client" />

// Build-time flag injected by `vite build --define`: true only in the isolated verification
// bundle produced by scripts/browser-harness.ts; always false in the shipped build so the
// failure-injection and frame-readback hooks are dead-code-eliminated there.
declare const __VERIFY_HOOKS__: boolean;
