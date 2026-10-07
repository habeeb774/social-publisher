// A write may complete after the user has opened another thread or left the inbox.
// Refresh only the selection generation that initiated that write.
export async function refreshCurrentSelection(request: number, current: () => number, refresh: () => Promise<void>) {
  if (request !== current()) return false;
  await refresh();
  return true;
}
