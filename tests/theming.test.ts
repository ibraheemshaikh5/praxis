import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Theme colors come from the `:root` / `.dark` token pairs in app/globals.css.
 * Two things break that contract, so both are checked here rather than left to
 * review: a literal `dark` class pins a subtree to the dark palette regardless
 * of the app theme (shadcn ships popovers this way), and a raw Tailwind palette
 * color has no light/dark counterpart at all.
 */

const ROOTS = ["app", "components", "hooks", "lib"];

// A standalone `dark` class token inside a class string. `dark:` variants are
// fine — the colon keeps them out of this match.
const FORCED_DARK = /(?:className|class)\s*=\s*[{"']?[^;\n]*?["'`][^"'`\n]*\bdark\b(?!:)/;

const RAW_PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

// The modal scrim is a deliberate constant: it dims whatever is behind it and
// reads the same in both themes.
const ALLOWED_RAW = new Set(["components/ui/dialog.tsx"]);

function sourceFiles() {
  const files: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (/\.tsx?$/.test(entry)) {
        files.push(path);
      }
    }
  }

  for (const root of ROOTS) walk(root);

  return files;
}

function offendingLines(pattern: RegExp, skip: (file: string) => boolean) {
  const hits: string[] = [];

  for (const file of sourceFiles()) {
    if (skip(file)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (pattern.test(line)) hits.push(`${file}:${index + 1}`);
      });
  }

  return hits;
}

describe("theming", () => {
  it("never pins a subtree to one palette with a literal dark class", () => {
    expect(offendingLines(FORCED_DARK, () => false)).toEqual([]);
  });

  it("styles color with semantic tokens, not raw Tailwind palette colors", () => {
    expect(
      offendingLines(RAW_PALETTE, (file) => ALLOWED_RAW.has(file)),
    ).toEqual([]);
  });
});
