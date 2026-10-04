// Tolerates whitespace, casing and stray quotes from dashboard-entered values ("True", " true", "\"true\"").
export function isPublishingEnabled() {
  return (process.env.PUBLISHING_ENABLED ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase() === "true";
}
