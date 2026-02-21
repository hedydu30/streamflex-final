import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ImportJob {
  id: string;
  folderName: string;
  status: "pending" | "processing" | "completed" | "cancelled" | "error";
  totalFiles: number;
  processedFiles: number;
  progress: number;
  importedCount: number;
  dupesCount: number;
  errorsCount: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  modelId?: string | null;
}

const MAX_CONCURRENT = 3;

export const useImportQueue = (userId: string | undefined, onComplete?: () => void) => {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const processingRef = useRef(false);
  const jobsRef = useRef<ImportJob[]>([]);

  // Keep ref in sync
  const updateJobs = useCallback((updater: (prev: ImportJob[]) => ImportJob[]) => {
    setJobs((prev) => {
      const next = updater(prev);
      jobsRef.current = next;
      return next;
    });
  }, []);

  const addJob = useCallback((job: Omit<ImportJob, "id" | "status" | "processedFiles" | "progress" | "importedCount" | "dupesCount" | "errorsCount" | "startedAt">) => {
    const newJob: ImportJob = {
      ...job,
      id: crypto.randomUUID(),
      status: "pending",
      processedFiles: 0,
      progress: 0,
      importedCount: 0,
      dupesCount: 0,
      errorsCount: 0,
      startedAt: new Date(),
    };
    updateJobs((prev) => [...prev, newJob]);
    return newJob.id;
  }, [updateJobs]);

  const cancelJob = useCallback((jobId: string) => {
    const controller = abortControllers.current.get(jobId);
    if (controller) controller.abort();
    abortControllers.current.delete(jobId);
    updateJobs((prev) =>
      prev.map((j) => (j.id === jobId && j.status !== "completed" ? { ...j, status: "cancelled" as const, completedAt: new Date() } : j))
    );
  }, [updateJobs]);

  const removeJob = useCallback((jobId: string) => {
    cancelJob(jobId);
    updateJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, [cancelJob, updateJobs]);

  const processJob = useCallback(async (
    jobId: string,
    files: any[],
    token: string,
    modelId: string | null
  ) => {
    const controller = new AbortController();
    abortControllers.current.set(jobId, controller);

    updateJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: "processing" as const, startedAt: new Date(), modelId } : j))
    );

    let imported = 0;
    let dupes = 0;
    let errors = 0;

    for (let i = 0; i < files.length; i++) {
      if (controller.signal.aborted) break;

      const file = files[i];
      try {
        const { error } = await supabase.from("imported_videos").insert({
          user_id: userId,
          source: "1fichier",
          title: file.filename || "Vidéo 1fichier",
          original_url: file.url || `https://1fichier.com/?${file.filename}`,
          file_size: file.size || null,
          format: file.filename?.split(".").pop() || null,
          metadata: file,
          model_id: modelId,
        });
        if (error) {
          if (error.code === "23505") dupes++;
          else errors++;
        } else {
          imported++;
        }
      } catch {
        errors++;
      }

      updateJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                processedFiles: i + 1,
                progress: Math.round(((i + 1) / files.length) * 100),
                importedCount: imported,
                dupesCount: dupes,
                errorsCount: errors,
              }
            : j
        )
      );
    }

    const finalStatus = controller.signal.aborted ? "cancelled" : errors > 0 && imported === 0 ? "error" : "completed";

    updateJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? { ...j, status: finalStatus as ImportJob["status"], completedAt: new Date() }
          : j
      )
    );

    abortControllers.current.delete(jobId);
    onComplete?.();
  }, [userId, updateJobs, onComplete]);

  const processQueue = useCallback(async (
    pendingJobs: { jobId: string; files: any[]; token: string; modelId: string | null }[]
  ) => {
    if (processingRef.current) return;
    processingRef.current = true;

    const queue = [...pendingJobs];
    const active: Promise<void>[] = [];

    const startNext = () => {
      if (queue.length === 0) return;
      const next = queue.shift()!;
      const promise = processJob(next.jobId, next.files, next.token, next.modelId).then(() => {
        const idx = active.indexOf(promise);
        if (idx >= 0) active.splice(idx, 1);
        startNext();
      });
      active.push(promise);
    };

    // Start up to MAX_CONCURRENT
    for (let i = 0; i < Math.min(MAX_CONCURRENT, queue.length); i++) {
      startNext();
    }

    // Wait for all to finish
    while (active.length > 0) {
      await Promise.race(active);
    }

    processingRef.current = false;
  }, [processJob]);

  const activeCount = jobs.filter((j) => j.status === "processing").length;
  const pendingCount = jobs.filter((j) => j.status === "pending").length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;

  return {
    jobs,
    addJob,
    cancelJob,
    removeJob,
    processQueue,
    activeCount,
    pendingCount,
    completedCount,
  };
};
