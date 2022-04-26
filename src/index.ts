#!/usr/bin/env node
import JestHasteMap from "jest-haste-map";
import Resolver from "jest-resolve";
import { DependencyResolver } from "jest-resolve-dependencies";
import { cpus } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import yargs from "yargs";
import fs from "fs";
import { Worker } from "jest-worker";
import { minify } from "terser";
import { read, write, cacheFileName } from "./cache.mjs";

const options = yargs(process.argv).options({
  entryPoint: {
    type: "string",
  },
  output: {
    type: "string",
  },
  html: {
    type: "string",
  },
  minify: {
    type: "boolean",
    default: true,
  },
}).argv;

const entryPoint = resolve(process.cwd(), options.entryPoint);

const root = process.cwd();
console.log("root", root);
const start = performance.now();
// @ts-ignore
const hasteMap = new JestHasteMap.default({
  extensions: ["js"],
  maxWorkers: cpus.length,
  name: "jest-bundler",
  platforms: [],
  rootDir: root,
  // monkey patch
  roots: [root, "node_modules"],
});

const { hasteFS, moduleMap } = await hasteMap.build();
if (!hasteFS.exists(entryPoint)) {
  console.log(chalk.bold("entry:", entryPoint));
  throw new Error(
    "`--entry-point` does not exist. Please provide a path to a valid file."
  );
}
console.log(chalk.bold(`❯ Building ${chalk.blue(options.entryPoint)}`));

// @ts-ignore
const resolver = new Resolver.default(moduleMap, {
  extensions: [".js"],
  hasCoreModules: false,
  rootDir: root,
});

// @ts-ignore
const dependencyResolver = new DependencyResolver(resolver, hasteFS);

const seen = new Set();
const modules = new Map();
const queue = [entryPoint];
let id = 0;
while (queue.length) {
  const module = queue.shift();
  if (seen.has(module)) {
    continue;
  }
  seen.add(module);
  const dependencyMap = new Map(
    hasteFS
      .getDependencies(module)
      .map((dependencyName) => [
        dependencyName,
        resolver.resolveModule(module, dependencyName),
      ])
  );
  const code = fs.readFileSync(module, "utf8");
  const metadata = {
    id: id++,
    code,
    dependencyMap,
  };
  modules.set(module, metadata);
  queue.push(...dependencyResolver.resolve(module));
}

console.log(chalk.bold(`❯ Found ${chalk.blue(seen.size)} files`));

const wrapModule = (id, code) =>
  `define(${id}, function(module, exports, require) {\n${code}});`;

console.log(chalk.bold(`❯ Serializing bundle`));

const worker = new Worker(
  join(dirname(fileURLToPath(import.meta.url)), "./worker.cjs"),
  {
    enableWorkerThreads: true,
  }
);
const CACHE_DIR = "./node_modules/.cache/jest-bundler";

const checkCache = async (filename, metadata) => {
  const filepath = join(CACHE_DIR, filename);
  try {
    const code = await read(filepath, false);
    return { code };
  } catch {}
  const { code } = await worker.transformFile(metadata.code);
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  await write(filepath, code, false);
  return { code };
};

const results = await Promise.all(
  Array.from(modules)
    .reverse()
    .map(async ([module, metadata]) => {
      // トランスパイル前のコードをもとにhashを計算
      const filename = cacheFileName(metadata.code);
      let { id } = metadata.id;
      let { code } = await checkCache(filename, metadata);

      for (const [dependencyName, dependencyPath] of metadata.dependencyMap) {
        const dependency = modules.get(dependencyPath);
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
const output = [
  fs.readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "./require.cjs"),
    "utf8"
  ),
  ...results,
  "requireModule(0);",
].join("\n");

const code = options.minify
  ? await minify(output, { sourceMap: true }).then((res) => res.code)
  : output;

if (options.output) {
  fs.writeFileSync(options.output, code, "utf8");
  if (options.html) {
    const html = fs.readFileSync(options.html, "utf-8");
    const bodyRex = /<\/body>/i;
    const injectedHtml = html.replace(
      bodyRex,
      `<script src="${options.output}">` + "</script>" + "\n</body>"
    );
    fs.writeFileSync("output.html", injectedHtml, "utf-8");
  }
}
const end = performance.now();
console.log(
  chalk.bold(`jest-bundler compiled in ${end - start} milliseconds.`)
);
worker.end();
