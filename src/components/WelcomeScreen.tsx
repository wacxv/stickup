import { selectRecentBoards, useBoardStore } from "../stores/boardStore";
import { GoPin } from "react-icons/go";

/**
 * Shown when no tabs are open, with saved boards or first-launch guidance.
 */
export function WelcomeScreen() {
  const state = useBoardStore();
  const { addBoard, reopenBoard } = state;
  const recentBoards = selectRecentBoards(state);

  async function handleCreate() {
    await addBoard("Personal");
  }

  if (recentBoards.length > 0) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-6 select-none">
        <GoPin className="text-4xl text-indigo-400 shrink-0" aria-hidden="true" />
        <h1 className="text-base font-semibold text-neutral-100">Recent boards</h1>
        <ul className="w-full max-w-xs min-h-0 overflow-y-auto space-y-1">
          {recentBoards.map((board) => (
            <li key={board.id}>
              <button
                onClick={() => void reopenBoard(board.id)}
                title={board.title}
                className="w-full truncate rounded-md px-3 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 transition-colors"
              >
                {board.title}
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={() => void addBoard("Untitled")}
          className="shrink-0 px-4 py-1.5 rounded-md text-xs font-medium bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors"
        >
          New board
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center select-none">
      <GoPin className="text-4xl text-indigo-400" aria-hidden="true" />
      <h1 className="text-base font-semibold text-neutral-100">
        Welcome to StickUp
      </h1>
      <p className="text-xs text-neutral-400 max-w-[220px] leading-relaxed">
        Organise your notes and tasks into <strong className="text-neutral-300">boards</strong>.
        Each board has its own freeform notes and a task list.
      </p>
      <button
        onClick={handleCreate}
        className="
          mt-2 px-4 py-1.5 rounded-md text-xs font-medium
          bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700
          text-white transition-colors
        "
      >
        Create my first board
      </button>
    </div>
  );
}
