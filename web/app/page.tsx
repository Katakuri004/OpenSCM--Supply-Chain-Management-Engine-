"use client";

import dynamic from "next/dynamic";

const Workspace = dynamic(() => import("../src/main"), {
  ssr: false,
  loading: () => (
    <main className="p-6" role="status">
      Loading the operations workspace…
    </main>
  ),
});

export default function Page() {
  return <Workspace />;
}
