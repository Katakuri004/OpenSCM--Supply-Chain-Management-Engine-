import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { useTower } from "../lib/state";
import { loadStudy } from "../lib/labs";

const views = {
  scenario: lazy(() => import("./scenario-lab")),
  network: lazy(() => import("./network-design")),
  bullwhip: lazy(() => import("./bullwhip-lab")),
  inventory: lazy(() => import("./inventory-lab")),
  resilience: lazy(() => import("./resilience")),
  methodology: lazy(() => import("./methodology")),
};
export default function StudyPage({ view }: { view: keyof typeof views }) {
  const mode = useTower((state) => state.mode);
  const playbook = useTower((state) => state.playbook);
  const data = useQuery({ queryKey: ["study-evidence", mode], queryFn: () => loadStudy(mode) });
  const Component = views[view];
  if (data.error)
    return (
      <div role="alert" className="panel p-6">
        {data.error.message}
      </div>
    );
  if (!data.data) return <p role="status">Loading saved study evidence…</p>;
  return (
    <Suspense fallback={<p role="status">Loading study view…</p>}>
      <div data-testid="study-ready">
        <Component key={`${view}-${mode}-${playbook}`} data={data.data} />
      </div>
    </Suspense>
  );
}
