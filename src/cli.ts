import * as fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import * as path from "node:path";
import chalk from "chalk";
import cac from "cac";
import { minify } from "terser";
import express from "express";

import { createModuleMap } from "./moduleMap.js";
import { bundle } from "./bundle.js";

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
  const output = await bundle(moduleMap);
  return output;
}

async function build(options) {
  const start = performance.now();
  const output = await _build(options);

  const code = options.minify
    ? await minify(output, { sourceMap: true }).then((res) => res.code)
    : output;

  await fs.writeFile(options.output, code, "utf8");
  const html = await fs.readFile(
    path.resolve(process.cwd(), "index.html"),
    "utf-8"
  );
  const bodyRex = /<\/body>/i;
  const injectedHtml = html.replace(
    bodyRex,
    `<script src="${options.output}">` + "</script>" + "\n</body>"
  );
  await fs.writeFile("output.html", injectedHtml, "utf-8");
  const end = performance.now();
  console.log(
    chalk.bold(`jest-bundler compiled in ${end - start} milliseconds.`)
  );
}

async function dev(options) {
  const output = await _build(options);
  const html = await fs.readFile(
    path.resolve(process.cwd(), "index.html"),
    "utf-8"
  );
  const bodyRex = /<\/body>/i;
  const injectedHtml = html.replace(
    bodyRex,
    `<script src="${options.output}">` + "</script>" + "\n</body>"
  );
  const fileMap = {};
  fileMap[options.output.replace(".", "")] = output;

  const app = express();
  app.use((req, res) => {
    const request = req.path;
    if (fileMap[request]) {
      return res.send(fileMap[request]);
    }
    res.send(injectedHtml);
  });
  app.listen(3000, () => console.log(`server listen on http://localhost:3000`));
}
