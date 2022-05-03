import * as fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import chalk from "chalk";
import cac from "cac";
import { minify } from "terser";
import express from "express";

import { createModuleMap } from "./moduleMap";
import { bundle, createHTMLOutput } from "./bundle";
import { createFileWatcher } from "./watcher";
import { setupReloadServer } from "./webSocket";

const cli = cac("jest-bundler");

cli
  .option("--entryPoint <path>", "entry point")
  .option("--output <path>", "outputDir")
  .option("--minify", "minify")
  .help();

cli.command("build").action(build);

cli.command("dev").action(dev);

cli.parse();

async function _build(options) {
  const moduleMap = await createModuleMap(options.entryPoint);
  const jsFile = await bundle(moduleMap, options);
  return jsFile;
}

async function build(options) {
  const start = performance.now();
  const jsFile = await _build(options);
  const htmlFile = await createHTMLOutput(options, jsFile.filepath);

  const output = [jsFile, htmlFile];
  for (const file of output) {
    let code;
    if (options.minify) {
      code = await minify(jsFile.content, { sourceMap: true }).then(
        (res) => res.code
      );
    } else {
      code = file.content;
    }
    await fs.writeFile(file.filepath, code, "utf8");
  }
  const end = performance.now();
  console.log(
    chalk.bold(`jest-bundler compiled in ${end - start} milliseconds.`)
  );
}

async function dev(options) {
  const jsFile = await _build(options);
  const htmlFile = await createHTMLOutput(options, jsFile.filepath);

  const ws = setupReloadServer();

  const outputFiles = [jsFile, htmlFile];
  const fileMap = {};
  for (const file of outputFiles) {
    fileMap["/" + file.filepath] = file.content;
  }

  const app = express();
  app.use((req, res) => {
    const request = req.path;
    if (fileMap[request]) {
      return res.send(fileMap[request]);
    }
    res.send(htmlFile.content);
  });

  app.listen(3000, () => console.log(`server listen on http://localhost:3000`));
  createFileWatcher((eventName, path) => {
    console.log(`Detected file change (${eventName}) reloading!: ${path}`);
    ws.send({ type: "reload" });
  });
}
