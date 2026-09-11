/**
 * A monogram for an avatar with no photo (SVC-273).
 *
 * `profile_photo_url` is null for most providers — the upload is skippable
 * during onboarding — so this is the common path, not the exception. An empty
 * grey circle would leave the only entry point into Provider Profile looking
 * like a rendering bug.
 *
 * Its own module rather than living beside the component: it is a pure string
 * function, and a component file that also exports helpers loses React Fast
 * Refresh for the whole file.
 */

/**
 * First letters of the first two words — "Ravi Kumar" reads as RK.
 *
 * Returns null rather than a placeholder when there is nothing usable, so the
 * caller can fall back to an icon. A provider part-way through onboarding
 * genuinely has no name yet, and "?" in a circle says less than a person
 * glyph does.
 */
export function initialsFrom(name: string | null | undefined): string | null {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const letters = words
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  // Digits and punctuation make a poor monogram: a phone number saved as a
  // name would otherwise render as "93", which reads as data rather than a
  // person.
  return /[a-z]/i.test(letters) ? letters.toUpperCase() : null;
}
