type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    // Access bindings via Astro.locals.runtime.env
  }
}

interface Env {
  ASSETS: Fetcher;
}
