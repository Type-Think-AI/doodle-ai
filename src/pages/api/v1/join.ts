/* POST /api/v1/join — the body-based accept endpoint.
 *
 * The tokenized sibling owns the implementation because GET /join/:token
 * needs the same resolver and public preview. Re-exporting POST here gives
 * the browser a clean `/api/v1/join` action URL while keeping the two token
 * shapes (`i-<invitationId>` and reusable tokens) in one implementation.
 */
export { GET, POST, prerender } from "./join/[token]";
