import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Check, Save } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";

// ─── SaveButton ───────────────────────────────────────────────────────────────

interface SaveButtonProps {
  label?: string;
  onSave: () => Promise<void> | void;
  className?: string;
  variant?: "default" | "outline" | "ghost";
}

export default function SaveButton({
  label = "Save",
  onSave,
  className = "",
  variant = "default",
}: SaveButtonProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { setLastSaved } = useAppStore();
  const { toast } = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      const now = new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
      setLastSaved(now);
      setSaved(true);
      toast({ title: "Saved Successfully", description: `${label} saved at ${now}` });
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      const msg = err?.message ?? "Please try again.";
      toast({ title: "Save Failed — Not Saved to Supabase", description: msg, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Button
      onClick={handleSave}
      disabled={saving}
      variant={variant}
      size="sm"
      className={`gap-2 ${className}`}
      data-testid={`button-save-${label.toLowerCase().replace(/\s+/g, "-")}`}
      style={
        variant === "default"
          ? {
              background: saved
                ? "hsl(142,60%,35%)"
                : "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))",
              color: "hsl(224,40%,8%)",
              border: "none",
              transition: "all 0.3s",
            }
          : undefined
      }
    >
      {saving ? (
        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : saved ? (
        <Check className="w-3.5 h-3.5" />
      ) : (
        <Save className="w-3.5 h-3.5" />
      )}
      {saving ? "Saving..." : saved ? "Saved!" : label}
    </Button>
  );
}

// ─── useSaveOnEnter ───────────────────────────────────────────────────────────
//
// Hook that listens for the Enter key on a containing div and triggers an
// onSave callback, debounced with a 300 ms leading-edge debounce.
//
// Usage:
//   const containerRef = useSaveOnEnter(handleSave, isFormActive);
//   <div ref={containerRef}>...</div>
//
// Rules:
//   - Only active when isFormActive is true
//   - Enter inside a <textarea> does nothing (natural newline)
//   - Shift+Enter inside a <textarea> does nothing
//   - Enter inside any other element triggers onSave (debounced, leading edge)
//   - Debounce window is 300 ms — repeated Enter presses within 300 ms
//     fire only once
//
export function useSaveOnEnter(
  onSave: () => void | Promise<void>,
  isFormActive: boolean
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Timestamp of the last triggered save (for leading-edge debounce)
  const lastFiredRef = useRef<number>(0);
  const DEBOUNCE_MS = 300;

  // Stable reference to onSave to avoid stale closure issues
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isFormActive) return;
      if (e.key !== "Enter") return;

      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();

      // Inside a textarea → allow natural newline behaviour
      if (tag === "textarea") return;

      // Prevent form submission or other default browser behaviour
      e.preventDefault();

      // Leading-edge debounce
      const now = Date.now();
      if (now - lastFiredRef.current < DEBOUNCE_MS) return;
      lastFiredRef.current = now;

      // Fire save
      void onSaveRef.current();
    },
    [isFormActive]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isFormActive) return;

    el.addEventListener("keydown", handleKeyDown);
    return () => {
      el.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, isFormActive]);

  return containerRef;
}
