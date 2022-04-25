import { beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { read, write } from "../lib/cache.mjs";

describe("cache", () => {
  const CACHE_DIR = path.join(process.cwd(), "__test__", ".cache");
  beforeEach(() => {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR);
    }
  });
  describe("write", () => {
    it("should write a cache file correctly", async () => {
      const filePath = path.join(CACHE_DIR, "sample.json");
      await write(
        filePath,
        {
          code: 'module.exports = "hello";',
        },
        false
      );
      expect(fs.existsSync(filePath)).toBe(true);
    });
    it("should compress", async () => {
      const filename = "sample.json";
      const filePath = path.join(CACHE_DIR, filename);
      await write(
        filePath,
        {
          code: 'module.exports = "hello";',
        },
        true
      );
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });
  describe("read", () => {
    it("should read the cache file correctly", async () => {
      const filePath = path.join(CACHE_DIR, "sample");
      fs.writeFileSync(
        filePath + ".json",
        JSON.stringify({ code: 'module.exports = "hello";' })
      );
      const result = await read(filePath, false);
      expect(result).toMatchObject(
        expect.objectContaining({
          code: expect.any(String),
        })
      );
    });
  });
});
