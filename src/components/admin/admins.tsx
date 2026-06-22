"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Users, Trash2, ShieldCheck, Crown, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiFetch, formatDate, EmptyState, type Admin } from "./shared";

export function Admins() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [telegramId, setTelegramId] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Admin | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await apiFetch<Admin[]>("/api/admins");
    if (error) toast.error(error);
    else setAdmins(data || []);
    setLoading(false);
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, []);

  const submit = async () => {
    if (!telegramId.trim()) {
      toast.error("Telegram ID is required");
      return;
    }
    setSubmitting(true);
    const { error } = await apiFetch("/api/admins", {
      method: "POST",
      body: JSON.stringify({ telegramId: telegramId.trim(), name: name.trim() }),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Admin added");
    setTelegramId("");
    setName("");
    setOpen(false);
    load();
  };

  const remove = async () => {
    if (!deleteTarget) return;
    const { error } = await apiFetch(`/api/admins/${deleteTarget.id}`, { method: "DELETE" });
    if (error) {
      toast.error(error);
    } else {
      toast.success("Admin removed");
      load();
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Bot administrators</h2>
          <p className="text-sm text-muted-foreground">Users who can manage the bot and send broadcasts.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={load} className="focus-visible:ring-2 focus-visible:ring-ring">
            <RefreshCw className="h-4 w-4" /> <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="focus-visible:ring-2 focus-visible:ring-ring">
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add admin</span><span className="sm:hidden">Add</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add a new admin</DialogTitle>
                <DialogDescription>
                  Enter the numeric Telegram user ID. Use a bot like <span className="font-mono">@userinfobot</span> to look it up.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="tg-id">Telegram user ID</Label>
                  <Input
                    id="tg-id"
                    placeholder="e.g. 1278759197"
                    value={telegramId}
                    onChange={(e) => setTelegramId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tg-name">Display name (optional)</Label>
                  <Input id="tg-name" placeholder="e.g. Sara" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? "Adding…" : "Add admin"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : admins.length === 0 ? (
            <div className="empty-state-icon-emerald">
              <EmptyState
                icon={Users}
                title="No admins yet"
                description="Add your first administrator to start managing the bot."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {admins.map((a) => (
                <li key={a.id} className="flex items-center gap-4 p-4 hover:bg-accent/40 transition-colors">
                  <Avatar className="h-10 w-10 border">
                    <AvatarFallback className={a.isOwner ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"}>
                      {a.isOwner ? <Crown className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{a.name || `Admin ${a.telegramId}`}</p>
                      {a.isOwner && (
                        <Badge variant="outline" className="badge-soft-emerald gap-1 shrink-0">
                          <Crown className="h-3 w-3" /> Owner
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground font-mono truncate">{a.telegramId}</p>
                  </div>
                  <div className="hidden sm:block text-xs text-muted-foreground whitespace-nowrap shrink-0">Added {formatDate(a.createdAt)}</div>
                  {!a.isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                      onClick={() => setDeleteTarget(a)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove admin?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke admin access for{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name || deleteTarget?.telegramId}</span>. They will no longer be able to manage the bot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-rose-600 hover:bg-rose-700 text-white">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
