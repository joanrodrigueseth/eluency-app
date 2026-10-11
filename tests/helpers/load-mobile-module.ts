import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

/** Exercise the real mobile module with native storage/network adapters replaced. */
export function loadMobileModule(
  file: string,
  dependencies: Record<string, unknown>,
  globals: Record<string, unknown> = {},
): Record<string, (...args: any[]) => any> {
  const filename = resolve(process.cwd(), file);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports,
    require: (specifier: string) => {
      if (!(specifier in dependencies)) throw new Error("Unexpected runtime dependency: " + specifier);
      return dependencies[specifier];
    },
    AbortController, Response, setTimeout, clearTimeout, setInterval, clearInterval, ...globals,
  }, { filename });
  return module.exports;
}
