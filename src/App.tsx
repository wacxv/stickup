import "./App.css";
import { TitleBar } from "./components/TitleBar";

function App() {
  return (
    <>
      {/* Custom borderless title bar */}
      <TitleBar />

      {/* Main content area — grows to fill remaining window height */}
      <main className="flex-1 overflow-auto bg-neutral-950 text-neutral-100">
        {/*
         * ── Breakpoint smoke-test ──────────────────────────────────────────
         * Responds to the WINDOW width via the CSS container declared on
         * #root (container-name: app  /  container-type: inline-size).
         *
         * Tailwind v4 named-container variant syntax:
         *   @[400px]/app:…   →  apply when container "app" ≥ 400 px
         *
         * Narrow  < 400 px  →  purple badge
         * Wide   ≥ 400 px  →  teal badge
         *
         * Remove this component once real board UI exists.
         */}
        <BreakpointIndicator />
      </main>
    </>
  );
}

function BreakpointIndicator() {
  return (
    <div className="m-4">
      {/* Outer card: purple in narrow mode, teal in wide mode */}
      <div
        className="
          rounded-lg p-4 transition-colors duration-200
          bg-purple-900 text-purple-200
          @[400px]/app:bg-teal-900 @[400px]/app:text-teal-200
        "
      >
        {/* Label swaps via visibility utilities on the same container query */}
        <p className="text-sm font-semibold">
          {/* Visible only when narrow */}
          <span className="@[400px]/app:hidden">
            📐 Narrow layout &lt; 400 px
          </span>
          {/* Visible only when wide */}
          <span className="hidden @[400px]/app:inline">
            📐 Wide layout ≥ 400 px
          </span>
        </p>

        <p className="mt-2 text-xs opacity-60 font-mono">
          Container query on <code>#root</code> — resize the window to trigger
        </p>

        {/* Extra padding demo: narrow = p-2, wide = p-6 */}
        <div
          className="
            mt-3 rounded border border-current/20
            p-2 @[400px]/app:p-6
            text-xs opacity-70
          "
        >
          This box has <code>p-2</code> when narrow and{" "}
          <code>p-6</code> when wide.
        </div>
      </div>
    </div>
  );
}

export default App;
