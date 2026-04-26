/**
 * BulkDeleteModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable confirmation modal for destructive bulk-delete actions.
 *
 * Security gates:
 *  1. Password must be "YaraJana2025"
 *  2. "I understand" checkbox must be checked
 *  3. Optional: Export backup button offered before confirming
 *
 * Usage:
 *   <BulkDeleteModal
 *     open={showModal}
 *     count={selectedIds.length}
 *     label="expense records"
 *     onConfirm={handleBulkDelete}
 *     onCancel={() => setShowModal(false)}
 *     onExportBackup={handleExportBackup}   // optional
 *   />
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, AlertTriangle, Download, X, Lock } from "lucide-react";

const CONFIRM_PASSWORD = "YaraJana2025";

interface BulkDeleteModalProps {
  open: boolean;
  count: number;
  label?: string;                 // e.g. "expense records"
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  onExportBackup?: () => void;    // optional backup before delete
}

export default function BulkDeleteModal({
  open,
  count,
  label = "records",
  onConfirm,
  onCancel,
  onExportBackup,
}: BulkDeleteModalProps) {
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [backedUp, setBackedUp] = useState(false);

  if (!open) return null;

  const reset = () => {
    setPassword("");
    setUnderstood(false);
    setError("");
    setLoading(false);
    setBackedUp(false);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const handleExport = () => {
    onExportBackup?.();
    setBackedUp(true);
  };

  const handleConfirm = async () => {
    if (password !== CONFIRM_PASSWORD) {
      setError("Incorrect password. Please try again.");
      return;
    }
    if (!understood) {
      setError("Please check the confirmation checkbox.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onConfirm();
      reset();
    } catch (e) {
      setError("Delete failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={handleCancel} />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl"
        style={{ borderColor: 'hsl(0,72%,40%)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Confirm Bulk Delete</h2>
              <p className="text-xs text-muted-foreground">This action cannot be undone</p>
            </div>
          </div>
          <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning message */}
        <div
          className="rounded-lg p-4 mb-4 text-sm"
          style={{ background: 'hsl(0,50%,12%)', border: '1px solid hsl(0,72%,30%)' }}
        >
          <p className="font-semibold text-red-300 mb-1">
            You are about to delete {count.toLocaleString()} {label}.
          </p>
          <p className="text-red-400/80 text-xs">
            This action is permanent and cannot be undone. All selected records will be
            removed from Supabase and local cache immediately.
          </p>
        </div>

        {/* Export backup */}
        {onExportBackup && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">
              Optional: export a backup before deleting.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              className="gap-1.5 w-full"
              style={backedUp ? { borderColor: 'hsl(142,60%,35%)', color: 'hsl(142,60%,55%)' } : {}}
            >
              <Download className="w-3.5 h-3.5" />
              {backedUp ? "✓ Backup exported" : "Export backup before deleting"}
            </Button>
          </div>
        )}

        {/* Password */}
        <div className="mb-3">
          <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <Lock className="w-3 h-3" /> Enter password to confirm
          </label>
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(""); }}
            className="h-8 text-sm"
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
          />
        </div>

        {/* Checkbox */}
        <label className="flex items-start gap-2 mb-4 cursor-pointer group">
          <input
            type="checkbox"
            checked={understood}
            onChange={e => { setUnderstood(e.target.checked); setError(""); }}
            className="mt-0.5 rounded accent-red-500"
          />
          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
            I understand this action cannot be undone and {count.toLocaleString()} {label} will be permanently deleted.
          </span>
        </label>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-400 mb-3 bg-red-500/10 rounded px-3 py-2">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={loading || !password || !understood}
            className="flex-1 gap-1.5 bg-red-600 hover:bg-red-700 text-white border-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {loading ? "Deleting..." : `Delete ${count.toLocaleString()} ${label}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
