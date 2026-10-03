import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";

let storageDirPromise: Promise<string> | undefined;

export function storageDir(): Promise<string> {
  storageDirPromise ??= invoke<string>("storage_dir");
  return storageDirPromise;
}

export async function storagePath(...parts: string[]): Promise<string> {
  return join(await storageDir(), ...parts);
}
