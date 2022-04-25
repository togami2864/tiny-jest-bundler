import path from "path";
import fs from "fs";
import zlib from "zlib";
import { promisify } from "util";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export const write = async (filename, result, cacheDir, compress) => {
  const cacheFileName = path.join(
    cacheDir,
    path.basename(filename, ".js") + ".json" + (compress ? ".gz" : "")
  );
  const content = JSON.stringify(result);
  const data = compress ? await gzip(content) : content;
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return await fs.promises.writeFile(cacheFileName, data);
};

export const read = async (filename, cacheDir, compress) => {
  const data = fs.readFileSync(
    path.join(
      cacheDir,
      path.basename(filename, ".js") + ".json" + (compress ? "gz" : "")
    )
  );
  const content = compress ? await gunzip(data) : data;
  return JSON.parse(content.toString());
};
