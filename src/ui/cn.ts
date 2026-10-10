/** Joins class names, skipping falsy values. No tailwind-merge: write each class once, never rely on one overriding another. */
export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
