export async function confirmCurrentSelection(request: number, current: () => number, confirm: () => Promise<boolean>) {
  if (request !== current()) return false;
  return await confirm() && request === current();
}
