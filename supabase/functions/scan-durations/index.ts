import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- CONFIGURATION TURBO ---
const BATCH_SIZE = 150;        // On traite 150 vidéos par passage
const CONCURRENCY_LIMIT = 50;  // 50 scans en simultané pour les liens directs
const CONCURRENCY_FICHIER = 5; // Un peu plus rapide pour 1fichier
const FICHIER_DELAY_MS = 1200; // Délai réduit entre les requêtes Alldebrid
const ALLDEBRID_API = "https://api.alldebrid.com/v4";

// Parse MP4 mvhd atom to extract duration
function parseMp4Duration(buffer: ArrayBuffer): number | null {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  for (let i = 0; i < bytes.length - 32; i++) {
    if (bytes[i] === 0x6d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x68 && bytes[i + 3] === 0x64) {
      const version = bytes[i + 4];
      let timescale: number, duration: number;
      if (version === 0) {
        timescale = view.getUint32(i + 16);
        duration = view.getUint32(i + 20);
      } else {
        timescale = view.getUint32(i + 24);
        duration = Number(view.getBigUint64(i + 28));
      }
      if (timescale > 0) return Math.floor(duration / timescale);
    }
  }
  return null;
}

async function fetchVideoDuration(url: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

    const resp = await fetch(url, {
      headers: { Range: "bytes=0-150000" }, // On prend un peu plus de buffer pour être sûr
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    if (!resp.ok && resp.status !== 206) return null;
    const buffer = await resp.arrayBuffer();
    return parseMp4Duration(buffer);
  } catch {
    return null;
  }
}

// Fonction utilitaire pour gérer un pool de promesses (concurrence réelle)
async function pool(items: any[], concurrency: number, task: (item: any) => Promise<void>) {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = task(item).then(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const alldebridKey = Deno.env.get("ALLDEBRID_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    const { job_id } = await req.json();
    if (!job_id) return new Response("job_id requis", { status: 400 });

    const { data: job } = await supabase.from("duration_scan_jobs").select("*").eq("id", job_id).single();
    if (!job || job.status === "completed") return new Response("Job non trouvé ou fini");

    // On récupère les vidéos qui n'ont pas encore de durée
    const { data: videos } = await supabase
      .from("imported_videos")
      .select("id, download_url, source")
      .is("duration_seconds", null)
      .limit(BATCH_SIZE);

    if (!videos || videos.length === 0) {
      await supabase.from("duration_scan_jobs").update({ status: "completed" }).eq("id", job_id);
      return new Response(JSON.stringify({ status: "completed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let scannedCount = 0;
    let foundCount = 0;
    let errorsCount = 0;

    const directVideos = videos.filter(v => v.source !== '1fichier');
    const fichierVideos = videos.filter(v => v.source === '1fichier');

    // --- TRAITEMENT DES VIDÉOS DIRECTES (TURBO) ---
    await pool(directVideos, CONCURRENCY_LIMIT, async (v) => {
      const dur = await fetchVideoDuration(v.download_url);
      if (dur) {
        await supabase.from("imported_videos").update({ duration_seconds: dur }).eq("id", v.id);
        foundCount++;
      } else {
        errorsCount++;
      }
      scannedCount++;
    });

    // --- TRAITEMENT 1FICHIER (PLUS PRUDENT) ---
    if (fichierVideos.length > 0 && alldebridKey) {
      for (let i = 0; i < fichierVideos.length; i += CONCURRENCY_FICHIER) {
        const chunk = fichierVideos.slice(i, i + CONCURRENCY_FICHIER);
        await Promise.all(chunk.map(async (v) => {
          try {
            const debridResp = await fetch(`${ALLDEBRID_API}/link/unlock?agent=streamflex&apikey=${alldebridKey}&link=${encodeURIComponent(v.download_url)}`);
            const debridData = await debridResp.json();
            if (debridData.status === "success") {
              const dur = await fetchVideoDuration(debridData.data.link);
              if (dur) {
                await supabase.from("imported_videos").update({ duration_seconds: dur }).eq("id", v.id);
                foundCount++;
              } else {
                errorsCount++;
              }
            } else {
              errorsCount++;
            }
          } catch {
            errorsCount++;
          }
          scannedCount++;
        }));
        await new Promise(r => setTimeout(r, FICHIER_DELAY_MS));
      }
    }

    // Mise à jour du job
    const newScanned = (job.scanned_count || 0) + scannedCount;
    const newFound = (job.found_count || 0) + foundCount;
    const newErrors = (job.errors_count || 0) + errorsCount;
    const { data: totalRemaining } = await supabase.from("imported_videos").select('id', { count: 'exact', head: true }).is("duration_seconds", null);
    const remaining = totalRemaining?.length || 0;

    await supabase.from("duration_scan_jobs").update({
      scanned_count: newScanned,
      found_count: newFound,
      errors_count: newErrors,
      status: remaining <= 0 ? "completed" : "processing",
    }).eq("id", job_id);

    // Auto-relance pour le lot suivant
    if (remaining > 0) {
      fetch(`${supabaseUrl}/functions/v1/scan-durations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ job_id }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ batch_scanned: scannedCount, remaining }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
