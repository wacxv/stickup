import { invoke } from "@tauri-apps/api/core";

/**
 * Request an immediate check from the Rust-owned reminder worker.
 * The worker also polls every minute while the WebView is suspended.
 */
export function triggerBackgroundTimer(): void {
  void invoke("run_background_check").catch((error) => {
    console.error("[backgroundTimer] immediate check failed:", error);
  });
}
