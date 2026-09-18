const COMPACT = "(max-width: 860px)";

export const isCompact = () => window.matchMedia(COMPACT).matches;

/** Avisa cuando se cruza el umbral entre la disposicion amplia y la compacta. */
export function watchLayout(onChange) {
  const query = window.matchMedia(COMPACT);
  const notify = () => onChange(query.matches);
  query.addEventListener("change", notify);
  return {
    compact: () => query.matches,
    stop: () => query.removeEventListener("change", notify),
  };
}
