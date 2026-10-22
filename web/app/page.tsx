"use client";

import dynamic from "next/dynamic";

const ControlTower = dynamic(() => import("../src/main"), {
  ssr: false,
  loading: () => (
    <main className="p-6" role="status">
      Loading the Control Tower…
    </main>
  ),
});

export default function Page() {
  return <ControlTower />;
}
