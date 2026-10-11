import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

test("the shipped student import graph contains no teacher auth or management modules", () => {
  const root = process.cwd();
  const files = new Set<string>();
  const packages = new Set<string>();
  function visit(file: string) {
    if (files.has(file)) return;
    files.add(file);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function walk(node: ts.Node) {
      let specifier: string | undefined;
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
        const bindings = node.importClause?.namedBindings;
        const typeOnly = bindings && ts.isNamedImports(bindings) &&
          !node.importClause?.name && bindings.elements.every((item) => item.isTypeOnly);
        if (!typeOnly) specifier = (node.moduleSpecifier as ts.StringLiteral).text;
      } else if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
        specifier = (node.moduleSpecifier as ts.StringLiteral | undefined)?.text;
      } else if (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        specifier = node.arguments[0].text;
      }
      if (specifier?.startsWith(".")) {
        const base = resolve(dirname(file), specifier);
        const next = [".ts", ".tsx", ".js", "/index.ts", "/index.tsx"]
          .map((extension) => base + extension)
          .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
        if (next) visit(next);
      } else if (specifier) {
        packages.add(specifier);
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
  visit(resolve(root, "App.tsx"));
  const paths = [...files].map((file) => relative(root, file).replaceAll("\\", "/"));
  assert.deepEqual(paths.filter((file) => file.startsWith("screens/")).sort(), [
    "screens/LoginScreen.tsx", "screens/StudyGameScreen.tsx",
  ]);
  assert.deepEqual(readdirSync(resolve(root, "screens")).sort(), [
    "LoginScreen.tsx", "StudyGameScreen.tsx",
  ]);
  for (const file of paths) {
    assert.doesNotMatch(file, /(?:supabase|oauth|registration|teacherMobileNotifications|DashboardMenu|NotificationCenter|api\/(?:admin|classrooms|settings|entitlements|google|onboarding))\.(?:ts|tsx)$/);
  }
  assert.equal(packages.has("@supabase/supabase-js"), false);
  assert.equal(packages.has("expo-apple-authentication"), false);
});

test("student native configuration and package lock exclude teacher capabilities", () => {
  const readJson = (file: string) => JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8"));
  const { expo } = readJson("app.json");
  const manifest = readJson("package.json");
  const lock = readJson("package-lock.json");
  const retiredPackages = [
    "@react-native-community/datetimepicker", "@supabase/supabase-js", "base64-arraybuffer",
    "expo-apple-authentication", "expo-auth-session", "expo-blur", "expo-crypto",
    "expo-document-picker", "expo-image-picker", "expo-intent-launcher",
    "expo-sharing", "expo-web-browser", "react-native-draggable-flatlist",
  ];
  const plugins = expo.plugins.map((plugin: string | [string, unknown]) => Array.isArray(plugin) ? plugin[0] : plugin);
  for (const name of retiredPackages) {
    assert.equal(name in manifest.dependencies, false, name + " must not be a direct dependency");
    assert.equal(plugins.includes(name), false, name + " must not be a native plugin");
  }
  assert.deepEqual(lock.packages[""].dependencies, manifest.dependencies);
  assert.equal(expo.ios.usesAppleSignIn, undefined);
  assert.equal(expo.ios.infoPlist.NSPhotoLibraryUsageDescription, undefined);
  assert.equal(expo.ios.infoPlist.NSCameraUsageDescription, undefined);
  assert.equal(expo.scheme, "eluency");
  assert.equal(expo.ios.bundleIdentifier, "com.eluency.mobile");
  assert.equal(expo.android.package, "com.eluency.mobile");
  assert.ok(plugins.includes("expo-notifications"));
  assert.ok(plugins.includes("expo-audio"));
  assert.ok(plugins.includes("expo-secure-store"));
});
