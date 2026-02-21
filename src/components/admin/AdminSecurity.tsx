import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Shield, Loader2, Trash2, Plus, Ban, Download, Server, HardDrive, Database, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const AdminSecurity = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  // Login logs
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [searchDate, setSearchDate] = useState("");

  // Blocked IPs
  const [blockedIps, setBlockedIps] = useState<any[]>([]);
  const [showAddIp, setShowAddIp] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newIpReason, setNewIpReason] = useState("");

  // System
  const [purging, setPurging] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [logsRes, ipsRes] = await Promise.all([
      supabase.from("login_logs").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("blocked_ips").select("*").order("created_at", { ascending: false }),
    ]);
    if (logsRes.data) setLoginLogs(logsRes.data);
    if (ipsRes.data) setBlockedIps(ipsRes.data);
    setLoading(false);
  };

  const filteredLogs = searchDate
    ? loginLogs.filter(l => l.created_at.startsWith(searchDate))
    : loginLogs;

  const exportCsv = () => {
    const headers = ["Date", "Email", "Succès", "Source", "IP"];
    const rows = filteredLogs.map(l => [
      new Date(l.created_at).toLocaleString("fr-FR"),
      l.email || "—",
      l.success ? "Oui" : "Non",
      l.source || "—",
      l.ip_hashed || "—",
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `login-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const addBlockedIp = async () => {
    if (!newIp.trim() || !user) return;
    const { error } = await supabase.from("blocked_ips").insert({ ip_address: newIp.trim(), reason: newIpReason.trim() || null, blocked_by: user.id });
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else { toast({ title: "IP bloquée" }); setNewIp(""); setNewIpReason(""); setShowAddIp(false); loadAll(); }
  };

  const unblockIp = async (id: string) => {
    await supabase.from("blocked_ips").delete().eq("id", id);
    toast({ title: "IP débloquée" });
    loadAll();
  };

  const purgeCache = async () => {
    setPurging(true);
    const { data, error } = await supabase.rpc("purge_expired_data");
    if (error) toast({ title: "Erreur", variant: "destructive" });
    else toast({ title: "Cache purgé", description: JSON.stringify(data) });
    setPurging(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Shield size={20} className="text-primary" /> Sécurité & Système
      </h2>

      {/* Login logs */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Logs connexions ({filteredLogs.length})</h3>
          <div className="flex gap-2">
            <Input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)} className="h-9 w-40 text-xs" />
            <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1"><Download size={14} /> CSV</Button>
          </div>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground font-medium uppercase bg-muted/50 border-b border-border">
            <div className="w-28">Date</div>
            <div className="flex-1">Email</div>
            <div className="w-20">Source</div>
            <div className="w-20">IP</div>
            <div className="w-16 text-center">Statut</div>
          </div>
          <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
            {filteredLogs.slice(0, 100).map(l => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-accent/50">
                <div className="w-28 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                <div className="flex-1 text-xs text-foreground truncate">{l.email || "—"}</div>
                <div className="w-20 text-xs text-muted-foreground">{l.source || "—"}</div>
                <div className="w-20 text-xs text-muted-foreground font-mono">{l.ip_hashed ? l.ip_hashed.slice(0, 8) : "—"}</div>
                <div className="w-16 text-center">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", l.success ? "bg-emerald-500/20 text-emerald-600" : "bg-destructive/20 text-destructive")}>
                    {l.success ? "OK" : "Échec"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Blocked IPs */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2"><Ban size={18} /> IPs bloquées ({blockedIps.length})</h3>
          <Button size="sm" onClick={() => setShowAddIp(true)} className="gap-1"><Plus size={14} /> Bloquer IP</Button>
        </div>
        <div className="space-y-2">
          {blockedIps.map(ip => (
            <div key={ip.id} className="flex items-center justify-between bg-background border border-border rounded-lg px-4 py-3">
              <div>
                <p className="text-sm text-foreground font-mono">{ip.ip_address}</p>
                <p className="text-xs text-muted-foreground">{ip.reason || "Aucune raison"} • {new Date(ip.created_at).toLocaleDateString("fr-FR")}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => unblockIp(ip.id)}>Débloquer</Button>
            </div>
          ))}
          {blockedIps.length === 0 && <p className="text-muted-foreground text-center py-4">Aucune IP bloquée.</p>}
        </div>
      </section>

      {/* System */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2"><Server size={18} /> Système</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div className="bg-background rounded-lg p-3 border border-border">
            <p className="text-xs text-muted-foreground">Version</p>
            <p className="text-foreground font-medium">1.0.0</p>
          </div>
          <div className="bg-background rounded-lg p-3 border border-border">
            <p className="text-xs text-muted-foreground">Base de données</p>
            <p className="text-foreground font-medium flex items-center gap-1"><Database size={14} /> PostgreSQL</p>
          </div>
          <div className="bg-background rounded-lg p-3 border border-border">
            <p className="text-xs text-muted-foreground">Runtime</p>
            <p className="text-foreground font-medium">Lovable Cloud</p>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button variant="outline" onClick={purgeCache} disabled={purging} className="gap-1">
            <RefreshCw size={14} className={purging ? "animate-spin" : ""} /> {purging ? "Purge..." : "Purger les données expirées"}
          </Button>
        </div>
      </section>

      {/* Add IP dialog */}
      <Dialog open={showAddIp} onOpenChange={setShowAddIp}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Bloquer une IP</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Adresse IP</Label><Input value={newIp} onChange={e => setNewIp(e.target.value)} placeholder="192.168.1.1" /></div>
            <div><Label>Raison</Label><Input value={newIpReason} onChange={e => setNewIpReason(e.target.value)} placeholder="Optionnel..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddIp(false)}>Annuler</Button>
            <Button onClick={addBlockedIp} disabled={!newIp.trim()}>Bloquer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSecurity;
