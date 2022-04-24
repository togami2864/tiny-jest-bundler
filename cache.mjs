import path from "path";
import fs from "fs";

export const write = async (filename, result, cacheDir) => {
  const cacheFileName = path.join(
    cacheDir,
    path.basename(filename, ".js") + ".json"
  );
  const content = JSON.stringify(result);
  ensureDirExists(cacheDir);
  return await fs.promises.writeFile(cacheFileName, content);
};

export const read = async (filename, cacheDir) => {
  const content = fs.readFileSync(
    path.join(cacheDir, path.basename(filename, ".js") + ".json")
  );
  return JSON.parse(content.toString());
};

const ensureDirExists = (cacheDir) => {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
};
