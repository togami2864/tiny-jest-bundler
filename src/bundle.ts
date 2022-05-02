import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";

import chalk from "chalk";
import { Worker } from "jest-worker";
import { read, write, cacheFileName } from "./cache";

export async function bundle(moduleMap, options) {
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
    if (!existsSync(CACHE_DIR)) {
      await fs.mkdir(CACHE_DIR, { recursive: true });
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
        let id = metadata.id;
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
    await fs.readFile(path.join(__dirname, "./require.js"), "utf8"),
    ...results,
    "requireModule(0);",
  ].join("\n");

  const jsFile = {
    content: jsBundle,
    filepath: path.join(options.output, "bundle.js"),
  };
  return jsFile;
}

export async function createHTMLOutput(options, jsFilepath) {
  const html = await fs.readFile(
    path.resolve(process.cwd(), "index.html"),
    "utf-8"
  );
  const bodyRex = /<\/body>/i;
  const injectedHtml = html.replace(
    bodyRex,
    `<script src="${jsFilepath}">` + "</script>" + "\n</body>"
  );

  const htmlFile = {
    content: injectedHtml,
    filepath: path.resolve(options.output, "output.html"),
  };

  return htmlFile;
}
