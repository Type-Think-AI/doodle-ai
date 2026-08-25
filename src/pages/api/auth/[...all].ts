import type { APIContext } from "astro";
import { createAuth } from "../../../lib/auth";

export const prerender = false;

/**
 * Better Auth's own handler: sign-up, sign-in, sign-out, OAuth callbacks,
 * session refresh. Everything under /api/auth/* is owned by the library.
 *
 * This sits outside the /api/v1 namespace deliberately — Better Auth owns
 * these paths and its own compatibility, and its client SDKs expect them here.
 */
export const ALL = async (context: APIContext): Promise<Response> =>
  (await createAuth(context)).handler(context.request);
