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

const options = yargs(process.argv).argv;
const entryPoint = resolve(process.cwd(), options.entryPoint);

const root = join(dirname(fileURLToPath(import.meta.url)));
console.log(root);
const start = performance.now();
const hasteMap = new JestHasteMap.default({
  extensions: ["js"],
  maxWorkers: cpus.length,
  name: "jest-bundler",
  platforms: [],
  rootDir: root,
  roots: [root, "node_modules"],
});

const { hasteFS, moduleMap } = await hasteMap.build();
if (!hasteFS.exists(entryPoint)) {
  throw new Error(
    "`--entry-point` does not exist. Please provide a path to a valid file."
  );
}
console.log(chalk.bold(`❯ Building ${chalk.blue(options.entryPoint)}`));

const resolver = new Resolver.default(moduleMap, {
  extensions: [".js"],
  hasCoreModules: false,
  rootDir: root,
});

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
