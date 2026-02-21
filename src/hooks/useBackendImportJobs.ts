import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface BackendImportJob {
  id: string;
  user_id: string;
  folder_name: string;
  source: string;
  model_id: string | null;
  model_name: string | null;
  status: string;
  total_files: number;
  processed_files: number;
  imported_count: number;
  dupes_count: number;
  errors_count: number;
  current_offset: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export const useBackendImportJobs = (userId: string | undefined, onJobCompleted?: (jobId: string) => void) => {
  const [jobs, setJobs] = useState<BackendImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const completedJobsRef = useRef<Set<string>>(new Set());

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("import_jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setJobs(data as unknown as BackendImportJob[]);
    }
    setLoading(false);
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Polling for live progress updates
  useEffect(() => {
    if (!userId) return;
    const hasActive = jobs.some(j => j.status === "processing" || j.status === "pending");
    const delay = hasActive ? 1500 : 10000;

    const interval = setInterval(() => {
      fetchJobs();
    }, delay);
    return () => clearInterval(interval);
  }, [userId, jobs, fetchJobs]);

  // Realtime subscription for live updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("import-jobs-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "import_jobs",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setJobs((prev) => [payload.new as unknown as BackendImportJob, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as unknown as BackendImportJob;
            // Detect job completion for auto-scan trigger
            if (updated.status === "completed" && !completedJobsRef.current.has(updated.id)) {
              completedJobsRef.current.add(updated.id);
              onJobCompleted?.(updated.id);
            }
            setJobs((prev) =>
              prev.map((j) =>
                j.id === updated.id ? updated : j
              )
            );
          } else if (payload.eventType === "DELETE") {
            setJobs((prev) => prev.filter((j) => j.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onJobCompleted]);

  // Create a new job and trigger the edge function
  const createJob = useCallback(
    async (params: {
      folderName: string;
      source: string;
      modelId: string | null;
      modelName: string | null;
      files: any[];
    }) => {
      if (!userId) return null;

      const { data: job, error } = await supabase
        .from("import_jobs")
        .insert({
          user_id: userId,
          folder_name: params.folderName,
          source: params.source,
          model_id: params.modelId,
          model_name: params.modelName,
          total_files: params.files.length,
          files_data: params.files as any,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        toast({
          title: "Erreur création job",
          description: error.message,
          variant: "destructive",
        });
        return null;
      }

      // Trigger the edge function (fire-and-forget from client side)
      triggerJob(job.id);

      return job as unknown as BackendImportJob;
    },
    [userId, toast]
  );

  // Trigger/resume a job
  const triggerJob = useCallback(async (jobId: string) => {
    try {
      await supabase.functions.invoke("process-import-batch", {
        body: { job_id: jobId },
      });
    } catch (e) {
      console.error("Failed to trigger job:", e);
    }
  }, []);

  // Resume a paused/errored job
  const resumeJob = useCallback(
    async (jobId: string) => {
      // Reset status to processing so edge function picks it up
      await supabase
        .from("import_jobs")
        .update({ status: "processing", error: null })
        .eq("id", jobId);

      triggerJob(jobId);
      toast({ title: "Job relancé" });
    },
    [triggerJob, toast]
  );

  // Restart a job from scratch
  const restartJob = useCallback(
    async (jobId: string) => {
      await supabase
        .from("import_jobs")
        .update({
          status: "pending",
          current_offset: 0,
          processed_files: 0,
          imported_count: 0,
          dupes_count: 0,
          errors_count: 0,
          error: null,
          completed_at: null,
        })
        .eq("id", jobId);

      triggerJob(jobId);
      toast({ title: "Job redémarré depuis le début" });
    },
    [triggerJob, toast]
  );

  // Pause a job
  const pauseJob = useCallback(
    async (jobId: string) => {
      await supabase
        .from("import_jobs")
        .update({ status: "paused" })
        .eq("id", jobId);
      toast({ title: "Job mis en pause" });
    },
    [toast]
  );

  // Remove a job
  const removeJob = useCallback(
    async (jobId: string) => {
      // First pause it so edge function stops
      await supabase
        .from("import_jobs")
        .update({ status: "cancelled" })
        .eq("id", jobId);
      // Then delete
      await supabase.from("import_jobs").delete().eq("id", jobId);
    },
    []
  );

  // Clear completed/cancelled/error jobs
  const clearCompleted = useCallback(async () => {
    const toRemove = jobs.filter(j => j.status === "completed" || j.status === "cancelled" || j.status === "error");
    for (const j of toRemove) {
      await supabase.from("import_jobs").delete().eq("id", j.id);
    }
    setJobs(prev => prev.filter(j => j.status !== "completed" && j.status !== "cancelled" && j.status !== "error"));
    toast({ title: `${toRemove.length} job(s) nettoyé(s)` });
  }, [jobs, toast]);

  // Clear all jobs
  const clearAll = useCallback(async () => {
    // Pause active ones first
    for (const j of jobs.filter(j => j.status === "processing" || j.status === "pending")) {
      await supabase.from("import_jobs").update({ status: "cancelled" }).eq("id", j.id);
    }
    for (const j of jobs) {
      await supabase.from("import_jobs").delete().eq("id", j.id);
    }
    setJobs([]);
    toast({ title: "Tous les jobs supprimés" });
  }, [jobs, toast]);

  // Pause all active jobs
  const pauseAll = useCallback(async () => {
    const active = jobs.filter(j => j.status === "processing" || j.status === "pending");
    for (const j of active) {
      await supabase.from("import_jobs").update({ status: "paused" }).eq("id", j.id);
    }
    toast({ title: `${active.length} job(s) mis en pause` });
  }, [jobs, toast]);

  // Resume all paused jobs
  const resumeAll = useCallback(async () => {
    const paused = jobs.filter(j => j.status === "paused");
    for (const j of paused) {
      await supabase.from("import_jobs").update({ status: "processing", error: null }).eq("id", j.id);
      triggerJob(j.id);
    }
    toast({ title: `${paused.length} job(s) repris` });
  }, [jobs, triggerJob, toast]);

  const activeJobs = jobs.filter(
    (j) => j.status === "pending" || j.status === "processing"
  );
  const completedJobs = jobs.filter(
    (j) => j.status === "completed" || j.status === "error" || j.status === "cancelled" || j.status === "paused"
  );

  return {
    jobs,
    activeJobs,
    completedJobs,
    loading,
    createJob,
    resumeJob,
    restartJob,
    pauseJob,
    removeJob,
    clearCompleted,
    clearAll,
    pauseAll,
    resumeAll,
    refetch: fetchJobs,
  };
};
