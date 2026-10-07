import test from "node:test";
import assert from "node:assert/strict";
import { assertDisposableDatabase } from "./database-safety";
test("database tests require explicit disposable host and reject production aliases",()=>{
  const isolated="postgresql://test:fixture@ep-isolated.neon.tech/neondb";
  assert.throws(()=>assertDisposableDatabase(isolated,undefined));
  assert.throws(()=>assertDisposableDatabase(isolated,"ep-other.neon.tech"));
  assert.throws(()=>assertDisposableDatabase(isolated,"ep-isolated.neon.tech","postgresql://other:fixture@ep-isolated-pooler.neon.tech/neondb"));
  assert.throws(()=>assertDisposableDatabase("not a url","ep-isolated.neon.tech"));
  assert.doesNotThrow(()=>assertDisposableDatabase(isolated,"ep-isolated.neon.tech","postgresql://other:fixture@ep-production.neon.tech/neondb"));
});
