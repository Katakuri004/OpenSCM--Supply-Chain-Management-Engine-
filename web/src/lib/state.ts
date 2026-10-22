import { create } from "zustand";
const params = new URLSearchParams(location.search);
const initialDay = Number(params.get("day") ?? "90");
export const useTower = create<{
  mode: "fixture" | "live";
  day: number;
  node: string;
  run: string;
  dark: boolean;
  set: (
    state: Partial<{
      mode: "fixture" | "live";
      day: number;
      node: string;
      run: string;
      dark: boolean;
    }>,
  ) => void;
}>((set) => ({
  mode: params.get("mode") === "live" ? "live" : "fixture",
  day: Number.isInteger(initialDay) && initialDay >= 0 ? initialDay : 90,
  node: params.get("node") ?? "R01",
  run: params.get("run") ?? "",
  dark: localStorage.getItem("theme") === "dark",
  set,
}));
useTower.subscribe((state) => {
  const next = new URL(location.href);
  for (const [key, value] of Object.entries({
    mode: state.mode,
    day: state.day,
    node: state.node,
    run: state.run,
  })) {
    if (value === "") next.searchParams.delete(key);
    else next.searchParams.set(key, String(value));
  }
  history.replaceState(null, "", next);
  document.documentElement.classList.toggle("dark", state.dark);
  localStorage.setItem("theme", state.dark ? "dark" : "light");
});
document.documentElement.classList.toggle("dark", useTower.getState().dark);
