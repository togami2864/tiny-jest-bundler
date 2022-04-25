import fs from "fs";
import zlib from "zlib";
import crypto from "crypto";
import { promisify } from "util";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export const write = async (filename, code, compress) => {
  const content = JSON.stringify(code);
  const data = compress ? await gzip(content) : content;
  return await fs.promises.writeFile(filename + (compress ? ".gz" : ""), data);
};

export const read = async (filename, compress) => {
  const data = fs.readFileSync(filename + (compress ? "gz" : ""));
  const content = compress ? await gunzip(data) : data;
  return JSON.parse(content.toString());
};

export const cacheFileName = (code) => {
  const hash = crypto.createHash("md5");
  hash.update(code);
  return hash.digest("hex") + ".json";
};
