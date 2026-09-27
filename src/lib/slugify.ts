/**
 * slugify.ts
 *
 * Converts a board title into a safe ASCII filename slug.
 *
 * Rules:
 *  - Lower-case everything
 *  - Drop all non-ASCII characters (no transliteration)
 *  - Replace runs of whitespace / punctuation with a single hyphen
 *  - Strip leading/trailing hyphens
 *  - Fall back to "board" if the result is empty
 *
 * Collision safety is handled by the caller via makeUniqueSlug().
 */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    // drop non-ASCII
    .replace(/[^\x00-\x7F]/g, "")
    // replace anything that isn't alphanumeric with a hyphen
    .replace(/[^a-z0-9]+/g, "-")
    // trim leading/trailing hyphens
    .replace(/^-+|-+$/g, "");

  return base.length > 0 ? base : "board";
}

/**
 * Given a desired slug and the set of slugs already in use, returns a
 * collision-safe version by appending -2, -3, … as needed.
 *
 * @param desired   The output of slugify(title)
 * @param existing  All slugs currently occupied (e.g. from boardIO.listBoards)
 * @param selfSlug  The slug of the board being renamed (exclude from collision
 *                  check so a board can keep its own slug on rename)
 */
export function makeUniqueSlug(
  desired: string,
  existing: string[],
  selfSlug?: string,
): string {
  const occupied = new Set(
    selfSlug ? existing.filter((s) => s !== selfSlug) : existing,
  );

  if (!occupied.has(desired)) return desired;

  let n = 2;
  while (occupied.has(`${desired}-${n}`)) n++;
  return `${desired}-${n}`;
}
