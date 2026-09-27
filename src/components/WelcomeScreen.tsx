import { useBoardStore } from "../stores/boardStore";

/**
 * Shown on first-ever launch when there are no boards yet.
 */
export function WelcomeScreen() {
  const { addBoard } = useBoardStore();

  async function handleCreate() {
    await addBoard("Personal");
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center select-none">
      <div className="text-4xl">📌</div>
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
