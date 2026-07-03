declare module "expo-file-system/legacy" {
  export const cacheDirectory: string | null;
  export const documentDirectory: string | null;
  export function getInfoAsync(uri: string, options?: { size?: boolean; md5?: boolean }): Promise<{
    exists: boolean;
    uri: string;
    isDirectory?: boolean;
    size?: number;
    modificationTime?: number;
    md5?: string;
  }>;
  export function makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  export function downloadAsync(
    uri: string,
    fileUri: string,
    options?: { headers?: Record<string, string>; md5?: boolean; cache?: boolean }
  ): Promise<{ uri: string; status: number; headers: Record<string, string>; md5?: string }>;
  export function readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string>;
  export function writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }): Promise<void>;
  export function deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
}
