import * as fs from "node:fs";
import * as path from "node:path";

import chalk from "chalk";
import { Worker } from "jest-worker";
import { read, write, cacheFileName } from "./cache";

export async function bundle(moduleMap) {
  const wrapModule = (id, code) =>
    `define(${id}, function(module, exports, require) {\n${code}});`;

  console.log(chalk.bold(`❯ Serializing bundle`));

  const worker = new Worker(path.join(__dirname, "./worker.js"), {
    enableWorkerThreads: true,
  });
  const CACHE_DIR = "./node_modules/.cache/jest-bundler";

  const checkCache = async (filename, metadata) => {
    const filepath = path.join(CACHE_DIR, filename);
    try {
      const code = await read(filepath, false);
      return { code };
    } catch {}
    // @ts-ignore
    const { code } = await worker.transformFile(metadata.code);
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    await write(filepath, code, false);
    return { code };
  };
  const results = await Promise.all(
    Array.from(moduleMap)
      .reverse()
      .map(async ([module, metadata]) => {
        // トランスパイル前のコードをもとにhashを計算
        const filename = cacheFileName(metadata.code);
        let { id } = metadata.id;
        let { code } = await checkCache(filename, metadata);

        for (const [dependencyName, dependencyPath] of metadata.dependencyMap) {
          const dependency = moduleMap.get(dependencyPath);
          code = code.replace(
            new RegExp(
              `require\\(('|")${dependencyName.replace(/[\/.]/g, "\\$&")}\\1\\)`
            ),
            `require(${dependency.id})`
          );
        }
        return wrapModule(id, code);
      })
  );
  worker.end();

  const jsBundle = [
    fs.readFileSync(path.join(__dirname, "./require.js"), "utf8"),
    ...results,
    "requireModule(0);",
  ].join("\n");

  return jsBundle;
}
