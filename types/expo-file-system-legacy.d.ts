declare module "expo-file-system/legacy" {
  export const cacheDirectory: string | null;
  export function readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string>;
  export function writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }): Promise<void>;
  export function deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
}
