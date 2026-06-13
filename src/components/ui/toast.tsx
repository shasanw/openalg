// A minimal, app-wide toast notifier. `ToastProvider` wraps the app once;
// anywhere below it, `useToast()` returns `toast(...)` to surface a transient
// message — success confirmations and, importantly, failures (auto-save errors,
// bad imports) that the user would otherwise never see.

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastItem extends ToastInput {
  id: number;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Monotonic key source for list rendering. App runtime only (not a workflow
// script), so a module-level counter is fine and avoids Date/Math.random.
let nextId = 1;

const AUTO_DISMISS_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    ({ variant = "info", ...rest }: ToastInput) => {
      const id = nextId++;
      setItems((xs) => [...xs, { id, variant, ...rest }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[2147483647] flex w-[min(92vw,360px)] flex-col gap-2">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onClose={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const ICON_TONE: Record<ToastVariant, string> = {
  success: "text-emerald-500",
  error: "text-destructive",
  info: "text-primary",
};

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const Icon = ICONS[item.variant];
  return (
    <div
      role="status"
      className="bg-popover text-popover-foreground pointer-events-auto flex items-start gap-3 rounded-xl border p-3 shadow-lg"
    >
      <Icon className={cn("mt-0.5 size-4.5 shrink-0", ICON_TONE[item.variant])} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-snug font-semibold">{item.title}</p>
        {item.description && (
          <p className="text-muted-foreground mt-0.5 text-[12.5px] leading-snug">
            {item.description}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground -m-1 rounded p-1 transition-colors"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
