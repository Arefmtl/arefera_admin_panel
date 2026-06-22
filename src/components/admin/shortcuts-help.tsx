"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Keyboard, Command } from "lucide-react";

type Shortcut = {
  keys: { icon?: typeof Command; label: string }[];
  description: string;
  group: "Navigation" | "Actions" | "Theme";
};

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { keys: [{ icon: Command, label: "K" }], description: "Open command palette", group: "Navigation" },
  { keys: [{ label: "G" }, { label: "D" }], description: "Go to Dashboard", group: "Navigation" },
  { keys: [{ label: "G" }, { label: "S" }], description: "Go to Scheduled messages", group: "Navigation" },
  { keys: [{ label: "G" }, { label: "B" }], description: "Go to Broadcast", group: "Navigation" },
  { keys: [{ label: "G" }, { label: "T" }], description: "Go to Templates", group: "Navigation" },
  { keys: [{ label: "G" }, { label: "C" }], description: "Go to Channels", group: "Navigation" },
  { keys: [{ label: "G" }, { label: "A" }], description: "Go to Analytics", group: "Navigation" },
  { keys: [{ label: "G" }, { label: "L" }], description: "Go to Activity log", group: "Navigation" },
  { keys: [{ label: "G" }, { label: "O" }], description: "Go to Settings", group: "Navigation" },
  // Actions
  { keys: [{ label: "N" }], description: "New scheduled message (when on Scheduled tab)", group: "Actions" },
  { keys: [{ label: "R" }], description: "Run scheduler now", group: "Actions" },
  { keys: [{ label: "?" }], description: "Show this shortcuts help", group: "Actions" },
  // Theme
  { keys: [{ label: "Shift" }, { label: "D" }], description: "Toggle dark / light theme", group: "Theme" },
];

const GROUPS: Shortcut["group"][] = ["Navigation", "Actions", "Theme"];

export function ShortcutsHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-emerald-600" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Speed up your workflow with these shortcuts. Press <Kbd>?</Kbd> any time to open this panel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group}
              </p>
              <ul className="space-y-1">
                {SHORTCUTS.filter((s) => s.group === group).map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors"
                  >
                    <span className="text-sm text-foreground">{s.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, j) => (
                        <span key={j} className="flex items-center gap-1">
                          {k.icon ? <k.icon className="h-3 w-3 text-muted-foreground" /> : null}
                          <Kbd>{k.label}</Kbd>
                          {j < s.keys.length - 1 && (
                            <span className="text-[10px] text-muted-foreground/60">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground flex items-start gap-2">
          <Command className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" />
          <p>
            Tip: Use <Kbd>↑</Kbd> / <Kbd>↓</Kbd> to navigate the command palette, then <Kbd>↵</Kbd> to
            run the selected action. <Kbd>Esc</Kbd> closes any open dialog.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded border border-border bg-card text-[10px] font-mono font-medium text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06)]">
      {children}
    </kbd>
  );
}
