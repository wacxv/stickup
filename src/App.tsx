import { useEffect, useState } from "react";
import "./App.css";
import { TitleBar } from "./components/TitleBar";
import { useBoardStore } from "./stores/boardStore";
import { useSettingsStore } from "./stores/settingsStore";
import { BoardTabBar } from "./components/BoardTabBar";
import { BoardShell } from "./components/BoardShell";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { SettingsPane } from "./components/SettingsPane";
import { getCurrentWebview } from "@tauri-apps/api/webview";

function App() {
  const { loadBoards, boards, loading } = useBoardStore();
  const { loadSettings } = useSettingsStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let queue = Promise.resolve();
    void getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      const paths = event.payload.paths.filter((path) => /\.md$/i.test(path));
      if (!paths.length) {
        setImportError("Drop a Markdown (.md) file to import a board.");
        return;
      }
      queue = queue.then(async () => {
        if (disposed) return;
        setImportError(null);
        const errors: string[] = [];
        for (const path of paths) {
          try {
            await useBoardStore.getState().importMarkdown(path);
          } catch (error) {
            errors.push(`${path.split(/[\\/]/).pop()}: ${String(error)}`);
          }
        }
        if (!disposed && errors.length) setImportError(errors.join("\n"));
      });
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    }).catch((error) => {
      if (!disposed) setImportError(`Could not enable file drops: ${String(error)}`);
    });
    let discovering = false;
    const discover = async () => {
      if (discovering || document.hidden) return;
      discovering = true;
      try {
        await useBoardStore.getState().discoverBoards();
      } catch (error) {
        console.warn("[App] board discovery failed:", error);
      } finally {
        discovering = false;
      }
    };
    const interval = window.setInterval(() => void discover(), 2000);
    window.addEventListener("focus", discover);
    return () => {
      disposed = true;
      unlisten?.();
      window.clearInterval(interval);
      window.removeEventListener("focus", discover);
    };
  }, []);

  useEffect(() => {
    async function bootstrap() {
      await loadSettings();
      await loadBoards();
    }

    void bootstrap();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // position:relative so SettingsPane (absolute) fills this container
    <div
      className="relative flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-hidden"
      onContextMenu={(event) => event.preventDefault()}
    >
      <TitleBar onSettingsOpen={() => setSettingsOpen(true)} />
      {importError && (
        <div role="alert" className="flex items-start gap-2 px-3 py-2 text-xs text-rose-300 bg-neutral-900">
          <span className="flex-1 whitespace-pre-wrap break-words min-w-0">{importError}</span>
          <button aria-label="Dismiss import error" onClick={() => setImportError(null)}>×</button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
          Loading…
        </div>
      ) : boards.length === 0 ? (
        <WelcomeScreen />
      ) : (
        <>
          <BoardTabBar />
          <BoardShell />
        </>
      )}

      {/* Settings overlay — mounts on top of everything except the title bar */}
      {settingsOpen && (
        <SettingsPane onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

export default App;
