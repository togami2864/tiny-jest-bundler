import { it, expect } from "vitest";
import { cacheFileName } from "../lib/cache.mjs";

it("should return the hash val if content is edited", () => {
  const content = 'module.exports = "hello";';
  const edited_content = 'module.exports = "hello World!!!!!";';

  const hash = cacheFileName(content);
  const edited_hash = cacheFileName(edited_content);

  expect(hash.length).toBe(32 + 5);
  expect(hash).not.toEqual(edited_hash);
});
