import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 200;
const ONE_FICHIER_API = "https://api.1fichier.com/v1";
const VIDEO_EXTS = ["mp4", "webm", "mkv", "avi", "mov", "m4v"];
const RATE_LIMIT_MS = 8000;

const delayMs = (ms: number) => new Promise(r => setTimeout(r, ms));

const isVideoFile = (filename: string | undefined): boolean => {
  if (!filename) return false;
  const ext = filename.split(".").pop()?.toLowerCase();
  return VIDEO_EXTS.includes(ext || "");
};

// Fetch with retry for 1fichier flood protection
const fetchWithRetry = async (url: string, options: RequestInit, retries = 5): Promise<Response> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) return response;
    const body = await response.text();
    if ((body.includes("Flood") || body.includes("IP Locked") || response.status === 403) && attempt < retries) {
      const backoff = RATE_LIMIT_MS * Math.pow(2, attempt);
      console.warn(`Flood detected, retry ${attempt + 1}/${retries} in ${backoff}ms`);
      await delayMs(backoff);
      continue;
    }
    throw new Error(`1fichier API error [${response.status}]: ${body}`);
  }
  throw new Error("Max retries exceeded");
};

// Self-chain helper
const selfChain = (supabaseUrl: string, serviceKey: string, anonKey: string, jobId: string) => {
  fetch(`${supabaseUrl}/functions/v1/process-import-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: anonKey,
      "x-self-chain": "true",
    },
    body: JSON.stringify({ job_id: jobId }),
  }).catch((e) => console.error("Self-chain error:", e));
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // --- Authentication check ---
    const authHeader = req.headers.get("Authorization");
    let callerUserId: string | null = null;
    const isSelfChain = req.headers.get("x-self-chain") === "true";

    if (!isSelfChain) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerUserId = user.id;
    }

    const body = await req.json();
    const jobId = body.job_id as string;

    if (!jobId) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch job
    const { data: job, error: jobErr } = await supabase
      .from("import_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Ownership check ---
    if (callerUserId && job.user_id !== callerUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.status !== "pending" && job.status !== "processing") {
      return new Response(
        JSON.stringify({ status: job.status, message: "Job not processable" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark as processing
    if (job.status === "pending") {
      await supabase.from("import_jobs").update({ status: "processing" }).eq("id", jobId);
    }

    // ========================================
    // PHASE 1: Paginated folder discovery
    // Process ONE folder per invocation, self-chain for the rest
    // ========================================
    let files = (job.files_data as any[]) || [];
    const discoveryStatus = job.discovery_status || "pending";

    if (files.length === 0 && job.fichier_folder_id && job.fichier_token && discoveryStatus !== "done") {
      let queue: number[] = (job.discovery_queue as number[]) || [];
      
      // Initialize queue with root folder if empty
      if (queue.length === 0 && discoveryStatus === "pending") {
        queue = [job.fichier_folder_id];
        await supabase.from("import_jobs").update({
          discovery_queue: queue,
          discovery_status: "scanning",
        }).eq("id", jobId);
        console.log(`Job ${jobId}: starting discovery from folder ${job.fichier_folder_id}`);
      }

      if (queue.length === 0) {
        // Discovery done, no more folders to scan
        // Re-fetch job to get accumulated files_data
        const { data: updatedJob } = await supabase.from("import_jobs").select("files_data, total_files").eq("id", jobId).single();
        files = (updatedJob?.files_data as any[]) || [];
        
        if (files.length === 0) {
          await supabase.from("import_jobs").update({
            status: "completed",
            discovery_status: "done",
            completed_at: new Date().toISOString(),
            error: "Aucun fichier vidéo trouvé dans ce dossier",
            fichier_token: null,
          }).eq("id", jobId);
          return new Response(JSON.stringify({ status: "completed", message: "No video files found" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Mark discovery done and continue to import phase
        await supabase.from("import_jobs").update({
          discovery_status: "done",
          fichier_token: null,
        }).eq("id", jobId);
      } else {
        // Process ONE folder from the queue
        const currentFolderId = queue[0];
        const remainingQueue = queue.slice(1);

        console.log(`Job ${jobId}: scanning folder ${currentFolderId}, ${remainingQueue.length} remaining in queue`);

        try {
          // 1. Fetch files from this folder
          const reqBody: any = { folder_id: currentFolderId };
          const response = await fetchWithRetry(`${ONE_FICHIER_API}/file/ls.cgi`, {
            method: "POST",
            headers: { Authorization: `Bearer ${job.fichier_token}`, "Content-Type": "application/json" },
            body: JSON.stringify(reqBody),
          });
          const data = await response.json();
          const items = data?.items || [];
          
          const videoFiles = items
            .filter((f: any) => isVideoFile(f.filename))
            .map((f: any) => ({ filename: f.filename, url: f.url, size: f.size, date: f.date }));

          console.log(`Job ${jobId}: folder ${currentFolderId} => ${videoFiles.length} video files out of ${items.length} items`);

          // 2. Fetch sub-folders and add them to queue
          await delayMs(RATE_LIMIT_MS);
          const sRes = await fetchWithRetry(`${ONE_FICHIER_API}/folder/ls.cgi`, {
            method: "POST",
            headers: { Authorization: `Bearer ${job.fichier_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ folder_id: currentFolderId }),
          });
          const sData = await sRes.json();
          const subFolders = (sData?.sub_folders || []).map((sf: any) => sf.id);

          const newQueue = [...remainingQueue, ...subFolders];

          // 3. Append video files to accumulated files_data
          const existingFiles = (job.files_data as any[]) || [];
          // Deduplicate by URL
          const seenUrls = new Set(existingFiles.map((f: any) => f.url));
          const newFiles = videoFiles.filter((f: any) => !seenUrls.has(f.url));
          const allFiles = [...existingFiles, ...newFiles];

          // 4. Update job with new state
          await supabase.from("import_jobs").update({
            files_data: allFiles,
            total_files: allFiles.length,
            discovery_queue: newQueue,
            discovery_status: newQueue.length === 0 ? "done" : "scanning",
            ...(newQueue.length === 0 ? { fichier_token: null } : {}),
          }).eq("id", jobId);

          console.log(`Job ${jobId}: total files so far: ${allFiles.length}, queue: ${newQueue.length} folders`);

          // Self-chain to continue (discovery or import)
          selfChain(supabaseUrl, serviceKey, anonKey, jobId);

          return new Response(JSON.stringify({
            phase: "discovery",
            scanned_folder: currentFolderId,
            video_files_found: newFiles.length,
            total_accumulated: allFiles.length,
            folders_remaining: newQueue.length,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });

        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`Job ${jobId}: discovery error on folder ${currentFolderId}:`, e);
          // Skip this folder and continue with the rest
          if (remainingQueue.length > 0) {
            await supabase.from("import_jobs").update({
              discovery_queue: remainingQueue,
              error: `Erreur scan dossier ${currentFolderId}: ${errMsg} (continué)`,
            }).eq("id", jobId);
            selfChain(supabaseUrl, serviceKey, anonKey, jobId);
          } else {
            // Check if we have any files accumulated
            const existingFiles = (job.files_data as any[]) || [];
            if (existingFiles.length > 0) {
              await supabase.from("import_jobs").update({
                discovery_status: "done",
                discovery_queue: [],
                fichier_token: null,
              }).eq("id", jobId);
              selfChain(supabaseUrl, serviceKey, anonKey, jobId);
            } else {
              await supabase.from("import_jobs").update({
                status: "error",
                error: `Erreur récupération fichiers: ${errMsg}`,
                fichier_token: null,
              }).eq("id", jobId);
            }
          }
          return new Response(JSON.stringify({ error: errMsg }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // ========================================
    // PHASE 2: Process files batch by batch
    // ========================================
    // Re-fetch to get latest files_data if we just finished discovery
    if (files.length === 0) {
      const { data: freshJob } = await supabase.from("import_jobs").select("files_data, total_files, current_offset, processed_files, imported_count, dupes_count, errors_count").eq("id", jobId).single();
      if (freshJob) {
        files = (freshJob.files_data as any[]) || [];
      }
    }

    const offset = job.current_offset || 0;
    const batch = files.slice(offset, offset + BATCH_SIZE);

    if (batch.length === 0) {
      await supabase.from("import_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        processed_files: job.total_files || files.length,
      }).eq("id", jobId);
      return new Response(JSON.stringify({ status: "completed", processed: job.total_files }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let imported = 0;
    let dupes = 0;
    let errors = 0;

    const rows = batch.map((file: any) => ({
      user_id: job.user_id,
      source: file.source || job.source || "direct",
      title: file.title || file.filename || "Vidéo",
      original_url: file.url || file.original_url || `https://1fichier.com/?${file.filename}`,
      download_url: file.download_url || file.url || null,
      thumbnail_url: file.thumbnail_url || null,
      file_size: file.size || file.file_size || null,
      format: file.format || file.filename?.split(".").pop() || null,
      metadata: file.metadata || file,
      model_id: job.model_id || null,
    }));

    for (const row of rows) {
      let success = false;
      let titleSuffix = 0;
      const originalTitle = row.title;

      while (!success && titleSuffix < 5) {
        try {
          if (titleSuffix > 0) row.title = `${originalTitle} (${titleSuffix})`;

          const { data: result, error: insertErr } = await supabase
            .from("imported_videos")
            .upsert([row], { onConflict: "user_id,original_url", ignoreDuplicates: true })
            .select("id");

          if (insertErr) {
            if (insertErr.code === "23505" && insertErr.message?.includes("user_title")) {
              titleSuffix++;
              continue;
            }
            if (insertErr.code === "23505") { dupes++; success = true; }
            else { console.error("Insert error:", insertErr.code, insertErr.message); errors++; success = true; }
          } else {
            if (result && result.length > 0) imported++;
            else dupes++;
            success = true;
          }
        } catch (e) {
          console.error("Row exception:", e);
          errors++;
          success = true;
        }
      }
      if (!success) dupes++;
    }

    const newOffset = offset + batch.length;
    const newProcessed = (job.processed_files || 0) + batch.length;
    const newImported = (job.imported_count || 0) + imported;
    const newDupes = (job.dupes_count || 0) + dupes;
    const newErrors = (job.errors_count || 0) + errors;

    const isComplete = newOffset >= files.length;
    const finalStatus = isComplete
      ? newErrors > 0 && newImported === 0 ? "error" : "completed"
      : "processing";

    await supabase.from("import_jobs").update({
      current_offset: newOffset,
      processed_files: newProcessed,
      imported_count: newImported,
      dupes_count: newDupes,
      errors_count: newErrors,
      status: finalStatus,
      ...(isComplete ? { completed_at: new Date().toISOString() } : {}),
    }).eq("id", jobId);

    // Self-chain for next batch
    if (!isComplete) {
      selfChain(supabaseUrl, serviceKey, anonKey, jobId);
    }

    return new Response(
      JSON.stringify({
        status: finalStatus,
        processed: newProcessed,
        total: files.length,
        batch_imported: imported,
        batch_dupes: dupes,
        batch_errors: errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("process-import-batch error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
