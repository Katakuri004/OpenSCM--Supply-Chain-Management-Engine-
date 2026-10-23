import { useLayoutEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Accessibility, Check, X } from "lucide-react";
import { useMotion } from "../lib/motion";
import { Button } from "./ui/button";

export function MotionPreferences() {
  const [open, setOpen] = useState(false);
  const { preference, reduced, setPreference } = useMotion();
  useLayoutEffect(() => {
    document.documentElement.dataset.motion = preference === "reduce" ? "reduced" : "system";
  }, [preference]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Motion preferences">
          <Accessibility />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-overlay fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="motion-dialog fixed top-[15%] left-1/2 z-50 w-[min(460px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="font-semibold">Motion preferences</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close motion preferences">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="my-3 text-xs leading-6 text-[var(--secondary)]">
            Choose how controls and workspace panels move. Results and inventory figures always show
            their exact values.
          </Dialog.Description>
          <fieldset className="space-y-2">
            <legend className="sr-only">Workspace motion</legend>
            {(
              [
                ["system", "Follow device", "Use your device’s accessibility preference."],
                [
                  "reduce",
                  "Reduce motion",
                  "Show changes immediately, without movement or looping indicators.",
                ],
              ] as const
            ).map(([value, title, description]) => (
              <label className="motion-choice" key={value} data-selected={preference === value}>
                <input
                  type="radio"
                  name="motion-preference"
                  value={value}
                  checked={preference === value}
                  onChange={() => setPreference(value)}
                  aria-label={title}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{title}</span>
                  <span className="mt-1 block text-[11px] leading-5 text-[var(--secondary)]">
                    {description}
                  </span>
                </span>
                {preference === value && (
                  <Check
                    size={16}
                    aria-hidden="true"
                    className="motion-check text-[var(--accent)]"
                  />
                )}
              </label>
            ))}
          </fieldset>
          <p role="status" className="mt-4 text-[11px] leading-5 text-[var(--secondary)]">
            {reduced ? "Reduced motion is active." : "Full workspace motion is active."} Your choice
            is saved in this browser when storage is available.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
