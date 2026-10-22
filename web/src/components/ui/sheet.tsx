import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "./button";
import { useRef, type ReactNode } from "react";

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/15" />
        <Dialog.Content
          onOpenAutoFocus={() => {
            previousFocus.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (previousFocus.current?.isConnected) previousFocus.current.focus();
          }}
          className="fixed inset-y-0 right-0 z-50 w-[540px] max-w-full overflow-y-auto border-l border-[var(--border)] bg-[var(--panel)] p-6 shadow-xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">NODE INSPECTOR</p>
              <Dialog.Title className="mt-2 text-xl font-semibold">{title}</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close inspector">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 text-sm text-[var(--secondary)]">
            Representative trajectory; KPI estimates use all replications.
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
