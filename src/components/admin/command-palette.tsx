"use client";

import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  CalendarClock,
  Megaphone,
  Radio,
  Users,
  Settings as SettingsIcon,
  FileText,
  Zap,
  Plus,
  Search,
  BarChart3,
  History,
  Keyboard,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Action = {
  id: string;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
  run: () => void;
};

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onShowShortcuts,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onNavigate: (tab: string) => void;
  onShowShortcuts?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const actions: Action[] = [
    { id: "go-dashboard", label: "Go to Dashboard", hint: "Overview & analytics", icon: LayoutDashboard, run: () => onNavigate("dashboard") },
    { id: "go-analytics", label: "Go to Analytics", hint: "Deep dive metrics", icon: BarChart3, run: () => onNavigate("analytics") },
    { id: "go-activity", label: "Go to Activity log", hint: "Audit trail of admin actions", icon: History, run: () => onNavigate("activity") },
    { id: "go-scheduled", label: "Go to Scheduled", hint: "Plan & automate broadcasts", icon: CalendarClock, run: () => onNavigate("scheduled") },
    { id: "go-broadcast", label: "Go to Broadcast", hint: "Send a message now", icon: Megaphone, run: () => onNavigate("broadcast") },
    { id: "go-templates", label: "Go to Templates", hint: "Reusable message presets", icon: FileText, run: () => onNavigate("templates") },
    { id: "go-channels", label: "Go to Channels", hint: "Manage target chats", icon: Radio, run: () => onNavigate("channels") },
    { id: "go-admins", label: "Go to Admins", hint: "Bot operators", icon: Users, run: () => onNavigate("admins") },
    { id: "go-settings", label: "Go to Settings", hint: "Bot token & config", icon: SettingsIcon, run: () => onNavigate("settings") },
    { id: "new-schedule", label: "New scheduled message", hint: "Create a scheduled broadcast", icon: Plus, run: () => onNavigate("scheduled") },
    { id: "run-now", label: "Run scheduler now", hint: "Fire due messages immediately", icon: Zap, run: () => onNavigate("scheduled") },
    ...(onShowShortcuts
      ? [{ id: "shortcuts", label: "Show keyboard shortcuts", hint: "Open the shortcuts help dialog", icon: Keyboard, run: () => onShowShortcuts() }]
      : []),
  ];

  const filtered = actions.filter(
    (a) =>
      a.label.toLowerCase().includes(query.toLowerCase()) ||
      a.hint.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    const reset = () => setActiveIdx(0);
    reset();
  }, [query]);

  useEffect(() => {
    const clear = () => {
      if (!open) setQuery("");
    };
    clear();
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const action = filtered[activeIdx];
      if (action) {
        action.run();
        onOpenChange(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden gap-0 max-w-lg" >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            placeholder="Type a command or search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin p-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No matches found.</p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((action, i) => {
                const Icon = action.icon;
                return (
                  <li key={action.id}>
                    <button
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => {
                        action.run();
                        onOpenChange(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        i === activeIdx ? "bg-accent" : "hover:bg-accent/50",
                      )}
                    >
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                        i === activeIdx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{action.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{action.hint}</p>
                      </div>
                      {i === activeIdx && (
                        <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono shrink-0">↵</kbd>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
