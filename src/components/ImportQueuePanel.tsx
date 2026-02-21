import { ImportJob } from "@/hooks/useImportQueue";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { X, Loader2, CheckCircle, AlertTriangle, Clock, FolderOpen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportQueuePanelProps {
  jobs: ImportJob[];
  onCancel: (jobId: string) => void;
  onRemove: (jobId: string) => void;
}

const statusConfig = {
  pending: { label: "En attente", icon: Clock, color: "text-muted-foreground", bg: "bg-muted" },
  processing: { label: "En cours", icon: Loader2, color: "text-primary", bg: "bg-primary/10" },
  completed: { label: "Terminé", icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10" },
  cancelled: { label: "Annulé", icon: X, color: "text-muted-foreground", bg: "bg-muted" },
  error: { label: "Erreur", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
};

function formatElapsed(start: Date, end?: Date): string {
  const ms = (end || new Date()).getTime() - start.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

const ImportQueuePanel = ({ jobs, onCancel, onRemove }: ImportQueuePanelProps) => {
  if (jobs.length === 0) return null;

  const activeJobs = jobs.filter((j) => j.status === "processing" || j.status === "pending");
  const doneJobs = jobs.filter((j) => j.status === "completed" || j.status === "cancelled" || j.status === "error");

  return (
    <div className="space-y-3">
      <h4 className="text-foreground font-semibold text-sm flex items-center gap-2">
        <FolderOpen size={16} className="text-primary" />
        File d'attente ({activeJobs.length} actif{activeJobs.length > 1 ? "s" : ""}, {doneJobs.length} terminé{doneJobs.length > 1 ? "s" : ""})
      </h4>

      {/* Active / Pending jobs */}
      {activeJobs.map((job) => {
        const config = statusConfig[job.status];
        const StatusIcon = config.icon;

        return (
          <div key={job.id} className={cn("rounded-lg border border-border p-4 space-y-3", config.bg)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <StatusIcon
                  size={16}
                  className={cn(config.color, job.status === "processing" && "animate-spin")}
                />
                <span className="text-foreground font-medium text-sm truncate">{job.folderName}</span>
                <span className={cn("text-xs px-1.5 py-0.5 rounded-full", config.bg, config.color)}>
                  {config.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatElapsed(job.startedAt)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onCancel(job.id)}
                >
                  <X size={14} />
                </Button>
              </div>
            </div>

            {job.status === "processing" && (
              <>
                <Progress value={job.progress} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {job.processedFiles} / {job.totalFiles} fichier{job.totalFiles > 1 ? "s" : ""}
                  </span>
                  <div className="flex gap-3">
                    <span className="text-primary">{job.importedCount} importé{job.importedCount > 1 ? "s" : ""}</span>
                    {job.dupesCount > 0 && <span>{job.dupesCount} doublon{job.dupesCount > 1 ? "s" : ""}</span>}
                    {job.errorsCount > 0 && <span className="text-destructive">{job.errorsCount} erreur{job.errorsCount > 1 ? "s" : ""}</span>}
                    <span>{job.totalFiles - job.processedFiles} restant{(job.totalFiles - job.processedFiles) > 1 ? "s" : ""}</span>
                  </div>
                </div>
              </>
            )}

            {job.status === "pending" && (
              <p className="text-xs text-muted-foreground">{job.totalFiles} fichier{job.totalFiles > 1 ? "s" : ""} en attente</p>
            )}
          </div>
        );
      })}

      {/* Completed jobs */}
      {doneJobs.length > 0 && (
        <div className="space-y-1">
          {doneJobs.map((job) => {
            const config = statusConfig[job.status];
            const StatusIcon = config.icon;

            return (
              <div key={job.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/30 text-sm">
                <StatusIcon size={14} className={config.color} />
                <span className="text-foreground truncate flex-1">{job.folderName}</span>
                {job.status === "completed" && (
                  <span className="text-xs text-muted-foreground">
                    {job.importedCount} importé{job.importedCount > 1 ? "s" : ""}
                    {job.dupesCount > 0 ? `, ${job.dupesCount} doublon${job.dupesCount > 1 ? "s" : ""}` : ""}
                  </span>
                )}
                {job.status === "error" && (
                  <span className="text-xs text-destructive">{job.errorsCount} erreur{job.errorsCount > 1 ? "s" : ""}</span>
                )}
                <span className="text-xs text-muted-foreground">{formatElapsed(job.startedAt, job.completedAt)}</span>
                <button onClick={() => onRemove(job.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ImportQueuePanel;
