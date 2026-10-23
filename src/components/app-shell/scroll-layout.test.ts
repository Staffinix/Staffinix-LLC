import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("server-side candidate and requirements searches debounce typing and cancel obsolete timers", () => {
  const hook = readFileSync(new URL("../../hooks/use-debounced-value.ts", import.meta.url), "utf8");
  assert.match(hook, /delay = 250/);
  assert.match(hook, /clearTimeout\(timer\)/);
  for (const file of ["candidates.index.tsx", "requirements.index.tsx"]) {
    const route = readFileSync(
      new URL(`../../routes/_authenticated/${file}`, import.meta.url),
      "utf8",
    );
    assert.match(route, /useDebouncedValue\(search\)/);
    assert.match(route, /search: debouncedSearch/);
  }
});

test("navigation mounts immediately, preloads on intent, and defers Copilot", () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const transition = source("../motion/page-transition.tsx");
  assert.doesNotMatch(transition, /AnimatePresence|mode="wait"/);
  assert.match(transition, /initial=\{false\}/);
  assert.match(source("../../router.tsx"), /defaultPreload: "intent"/);
  const drawer = source("../ai/copilot-drawer.tsx");
  assert.match(drawer, /lazy\(/);
  assert.match(drawer, /import\("\.\/copilot-panel"\)/);
  assert.match(drawer, /<Suspense/);
  assert.doesNotMatch(drawer, /from "@\/lib\/copilot.functions"/);
});

test("one root session provider owns verification; consumers do not repeat it", () => {
  const root = readFileSync(new URL("../../routes/__root.tsx", import.meta.url), "utf8");
  const session = readFileSync(new URL("../../hooks/use-session.ts", import.meta.url), "utf8");
  assert.match(root, /<SessionProvider>[\s\S]*?<Outlet \/>[\s\S]*?<\/SessionProvider>/);
  assert.match(
    session,
    /function useSession\(\) \{\s*const session = useContext\(SessionContext\)/,
  );
  assert.equal((session.match(/useVerifiedSession\(\);/g) ?? []).length, 1);
  assert.match(session, /supabase.auth.getUser\(\)/);
  assert.match(session, /currentRevision !== revision/);
  assert.match(session, /event === "SIGNED_OUT"\) \{\s*revision\+\+/);
});

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
