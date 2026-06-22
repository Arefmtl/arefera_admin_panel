"use client";

import { Plus, Trash2, Link2, GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ButtonConfig } from "./shared";

/**
 * Visual inline-button builder for Telegram messages.
 * Buttons are organized in rows; each row can hold multiple buttons that
 * appear side-by-side under the message.
 */
export function ButtonBuilder({
  value,
  onChange,
}: {
  value: ButtonConfig;
  onChange: (v: ButtonConfig) => void;
}) {
  const addRow = () => {
    onChange([...value, [{ text: "", url: "" }]]);
  };

  const addButton = (rowIdx: number) => {
    const next = value.map((r, i) => (i === rowIdx ? [...r, { text: "", url: "" }] : r));
    onChange(next);
  };

  const removeRow = (rowIdx: number) => {
    onChange(value.filter((_, i) => i !== rowIdx));
  };

  const removeButton = (rowIdx: number, btnIdx: number) => {
    const next = value.map((r, i) =>
      i === rowIdx ? r.filter((_, j) => j !== btnIdx) : r,
    );
    // Remove empty rows
    onChange(next.filter((r) => r.length > 0));
  };

  const updateButton = (rowIdx: number, btnIdx: number, field: "text" | "url", val: string) => {
    const next = value.map((r, i) =>
      i === rowIdx ? r.map((b, j) => (j === btnIdx ? { ...b, [field]: val } : b)) : r,
    );
    onChange(next);
  };

  const totalButtons = value.reduce((sum, r) => sum + r.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-emerald-600" />
          Inline buttons
          {totalButtons > 0 && (
            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
              {totalButtons} button{totalButtons > 1 ? "s" : ""}
            </Badge>
          )}
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" /> Add row
        </Button>
      </div>

      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No buttons attached. Add a row to create inline URL buttons under your message.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {value.map((row, rowIdx) => (
            <div
              key={rowIdx}
              className="group rounded-lg border border-border bg-muted/30 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <GripVertical className="h-3.5 w-3.5 opacity-40" />
                  Row {rowIdx + 1}
                  <span className="text-[10px]">({row.length} button{row.length > 1 ? "s" : ""})</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-rose-600 hover:bg-rose-50"
                  onClick={() => removeRow(rowIdx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="space-y-2">
                {row.map((btn, btnIdx) => (
                  <div key={btnIdx} className="flex items-center gap-2">
                    <Input
                      placeholder="Button text"
                      value={btn.text}
                      onChange={(e) => updateButton(rowIdx, btnIdx, "text", e.target.value)}
                      className="h-8 text-sm flex-[1]"
                    />
                    <Input
                      placeholder="https://example.com"
                      value={btn.url}
                      onChange={(e) => updateButton(rowIdx, btnIdx, "url", e.target.value)}
                      className="h-8 text-sm flex-[2] font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 shrink-0"
                      onClick={() => removeButton(rowIdx, btnIdx)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {row.length < 8 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => addButton(rowIdx)}
                >
                  <Plus className="h-3 w-3" /> Add button to this row
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Live preview */}
      {value.length > 0 && totalButtons > 0 && (
        <div className="rounded-lg border border-border p-3 bg-card">
          <p className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wide">Preview</p>
          <div className="space-y-1.5">
            {value.map((row, rowIdx) => (
              <div key={rowIdx} className="flex gap-1.5 flex-wrap">
                {row.filter((b) => b.text.trim()).map((btn, btnIdx) => (
                  <span
                    key={btnIdx}
                    className={cn(
                      "inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium",
                      "bg-emerald-50 text-emerald-700 border border-emerald-200",
                    )}
                  >
                    {btn.text}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
