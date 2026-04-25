import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Save } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";

interface SaveButtonProps {
  label?: string;
  onSave: () => Promise<void> | void;
  className?: string;
  variant?: "default" | "outline" | "ghost";
}

export default function SaveButton({ label = "Save", onSave, className = "", variant = "default" }: SaveButtonProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { setLastSaved } = useAppStore();
  const { toast } = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      const now = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
      setLastSaved(now);
      setSaved(true);
      toast({ title: "Saved Successfully", description: `${label} saved at ${now}` });
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      toast({ title: "Save Failed", description: "Please try again.", variant: "destructive" });
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
      data-testid={`button-save-${label.toLowerCase().replace(/\s+/g, '-')}`}
      style={variant === 'default' ? {
        background: saved ? 'hsl(142,60%,35%)' : 'linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))',
        color: 'hsl(224,40%,8%)',
        border: 'none',
        transition: 'all 0.3s',
      } : undefined}
    >
      {saving ? (
        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
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
