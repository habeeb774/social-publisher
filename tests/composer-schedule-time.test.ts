import test from "node:test";
import assert from "node:assert/strict";
import { isoToRiyadhInput, riyadhInputToIso } from "../src/services/post-time";

test("changing each composer hour and minute preserves Riyadh time through save and reload", () => {
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute++) {
      const local = `2030-10-10T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const saved = riyadhInputToIso(local);
      assert.equal(isoToRiyadhInput(saved), local);
      assert.equal(new Date(saved).getTime(), Date.parse(`${local}:00+03:00`));
    }
  }
});
