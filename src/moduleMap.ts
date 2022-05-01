import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import chalk from "chalk";

import JestHasteMap from "jest-haste-map";
import Resolver from "jest-resolve";
import { DependencyResolver } from "jest-resolve-dependencies";

export const createModuleMap = async (entryPointPath) => {
  const entryPoint = path.resolve(process.cwd(), entryPointPath);
  const root = process.cwd();
  console.log("root", root);
  // @ts-ignore
  const hasteMap = new JestHasteMap({
    extensions: ["js"],
    maxWorkers: os.cpus.length,
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
  console.log(chalk.bold(`❯ Building ${chalk.blue(entryPointPath)}`));

  // @ts-ignore
  const resolver = new Resolver(moduleMap, {
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

  return modules;
};
