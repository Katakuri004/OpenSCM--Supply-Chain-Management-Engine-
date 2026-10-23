import { create } from "zustand";
export const viewNames = {
  overview: "Operations overview",
  exceptions: "Exception workbench",
  playbooks: "Scenario playbooks",
  portfolio: "Planning Lab",
  learning: "Learning sandbox",
  tower: "Control Tower",
  scenario: "Scenario Lab",
  network: "Network Design",
  builder: "Network builder",
  bullwhip: "Bullwhip Lab",
  inventory: "Inventory Lab",
  resilience: "Resilience",
  methodology: "Methodology",
} as const;
export type ViewKey = keyof typeof viewNames;
const params = new URLSearchParams(location.search);
const initialDay = Number(params.get("day") ?? "90");
export const useTower = create<{
  view: ViewKey;
  mode: "fixture" | "live";
  day: number;
  node: string;
  run: string;
  playbook: string;
  portfolio: string;
  lesson: string;
  dark: boolean;
  set: (
    state: Partial<{
      view: ViewKey;
      mode: "fixture" | "live";
      day: number;
      node: string;
      run: string;
      playbook: string;
      portfolio: string;
      lesson: string;
      dark: boolean;
    }>,
  ) => void;
}>((set) => ({
  view: Object.hasOwn(viewNames, params.get("view") ?? "")
    ? (params.get("view") as ViewKey)
    : "overview",
  mode: params.get("mode") === "live" ? "live" : "fixture",
  day: Number.isInteger(initialDay) && initialDay >= 0 ? initialDay : 90,
  node: params.get("node") ?? "R01",
  run: params.get("run") ?? "",
  playbook: params.get("playbook") ?? "",
  portfolio: params.get("portfolio") ?? "",
  lesson: params.get("lesson") ?? "service",
  dark: localStorage.getItem("theme") === "dark",
  set,
}));
useTower.subscribe((state) => {
  const next = new URL(location.href);
  for (const [key, value] of Object.entries({
    view: state.view,
    mode: state.mode,
    day: state.day,
    node: state.node,
    run: state.run,
    playbook: state.playbook,
    portfolio: state.portfolio,
    lesson: state.lesson,
  })) {
    if (value === "") next.searchParams.delete(key);
    else next.searchParams.set(key, String(value));
  }
  history.replaceState(null, "", next);
  document.documentElement.classList.toggle("dark", state.dark);
  localStorage.setItem("theme", state.dark ? "dark" : "light");
});
document.documentElement.classList.toggle("dark", useTower.getState().dark);
