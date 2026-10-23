import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("app frame owns the viewport and scroll restoration targets the page area", () => {
  const route = readFileSync(
    new URL("../../routes/_authenticated/route.tsx", import.meta.url),
    "utf8",
  );
  const router = readFileSync(new URL("../../router.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(route, /data-app-frame className="[^"]*fixed inset-0[^"]*overflow-hidden/);
  assert.match(
    route,
    /data-app-scroll[\s\S]*?data-scroll-restoration-id="app-content"[\s\S]*?className="[^"]*overflow-y-auto/,
  );
  assert.match(router, /scrollToTopSelectors: \["\[data-app-scroll\]"\]/);
  assert.doesNotMatch(css.match(/\.app-ambient \{([^}]+)\}/)?.[1] ?? "", /position:/);
});

test("topbar stays opaque and fixed-height while sidebar content can scroll independently", () => {
  const topbar = readFileSync(new URL("./topbar.tsx", import.meta.url), "utf8");
  const sidebar = readFileSync(new URL("./sidebar.tsx", import.meta.url), "utf8");
  const transition = readFileSync(
    new URL("../motion/page-transition.tsx", import.meta.url),
    "utf8",
  );
  assert.match(topbar, /<header className="[^"]*sticky top-0[^"]*shrink-0[^"]*bg-background/);
  assert.doesNotMatch(topbar, /window\.scrollY|translate-y/);
  assert.match(sidebar, /<aside className="[^"]*h-full/);
  assert.match(sidebar, /<nav className="min-h-0[^"]*overflow-y-auto overscroll-y-contain/);
  assert.match(transition, /className="flex min-h-full flex-col"/);
});
