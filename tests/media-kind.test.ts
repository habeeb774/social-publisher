import test from "node:test";
import assert from "node:assert/strict";
import { isVideoUrl } from "../src/services/media-kind";

test("detects MP4/MOV attachments as video, including Blob URLs with suffixes and query strings", () => {
  assert.equal(isVideoUrl("https://x.public.blob.vercel-storage.com/media/videos/clip-AbC123.mp4"), true);
  assert.equal(isVideoUrl("https://cdn.example.com/a/b/movie.MOV?token=1"), true);
  assert.equal(isVideoUrl("https://cdn.example.com/a.m4v#t=3"), true);
});
test("images, empty values and look-alike names are not video", () => {
  assert.equal(isVideoUrl("https://cdn.example.com/photo.jpg"), false);
  assert.equal(isVideoUrl("https://cdn.example.com/mp4-guide.png"), false);
  assert.equal(isVideoUrl(""), false);
  assert.equal(isVideoUrl(null), false);
});
