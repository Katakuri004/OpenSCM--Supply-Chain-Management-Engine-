import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";

export function Feedback({
  children,
  kind = "info",
  label,
}: {
  children: ReactNode;
  kind?: "success" | "error" | "info";
  label?: string;
}) {
  const Icon = kind === "success" ? CircleCheck : kind === "error" ? CircleAlert : Info;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-label={label}
      className="panel motion-feedback flex items-start gap-3 p-4 text-xs leading-6"
      data-kind={kind}
    >
      <Icon aria-hidden="true" size={18} className="motion-check mt-0.5 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
