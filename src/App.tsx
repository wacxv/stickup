import { useEffect, useRef, useState } from "react";
import "./App.css";
import { TitleBar } from "./components/TitleBar";
import { useBoardStore } from "./stores/boardStore";
import { useSettingsStore } from "./stores/settingsStore";
import { BoardTabBar } from "./components/BoardTabBar";
import { BoardShell } from "./components/BoardShell";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { SettingsPane } from "./components/SettingsPane";
import { startBackgroundTimer } from "./lib/backgroundTimer";
import type { StopFn } from "./lib/backgroundTimer";

function App() {
  const { loadBoards, boards, loading, reorderTasks } = useBoardStore();
  const { loadSettings } = useSettingsStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const stopTimerRef = useRef<StopFn | null>(null);

  useEffect(() => {
    async function bootstrap() {
      await loadSettings();
      await loadBoards();

      stopTimerRef.current = startBackgroundTimer(
        () => useBoardStore.getState().boards,
        () => useSettingsStore.getState().settings,
        {
          onTasksUpdated: async (boardId, tasks) => {
            await reorderTasks(boardId, tasks);
          },
        },
      );
    }

    void bootstrap();

    return () => {
      stopTimerRef.current?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // position:relative so SettingsPane (absolute) fills this container
    <div className="relative flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-hidden">
      <TitleBar onSettingsOpen={() => setSettingsOpen(true)} />

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
