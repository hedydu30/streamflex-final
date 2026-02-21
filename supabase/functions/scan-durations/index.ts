import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 50; // videos per invocation
const CONCURRENCY_DIRECT = 20;
const CONCURRENCY_FICHIER = 4;
const FICHIER_DELAY_MS = 1600;
const ALLDEBRID_API = "https://api.alldebrid.com/v4";

// Parse MP4 mvhd atom to extract duration in seconds
function parseMp4Duration(buffer: ArrayBuffer): number | null {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Search for 'mvhd' atom (0x6D766864)
  for (let i = 0; i < bytes.length - 32; i++) {
    if (bytes[i] === 0x6d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x68 && bytes[i + 3] === 0x64) {
      const version = bytes[i + 4];
      let timescale: number, duration: number;

      if (version === 0) {
        timescale = view.getUint32(i + 16);
        duration = view.getUint32(i + 20);
      } else {
        // Version 1: 64-bit, use lower 32 bits (sufficient for most videos)
        timescale = view.getUint32(i + 24);
        duration = Number(view.getBigUint64(i + 28));
      }

      if (timescale > 0 && duration > 0) {
        return Math.round(duration / timescale);
      }
    }
  }
  return null;
}

// Proxy coomer.st URLs via Cloudflare Worker (Supabase can't reach coomer.st directly)
const COOMER_PROXY = "https://still-disk-5cf6streamflex.hatem44655f.workers.dev";
function resolveUrl(url: string): string {
  if (url.includes("coomer.st") || url.includes("coomer.su")) {
    const path = url.replace(/https?:\/\/[^/]+/, "");
    return `${COOMER_PROXY}${path}`;
  }
  return url;
}

// Get duration from a video URL via range requests on MP4 header
async function getVideoDuration(url: string): Promise<number | null> {
  url = resolveUrl(url);
  try {
    // Try first 2MB (moov atom at start = faststart)
    const resp = await fetch(url, {
      headers: { Range: "bytes=0-2097151" },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok && resp.status !== 206) return null;

    const buffer = await resp.arrayBuffer();
    const dur = parseMp4Duration(buffer);
    if (dur && dur > 0) return dur;

    // moov might be at the end; try last 2MB
    const rangeHeader = resp.headers.get("content-range");
    const contentLength = rangeHeader ? parseInt(rangeHeader.split("/")[1] || "0") : 0;

    if (contentLength > 2097152) {
      const start = contentLength - 2097152;
      const endResp = await fetch(url, {
        headers: { Range: `bytes=${start}-${contentLength - 1}` },
        signal: AbortSignal.timeout(15000),
      });
      if (endResp.ok || endResp.status === 206) {
        const endBuffer = await endResp.arrayBuffer();
        return parseMp4Duration(endBuffer);
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Resolve a 1fichier link via AllDebrid
async function resolveDebrid(link: string, token: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      agent: "StreamApp",
      apikey: token,
      link,
    });
    const resp = await fetch(`${ALLDEBRID_API}/link/unlock?${params}`, {
      signal: AbortSignal.timeout(20000),
    });
    const data = await resp.json();
    if (data.status === "success" && data.data?.link) {
      return data.data.link;
    }
    return null;
  } catch {
    return null;
  }
}

// Pool runner: process items with limited concurrency
async function runPool<T>(items: T[], concurrency: number, handler: (item: T) => Promise<void>, delayMs = 0) {
  let idx = 0;
  const worker = async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      if (delayMs > 0 && i > 0) await new Promise((r) => setTimeout(r, delayMs));
      await handler(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load job
    const { data: job, error: jobErr } = await supabase
      .from("duration_scan_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.status === "cancelled" || job.status === "completed") {
      return new Response(JSON.stringify({ status: job.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to processing
    await supabase.from("duration_scan_jobs").update({ status: "processing" }).eq("id", job_id);

    // Get AllDebrid token
    const { data: setting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("id", "alldebrid_token")
      .single();
    const debridToken = setting?.value || null;

    // Get videos without duration for this user
    const { data: videos, error: vErr } = await supabase
      .from("imported_videos")
      .select("id, original_url, download_url, source")
      .eq("user_id", job.user_id)
      .is("duration_seconds", null)
      .order("imported_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (vErr || !videos || videos.length === 0) {
      // No more videos to scan - completed
      await supabase
        .from("duration_scan_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job_id);

      return new Response(JSON.stringify({ status: "completed", remaining: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Count total remaining for progress
    const { count: totalRemaining } = await supabase
      .from("imported_videos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", job.user_id)
      .is("duration_seconds", null);

    // Update total on first run
    if (job.scanned_count === 0) {
      await supabase
        .from("duration_scan_jobs")
        .update({ total_videos: totalRemaining || videos.length })
        .eq("id", job_id);
    }

    let foundCount = 0;
    let errorsCount = 0;
    let scannedCount = 0;

    // Separate direct vs fichier videos
    const directVideos = videos.filter((v: any) => {
      const url = v.download_url || v.original_url || "";
      return !url.includes("1fichier");
    });
    const fichierVideos = videos.filter((v: any) => {
      const url = v.download_url || v.original_url || "";
      return url.includes("1fichier");
    });

    const processVideo = async (video: any, isFichier: boolean) => {
      // Check if job was cancelled
      const { data: freshJob } = await supabase.from("duration_scan_jobs").select("status").eq("id", job_id).single();
      if (freshJob?.status === "cancelled") return;

      let url = video.download_url || video.original_url;
      if (!url) {
        errorsCount++;
        scannedCount++;
        return;
      }

      // Resolve debrid for 1fichier
      if (isFichier && debridToken) {
        const resolved = await resolveDebrid(url, debridToken);
        if (!resolved) {
          errorsCount++;
          scannedCount++;
          return;
        }
        url = resolved;
      }

      const duration = await getVideoDuration(url);
      scannedCount++;

      if (duration && duration > 0) {
        foundCount++;
        await supabase.from("imported_videos").update({ duration_seconds: duration }).eq("id", video.id);
      }

      // Update progress periodically (every 5 videos)
      if (scannedCount % 5 === 0) {
        await supabase
          .from("duration_scan_jobs")
          .update({
            scanned_count: job.scanned_count + scannedCount,
            found_count: job.found_count + foundCount,
            errors_count: job.errors_count + errorsCount,
            current_video_id: video.id,
          })
          .eq("id", job_id);
      }
    };

    // Process both types concurrently
    await Promise.all([
      runPool(directVideos, CONCURRENCY_DIRECT, (v) => processVideo(v, false)),
      runPool(fichierVideos, CONCURRENCY_FICHIER, (v) => processVideo(v, true), FICHIER_DELAY_MS),
    ]);

    // Final progress update for this batch
    const newScanned = job.scanned_count + scannedCount;
    const newFound = job.found_count + foundCount;
    const newErrors = job.errors_count + errorsCount;
    const remaining = (totalRemaining || 0) - scannedCount;

    if (remaining <= 0) {
      await supabase
        .from("duration_scan_jobs")
        .update({
          status: "completed",
          scanned_count: newScanned,
          found_count: newFound,
          errors_count: newErrors,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job_id);
    } else {
      await supabase
        .from("duration_scan_jobs")
        .update({
          scanned_count: newScanned,
          found_count: newFound,
          errors_count: newErrors,
          status: "processing",
        })
        .eq("id", job_id);

      // Self-invoke for next batch (fire-and-forget)
      try {
        const funcUrl = `${supabaseUrl}/functions/v1/scan-durations`;
        fetch(funcUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ job_id }),
        }).catch(() => {});
      } catch {
        // If self-invoke fails, mark as paused so user can resume
        await supabase
          .from("duration_scan_jobs")
          .update({ status: "paused", error: "Auto-continuation échouée, relancez manuellement" })
          .eq("id", job_id);
      }
    }

    return new Response(
      JSON.stringify({
        status: remaining <= 0 ? "completed" : "processing",
        batch_scanned: scannedCount,
        batch_found: foundCount,
        remaining,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("scan-durations error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erreur interne" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
