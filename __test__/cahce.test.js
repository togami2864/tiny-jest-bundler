import { beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("cache", () => {
  const CACHE_DIR = path.join(process.cwd(), "__test__", ".cache");
  beforeEach(() => {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR);
    }
  });
  describe("write", () => {
    const write = async (filename, result) => {
      const content = JSON.stringify(result);
      return await fs.promises.writeFile(filename, content);
    };
    it("should write a cache file correctly", async () => {
      const filePath = path.join(CACHE_DIR, "sample.json");
      await write(filePath, {
        code: 'module.exports = "hello";',
      });
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });
  describe("read", () => {
    const read = async (filename) => {
      const content = fs.readFileSync(filename);
      return JSON.parse(content.toString());
    };
    it("should read the cache file correctly", async () => {
      const filePath = path.join(CACHE_DIR, "sample.json");
      const result = await read(filePath);
      expect(result).toMatchObject(
        expect.objectContaining({
          code: expect.any(String),
        })
      );
    });
  });
});
