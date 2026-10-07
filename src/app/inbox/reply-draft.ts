type Thread = { kind: "comment" | "messenger"; id: string };

export function draftAfterOpening(current: Thread | null, next: Thread, text: string, clear = false): string {
  return !clear && current?.kind === next.kind && current.id === next.id ? text : "";
}
