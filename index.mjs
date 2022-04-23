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

const options = yargs(process.argv).argv;
const entryPoint = resolve(process.cwd(), options.entryPoint);

const root = join(dirname(fileURLToPath(import.meta.url)), "product");

const hasteMap = new JestHasteMap.default({
  extensions: ["js"],
  maxWorkers: cpus.length,
  name: "jest-bundler",
  platforms: [],
  rootDir: root,
  roots: [root],
});

const { hasteFS, moduleMap } = await hasteMap.build();
if (!hasteFS.exists(entryPoint)) {
  throw new Error(
    "`--entry-point` does not exist. Please provide a path to a valid file."
  );
}
console.log(chalk.bold(`❯ Building ${chalk.blue(options.entryPoint)}`));
console.log(hasteFS.getAllFiles());
console.log(hasteFS.getDependencies(entryPoint));

const resolver = new Resolver.default(moduleMap, {
  extensions: [".js"],
  hasCoreModules: false,
  rootDir: root,
});

const dependencyResolver = new DependencyResolver(resolver, hasteFS);

console.log(dependencyResolver.resolve(entryPoint));

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
console.log(Array.from(seen));

const wrapModule = (id, code) =>
  `define(${id}, function(module, exports, require) {\n${code}});`;

console.log(chalk.bold(`❯ Serializing bundle`));

const worker = new Worker(
  join(dirname(fileURLToPath(import.meta.url)), "worker.js"),
  {
    enableWorkerThreads: true,
  }
);

const results = await Promise.all(
  Array.from(modules)
    .reverse()
    .map(async ([module, metadata]) => {
      let { id, code } = metadata;
      ({ code } = await worker.transformFile(code));
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
  fs.readFileSync("./require.js", "utf8"),
  ...results,
  "requireModule(0);",
].join("\n");

console.log(output);

if (options.output) {
  fs.writeFileSync(options.output, output, "utf8");
}

worker.end();
