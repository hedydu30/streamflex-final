import { BackendImportJob } from "@/hooks/useBackendImportJobs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Loader2, CheckCircle, AlertTriangle, Clock, Pause, Play,
  RotateCcw, Trash2, X, ChevronDown, ChevronUp, Timer
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ImportJobsBarProps {
  jobs: BackendImportJob[];
  onResume: (jobId: string) => void;
  onRestart: (jobId: string) => void;
  onPause: (jobId: string) => void;
  onRemove: (jobId: string) => void;
  onClearCompleted?: () => void;
  onClearAll?: () => void;
  onPauseAll?: () => void;
  onResumeAll?: () => void;
}

const statusConfig: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  pending: { label: "En attente", icon: Clock, color: "text-muted-foreground", bg: "bg-muted" },
  processing: { label: "En cours", icon: Loader2, color: "text-primary", bg: "bg-primary/10" },
  completed: { label: "Terminé", icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10" },
  cancelled: { label: "Annulé", icon: X, color: "text-muted-foreground", bg: "bg-muted" },
  error: { label: "Erreur", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
  paused: { label: "En pause", icon: Pause, color: "text-yellow-500", bg: "bg-yellow-500/10" },
};

const formatEta = (job: BackendImportJob): string | null => {
  if (job.status !== "processing" || job.processed_files === 0) return null;
  const elapsed = (new Date().getTime() - new Date(job.created_at).getTime()) / 1000;
  const rate = job.processed_files / elapsed; // files per second
  const remaining = job.total_files - job.processed_files;
  if (rate <= 0) return null;
  const etaSec = Math.ceil(remaining / rate);
  if (etaSec < 60) return `~${etaSec}s`;
  if (etaSec < 3600) return `~${Math.ceil(etaSec / 60)}min`;
  const h = Math.floor(etaSec / 3600);
  const m = Math.ceil((etaSec % 3600) / 60);
  return `~${h}h${m > 0 ? ` ${m}min` : ""}`;
};

const formatSpeed = (job: BackendImportJob): string | null => {
  if (job.status !== "processing" || job.processed_files === 0) return null;
  const elapsed = (new Date().getTime() - new Date(job.created_at).getTime()) / 1000;
  const rate = job.processed_files / elapsed;
  if (rate < 1) return `${(rate * 60).toFixed(0)}/min`;
  return `${rate.toFixed(1)}/s`;
};

const formatNumber = (n: number): string => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
};

const ImportJobsBar = ({ jobs, onResume, onRestart, onPause, onRemove, onClearCompleted, onClearAll, onPauseAll, onResumeAll }: ImportJobsBarProps) => {
  const [expanded, setExpanded] = useState(true);

  if (jobs.length === 0) return null;

  const activeJobs = jobs.filter((j) => j.status === "processing" || j.status === "pending");
  const totalProgress = jobs.reduce((s, j) => s + j.processed_files, 0);
  const totalFiles = jobs.reduce((s, j) => s + j.total_files, 0);
  const globalPercent = totalFiles > 0 ? Math.round((totalProgress / totalFiles) * 100) : 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeJobs.length > 0 && (
            <Loader2 size={16} className="animate-spin text-primary" />
          )}
          <span className="text-foreground font-semibold text-sm">
            File d'import
            {activeJobs.length > 0 && (
              <span className="text-muted-foreground font-normal ml-2">
                {activeJobs.length} actif{activeJobs.length > 1 ? "s" : ""} — {globalPercent}%
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {activeJobs.length > 0 && totalFiles > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="tabular-nums">{formatNumber(totalProgress)}/{formatNumber(totalFiles)}</span>
              {(() => {
                const processingJob = activeJobs.find(j => j.status === "processing");
                if (!processingJob) return null;
                const eta = formatEta(processingJob);
                const speed = formatSpeed(processingJob);
                return (
                  <span className="flex items-center gap-2">
                    {speed && <span className="text-primary font-mono">{speed}</span>}
                    {eta && <span className="flex items-center gap-1 text-primary"><Timer size={12} /> {eta}</span>}
                  </span>
                );
              })()}
            </div>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Global progress bar */}
      {activeJobs.length > 0 && (
        <Progress value={globalPercent} className="h-2" />
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {activeJobs.length > 0 && onPauseAll && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onPauseAll}>
            <Pause size={12} /> Tout mettre en pause
          </Button>
        )}
        {activeJobs.length === 0 && jobs.some(j => j.status === "paused") && onResumeAll && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onResumeAll}>
            <Play size={12} /> Tout reprendre
          </Button>
        )}
        {jobs.some(j => j.status === "completed" || j.status === "cancelled" || j.status === "error") && onClearCompleted && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onClearCompleted}>
            <CheckCircle size={12} /> Nettoyer terminés
          </Button>
        )}
        {jobs.length > 0 && onClearAll && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={onClearAll}>
            <Trash2 size={12} /> Tout supprimer
          </Button>
        )}
      </div>
      {expanded && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {jobs.map((job) => {
            const config = statusConfig[job.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            const percent = job.total_files > 0
              ? Math.round((job.processed_files / job.total_files) * 100)
              : 0;

            return (
              <div
                key={job.id}
                className={cn("rounded-md border border-border p-3 space-y-2", config.bg)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <StatusIcon
                      size={14}
                      className={cn(config.color, job.status === "processing" && "animate-spin")}
                    />
                    <span className="text-foreground text-sm font-medium truncate">
                      {job.folder_name}
                    </span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded-full", config.bg, config.color)}>
                      {config.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {(job.status === "error" || job.status === "paused") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => onResume(job.id)}
                        title="Reprendre"
                      >
                        <Play size={12} />
                      </Button>
                    )}
                    {(job.status === "error" || job.status === "completed" || job.status === "paused") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => onRestart(job.id)}
                        title="Redémarrer"
                      >
                        <RotateCcw size={12} />
                      </Button>
                    )}
                    {job.status === "processing" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => onPause(job.id)}
                        title="Pause"
                      >
                        <Pause size={12} />
                      </Button>
                    )}
                    {(job.status === "completed" || job.status === "cancelled" || job.status === "error") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove(job.id)}
                        title="Supprimer"
                      >
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </div>
                </div>

                {(job.status === "processing" || job.status === "paused") && (
                  <>
                    {job.total_files === 0 ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 size={12} className="animate-spin text-primary" />
                        <span>Récupération des fichiers depuis 1fichier...</span>
                      </div>
                    ) : (
                      <>
                        <Progress value={percent} className="h-1.5" />
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-muted-foreground gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="tabular-nums">{formatNumber(job.processed_files)}/{formatNumber(job.total_files)} fichiers ({percent}%)</span>
                            {job.status === "processing" && (() => {
                              const eta = formatEta(job);
                              const speed = formatSpeed(job);
                              return (
                                <span className="flex items-center gap-2">
                                  {speed && <span className="text-primary font-mono">{speed}</span>}
                                  {eta && <span className="flex items-center gap-1 text-primary"><Timer size={10} /> {eta}</span>}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <span className="text-primary">{formatNumber(job.imported_count)} importé{job.imported_count > 1 ? "s" : ""}</span>
                            {job.dupes_count > 0 && <span>{formatNumber(job.dupes_count)} doublons</span>}
                            {job.errors_count > 0 && <span className="text-destructive">{formatNumber(job.errors_count)} erreurs</span>}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {job.status === "completed" && (
                  <div className="text-xs text-muted-foreground flex gap-3">
                    <span className="text-primary">{job.imported_count} importé{job.imported_count > 1 ? "s" : ""}</span>
                    {job.dupes_count > 0 && <span>{job.dupes_count} doublons</span>}
                    {job.errors_count > 0 && <span className="text-destructive">{job.errors_count} erreurs</span>}
                  </div>
                )}

                {job.status === "error" && job.error && (
                  <p className="text-xs text-destructive">{job.error}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ImportJobsBar;
