import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Boxes,
  ChevronRight,
  Command,
  FlaskConical,
  LayoutDashboard,
  ListFilter,
  Menu,
  Network,
  Package,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { useTower, viewNames, type ViewKey } from "../lib/state";
import type { Network as SupplyNetwork } from "../lib/tower";

export const navigation = [
  {
    label: "OPERATE",
    items: [
      ["overview", LayoutDashboard],
      ["exceptions", ListFilter],
      ["tower", Network],
    ],
  },
  {
    label: "PLAN & SIMULATE",
    items: [
      ["playbooks", FlaskConical],
      ["portfolio", SlidersHorizontal],
      ["scenario", SlidersHorizontal],
      ["network", Boxes],
      ["builder", Network],
      ["inventory", Package],
      ["bullwhip", Activity],
      ["resilience", ShieldCheck],
    ],
  },
  {
    label: "LEARN & REFERENCE",
    items: [
      ["learning", BookOpen],
      ["methodology", BookOpen],
    ],
  },
] as const;
function Links({ close }: { close?: () => void }) {
  const { view, set } = useTower();
  return (
    <nav aria-label="Workspace modules" className="space-y-6">
      {navigation.map((group) => (
        <div key={group.label}>
          <p className="eyebrow mb-2 px-3 text-[9px]">{group.label}</p>
          <div className="space-y-1">
            {group.items.map(([key, Icon]) => (
              <button
                key={key}
                aria-current={view === key ? "page" : undefined}
                className={`nav-item ${view === key ? "nav-active" : ""}`}
                onClick={() => {
                  set({ view: key });
                  close?.();
                }}
              >
                <Icon size={16} />
                <span>{viewNames[key]}</span>
                {view === key && <ChevronRight size={12} className="ml-auto" />}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
export function WorkspaceSidebar() {
  return (
    <aside className="workspace-sidebar">
      <a href="/" className="flex items-center gap-2.5 px-3 text-lg font-semibold tracking-tight">
        <span className="rounded-lg bg-[var(--accent)] p-2 text-white">
          <Network size={20} />
        </span>{" "}
        OpenSCM
      </a>
      <p className="mt-3 px-3 text-[10px] text-[var(--secondary)]">OPEN SUPPLY CHAIN OPERATIONS</p>
      <div className="mx-2 my-6 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3">
        <p className="text-xs font-medium">FMCG planning workspace</p>
        <p className="mt-1 text-[10px] text-[var(--secondary)]">
          India network · synthetic scenarios
        </p>
      </div>
      <Links />
      <div className="mt-auto px-3 pt-8">
        <a
          className="flex items-center justify-between text-xs"
          href="https://github.com/Katakuri004/OpenSCM--Supply-Chain-Management-Engine-"
          target="_blank"
          rel="noreferrer"
        >
          Source & documentation <ArrowUpRight size={14} />
        </a>
        <p className="mt-3 text-[10px] leading-5 text-[var(--secondary)]">
          Apache-2.0 · Self-hostable source
          <br />
          Simulation workspace · no live ERP feed
        </p>
      </div>
    </aside>
  );
}
export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto bg-[var(--panel)] p-4 shadow-xl">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="font-semibold">Workspace navigation</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close navigation">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Choose an operations or simulation module.
          </Dialog.Description>
          <Links close={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function WorkspaceSearch({ network }: { network: SupplyNetwork | undefined }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { set } = useTower();
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const needle = query.toLowerCase().trim();
  const modules = (Object.entries(viewNames) as [ViewKey, string][]).filter(([, title]) =>
    title.toLowerCase().includes(needle),
  );
  const sites = needle
    ? (network?.nodes.id
        .flatMap((id, i) =>
          `${id} ${network.nodes.label[i]}`.toLowerCase().includes(needle)
            ? [{ id, label: network.nodes.label[i]! }]
            : [],
        )
        .slice(0, 8) ?? [])
    : [];
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setQuery("");
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          variant="outline"
          aria-label="Search workspace"
          className="gap-3 text-[var(--secondary)]"
        >
          <Search />
          <span className="hidden xl:inline">Search workspace</span>
          <kbd className="hidden items-center gap-1 text-[10px] lg:flex">
            <Command size={10} /> K
          </kbd>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed top-[15%] left-1/2 z-50 w-[min(560px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <Dialog.Title className="font-semibold">Search workspace</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close search">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="my-2 text-xs text-[var(--secondary)]">
            Find planning modules and facilities from the loaded network.
          </Dialog.Description>
          <input
            className="my-3 w-full"
            aria-label="Search modules and facilities"
            placeholder="Try inventory, supplier, or R01…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {modules.map(([view, title]) => (
              <button
                className="search-result"
                key={view}
                onClick={() => {
                  set({ view });
                  close();
                }}
              >
                <span>{title}</span>
                <span className="text-[10px] text-[var(--secondary)]">Module ↗</span>
              </button>
            ))}
            {sites.map((site) => (
              <button
                className="search-result"
                key={site.id}
                onClick={() => {
                  set({ view: "tower", node: site.id });
                  close();
                }}
              >
                <span>
                  {site.id} · {site.label}
                </span>
                <span className="text-[10px] text-[var(--secondary)]">Facility ↗</span>
              </button>
            ))}
            {!modules.length && !sites.length && (
              <p className="p-4 text-sm text-[var(--secondary)]">
                No matching modules or loaded facilities.
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
