/**
 * Types for `mixpanel-browser`'s alternate loader entrypoints.
 *
 * Upstream ships `src/loaders/loader-module-with-async-modules.d.ts` as nothing
 * but `export * from '../index'`. That re-exports the package's named function
 * exports but NOT its `default`, so a default import resolves to the module
 * namespace and loses every method that only exists on the instance — including
 * `get_session_replay_url`, `start_session_recording` and
 * `stop_session_recording`, which are exactly the Session Replay controls we use.
 *
 * The runtime object is the same `OverridedMixpanel` instance the package root
 * exports (see src/loaders/loader-module-with-async-modules.js — it returns
 * `init_as_module(loadAsync)`), so declaring that here is accurate rather than a
 * cast that papers over a mismatch. Remove this file if upstream fixes the
 * declaration.
 */

declare module "mixpanel-browser/src/loaders/loader-module-with-async-modules" {
  import type { OverridedMixpanel } from "mixpanel-browser";

  const mixpanel: OverridedMixpanel;
  export default mixpanel;
}
