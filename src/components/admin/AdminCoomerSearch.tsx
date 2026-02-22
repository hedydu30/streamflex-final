import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Search,
  Loader2,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  User,
  ImageIcon,
  Film,
  ExternalLink,
  Plus,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw,
  SkipForward,
} from "lucide-react";

// ── Platform config ───────────────────────────────────────────
const PLATFORM_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  onlyfans: { label: "OnlyFans", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  fansly: { label: "Fansly", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
  patreon: { label: "Patreon", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  subscribestar: { label: "SubscribeStar", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  fanbox: { label: "Fanbox", color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/30" },
};

interface ImportJob {
  id: string;
  name: string;
  service: string;
  status: "pending" | "running" | "done" | "error";
  found?: number;
  imported?: number;
  error?: string;
  progress?: number;
}

const AdminCoomerSearch = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchCreators, setSearchCreators] = useState<any[]>([]);
  const [queue, setQueue] = useState<ImportJob[]>([]);
  const [running, setRunning] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("coomer-import", {
        body: { action: "search-creators", query: searchQuery.trim() },
      });
      if (error) throw error;
      setSearchCreators(data.results || []);
    } catch (err: any) {
      toast({ title: "Erreur de recherche", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const addToQueue = (creator: any) => {
    const id = `${creator.service}-${creator.id}`;
    if (queue.find((j) => j.id === id)) return;
    setQueue((prev) => [...prev, {
      id,
      name: creator.name,
      service: creator.service,
      status: "pending",
    }]);
  };

  const processQueue = useCallback(async () => {
    if (running || queue.length === 0) return;
    const nextJob = queue.find((j) => j.status === "pending");
    if (!nextJob) return;

    setRunning(true);
    setQueue((prev) => prev.map((j) => (j.id === nextJob.id ? { ...j, status: "running" } : j)));

    try {
      const { data, error } = await supabase.functions.invoke("coomer-import", {
        body: {
          action: "import-creator",
          service: nextJob.service,
          creator_id: nextJob.id.split("-")[1],
          creator_name: nextJob.name,
        },
      });

      if (error) throw error;

      setQueue((prev) =>
        prev.map((j) =>
          j.id === nextJob.id
            ? { ...j, status: "done", found: data.videos_found, imported: data.imported }
            : j
        )
      );
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (err: any) {
      setQueue((prev) => prev.map((j) => (j.id === nextJob.id ? { ...j, status: "error", error: err.message } : j)));
    } finally {
      setRunning(false);
    }
  }, [queue, running, queryClient]);

  const removeJob = (id: string) => setQueue((prev) => prev.filter((j) => j.id !== id));
  const clearDone = () => setQueue((prev) => prev.filter((j) => j.status !== "done"));

  const pendingCount = queue.filter((j) => j.status === "pending").length;
  const doneCount = queue.filter((j) => j.status === "done").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Download className="h-6 w-6 text-primary" /> Importation Coomer
          </h2>
          <p className="text-muted-foreground">Recherchez et importez des créateurs depuis Coomer.st</p>
        </div>
        
        {queue.length > 0 && (
          <Button 
            onClick={processQueue} 
            disabled={running || pendingCount === 0}
            className="rounded-xl shadow-lg shadow-primary/20"
          >
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4 fill-current" />
            )}
            {running ? "Importation en cours..." : `Lancer la file (${pendingCount})`}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm space-y-4">
            {/* BARRE DE RECHERCHE AVEC BOUTON X ET EFFACER */}
            <div className="flex gap-2">
              <div className="relative flex-1 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  placeholder="Nom du créateur (ex: mysteriouzwoman)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9 pr-10 bg-background/50 border-border/50 focus:border-primary/50 transition-all rounded-xl"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <Button 
                onClick={handleSearch} 
                disabled={searching}
                className="rounded-xl px-6 shadow-sm shadow-primary/20 hover:shadow-primary/40 transition-all gap-2"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="hidden sm:inline">Rechercher</span>
              </Button>
            </div>

            {searchCreators.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSearchCreators([]);
                }}
                className="text-xs text-muted-foreground hover:text-red-400 gap-1.5 px-2"
              >
                <Trash2 size={12} /> Effacer les résultats
              </Button>
            )}

            {searchCreators.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {searchCreators.map((creator) => {
                  const config = PLATFORM_CONFIG[creator.service] || { label: creator.service, color: "text-gray-400", bg: "bg-gray-500/10" };
                  const inQueue = queue.find((j) => j.id === `${creator.service}-${creator.id}`);

                  return (
                    <div 
                      key={`${creator.service}-${creator.id}`}
                      className="group relative bg-muted/30 border border-border/40 rounded-xl p-4 hover:border-primary/30 hover:bg-muted/50 transition-all overflow-hidden"
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative h-12 w-12 rounded-full overflow-hidden bg-muted border border-border/20">
                          {creator.profile_pic_url ? (
                            <img src={creator.profile_pic_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-full w-full p-2 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold truncate group-hover:text-primary transition-colors">{creator.name}</h4>
                          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium uppercase", config.bg, config.color)}>
                            {config.label}
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-4 flex items-center justify-between gap-2">
                        <a 
                          href={creator.profile_url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
                        >
                          Profil <ExternalLink size={10} />
                        </a>
                        <Button
                          size="sm"
                          variant={inQueue ? "secondary" : "default"}
                          disabled={!!inQueue}
                          onClick={() => addToQueue(creator)}
                          className="h-8 rounded-lg text-xs gap-1.5"
                        >
                          {inQueue ? <CheckCircle2 size={14} /> : <Plus size={14} />}
                          {inQueue ? "Dans la file" : "Ajouter"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : searching ? (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
                <p className="text-sm animate-pulse">Recherche des profils sur toutes les plateformes...</p>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground/40 gap-3 border-2 border-dashed border-border/40 rounded-xl">
                <Search className="h-10 w-10 opacity-20" />
                <p className="text-sm">Aucun résultat à afficher</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> File d'attente
              {queue.length > 0 && (
                <span className="ml-auto text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {queue.length}
                </span>
              )}
            </h3>

            {queue.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl border-border/60">
                La file est vide
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {queue.map((job) => (
                  <div key={job.id} className="bg-muted/30 border border-border/40 rounded-xl p-3 text-sm relative group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium truncate pr-8">{job.name}</span>
                      <button 
                        onClick={() => removeJob(job.id)}
                        className="opacity-0 group-hover:opacity-100 absolute top-3 right-3 text-muted-foreground hover:text-red-400 transition-all"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="uppercase">{job.service}</span>
                      {job.status === "running" && (
                        <span className="text-primary flex items-center gap-1 animate-pulse">
                          <Loader2 size={10} className="animate-spin" /> Importation...
                        </span>
                      )}
                      {job.status === "done" && (
                        <span className="text-green-400 flex items-center gap-1">
                          <CheckCircle2 size={10} /> {job.imported} vidéos
                        </span>
                      )}
                      {job.status === "error" && (
                        <span className="text-red-400 flex items-center gap-1" title={job.error}>
                          <AlertTriangle size={10} /> Échec
                        </span>
                      )}
                      {job.status === "pending" && (
                        <span className="flex items-center gap-1 italic opacity-60">En attente</span>
                      )}
                    </div>
                  </div>
                ))}

                {running && (
                  <Button variant="ghost" size="sm" className="w-full text-xs text-red-400/70 hover:text-red-400 gap-1.5" onClick={() => setRunning(false)}>
                    <X size={15} /> Arrêter
                  </Button>
                )}

                {doneCount > 0 && !running && (
                  <Button onClick={clearDone} variant="outline" size="sm" className="w-full text-xs gap-1.5">
                    <Trash2 size={11} /> Effacer les terminés ({doneCount})
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Help box */}
          <div className="bg-muted/30 border border-border/60 rounded-xl p-4 space-y-2 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground text-xs flex items-center gap-1.5">
              <Film size={12} className="text-primary" /> Ce qui est importé
            </p>
            <ul className="space-y-1 leading-relaxed">
              <li>✅ Photo de profil + bannière de couverture</li>
              <li>✅ Toutes les vidéos (.mp4, .webm, .mkv, …)</li>
              <li>✅ Miniatures disponibles</li>
              <li>✅ Ajout dans la page Modèles</li>
              <li>❌ Images (.jpg, .png, …)</li>
              <li>❌ Fichiers audio (.mp3, .m4a, …)</li>
            </ul>
            <p className="mt-2 text-[10px] opacity-60">
              Les doublons sont automatiquement ignorés. La file traite les créateurs un par un pour éviter les limites.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCoomerSearch;
