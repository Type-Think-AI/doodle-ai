import eslint from "@eslint/js";
import astro from "eslint-plugin-astro";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dist.tmp/**",
      "node_modules/**",
      ".astro/**",
      "coverage/**",
      ".design-import/**",
      ".wrangler/**",
      "worker-configuration.d.ts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs["flat/recommended"],
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,astro}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.astro"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    /* The WebMCP agent tester is a Chrome extension, not part of the site
     * bundle: its background service worker, content script, injected script and
     * side panel all run against the `chrome.*` extension APIs. Without the
     * webextensions globals every one of those references is a `no-undef`, which
     * was 21 of the 56 lint errors — a config gap reported as source bugs.
     *
     * Same class of mistake as the earlier dist.tmp flood: when lint reports a
     * wall of errors, check what it is being told about the environment before
     * editing any source.
     */
    files: ["tools/webmcp-agent-tester/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.webextensions,
      },
    },
  },
);
