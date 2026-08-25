/* GET|POST|PATCH|DELETE /api/v1/references
 *
 * A pure alias for /api/v1/characters. The `character` table IS the team's
 * shared reference library (see the taxonomy note in
 * src/db/schema/product.ts) — there is no second table and no second query,
 * only a second URL, so that team-facing UI can speak "References" while
 * /characters keeps its personal-org wording.
 *
 * The wire shape is deliberately identical too (`{ characters: [...] }`):
 * renaming the envelope here would fork the client stores for no gain, and
 * a route that is literally the same handler cannot drift from the one it
 * aliases.
 */
export { GET, POST, PATCH, DELETE, prerender } from "../characters";
