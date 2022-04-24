const { transformSync } = require("@babel/core");

exports.transformFile = function (code, filepath) {
  const transformResult = { code: "" };
  try {
    transformResult.code = transformSync(code, {
      plugins: ["@babel/plugin-transform-modules-commonjs"],
    }).code;
  } catch (error) {
    transformResult.errorMessage = error.message;
  }
  return transformResult;
};
