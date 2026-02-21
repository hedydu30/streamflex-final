import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONE_FICHIER_API = "https://api.1fichier.com/v1";
const VIDEO_EXTS = ["mp4", "webm", "mkv", "avi", "mov", "m4v"];
const RATE_LIMIT_MS = 8000;
const MAX_RETRIES = 5;

const isVideoFile = (filename: string | undefined): boolean => {
  if (!filename) return false;
  const ext = filename.split(".").pop()?.toLowerCase();
  return VIDEO_EXTS.includes(ext || "");
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// Fetch with retry + exponential backoff for flood protection
const fetchWithRetry = async (url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) return response;

    const body = await response.text();
    const isFlood = body.includes("Flood") || body.includes("IP Locked");

    if (isFlood && attempt < retries) {
      const backoff = RATE_LIMIT_MS * Math.pow(2, attempt); // 5s, 10s, 20s
      console.warn(`Flood detected, retry ${attempt + 1}/${retries} in ${backoff}ms`);
      await delay(backoff);
      continue;
    }

    throw new Error(`1fichier API error [${response.status}]: ${body}`);
  }
  throw new Error("Max retries exceeded");
};

// Paginate through all files in a single folder
const fetchAllFilesInFolder = async (token: string, folderId: number, videoOnly = false): Promise<any[]> => {
  const allItems: any[] = [];
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    const reqBody: any = { folder_id: folderId };
    if (offset > 0) reqBody.offset = offset;

    const response = await fetchWithRetry(`${ONE_FICHIER_API}/file/ls.cgi`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    });
    const data = await response.json();

    const items = data?.items || [];
    if (videoOnly) {
      allItems.push(...items.filter((f: any) => isVideoFile(f.filename)));
    } else {
      allItems.push(...items);
    }

    if (items.length >= 5000) {
      offset += items.length;
      await delay(RATE_LIMIT_MS);
    } else {
      hasMore = false;
    }
  }

  return allItems;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const body = req.method === "POST" ? await req.json() : {};

    const token = body._token || Deno.env.get("ONE_FICHIER_TOKEN");
    delete body._token;

    if (!token) {
      return new Response(JSON.stringify({ error: "Token 1fichier non configuré." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (action) {
      case "account-info": {
        const response = await fetchWithRetry(`${ONE_FICHIER_API}/user/info.cgi`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await response.json();
        if (!response.ok || data?.status === "KO") {
          return new Response(JSON.stringify({ valid: false, error: data?.message || "Token invalide" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ valid: true, ...data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list-files": {
        const folderId = body.folder_id || 0;
        // Return ALL files with pagination (video filtering done client-side for display)
        const allItems = await fetchAllFilesInFolder(token, folderId, false);
        return new Response(JSON.stringify({ items: allItems, total: allItems.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list-all-recursive": {
        // Recursively list ONLY VIDEO files in a folder and sub-folders
        // This is used for import — filter server-side to avoid sending non-video data
        const rootFolderId = body.folder_id || 0;
        const allVideoFiles: any[] = [];
        const queue = [rootFolderId];

        while (queue.length > 0) {
          const currentId = queue.shift()!;

          // Fetch video files only (with pagination)
          const videoFiles = await fetchAllFilesInFolder(token, currentId, true);

          // Only keep essential fields to minimize payload size
          for (const f of videoFiles) {
            allVideoFiles.push({
              filename: f.filename,
              url: f.url,
              size: f.size,
              date: f.date,
            });
          }

          // Fetch sub-folders
          await delay(RATE_LIMIT_MS);
          const sRes = await fetchWithRetry(`${ONE_FICHIER_API}/folder/ls.cgi`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ folder_id: currentId }),
          });
          const sData = await sRes.json();
          const subFolders = sData?.sub_folders || [];
          for (const sf of subFolders) {
            queue.push(sf.id);
          }

          if (queue.length > 0) {
            await delay(RATE_LIMIT_MS);
          }
        }

        return new Response(JSON.stringify({ items: allVideoFiles, total: allVideoFiles.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list-folders": {
        const folderId = body.folder_id || 0;
        const response = await fetchWithRetry(`${ONE_FICHIER_API}/folder/ls.cgi`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ folder_id: folderId }),
        });
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "folder-counts": {
        // Get TOTAL video file counts for folders — with pagination to go beyond 5000
        const folderIds: number[] = body.folder_ids || [];
        const counts: Record<number, number> = {};

        for (const fid of folderIds) {
          try {
            const videoFiles = await fetchAllFilesInFolder(token, fid, true);
            counts[fid] = videoFiles.length;
          } catch {
            counts[fid] = -1;
          }
          // Rate limiting between folders
          if (folderIds.indexOf(fid) < folderIds.length - 1) {
            await delay(RATE_LIMIT_MS);
          }
        }

        return new Response(JSON.stringify({ counts }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "folder-count-recursive": {
        // Recursively count ALL video files in a single folder and its sub-folders
        const folderId = body.folder_id || 0;
        let totalCount = 0;
        const queue = [folderId];

        while (queue.length > 0) {
          const currentId = queue.shift()!;

          try {
            const videoFiles = await fetchAllFilesInFolder(token, currentId, true);
            totalCount += videoFiles.length;
          } catch (e) {
            console.error(`Error counting folder ${currentId}:`, e);
          }

          // Fetch sub-folders
          await delay(RATE_LIMIT_MS);
          try {
            const sRes = await fetchWithRetry(`${ONE_FICHIER_API}/folder/ls.cgi`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ folder_id: currentId }),
            });
            const sData = await sRes.json();
            const subFolders = sData?.sub_folders || [];
            for (const sf of subFolders) {
              queue.push(sf.id);
            }
          } catch (e) {
            console.error(`Error listing sub-folders for ${currentId}:`, e);
          }

          if (queue.length > 0) {
            await delay(RATE_LIMIT_MS);
          }
        }

        return new Response(JSON.stringify({ folder_id: folderId, count: totalCount }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-download-link": {
        const fileUrl = body.url;
        if (!fileUrl) {
          return new Response(JSON.stringify({ error: "URL du fichier requise" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const response = await fetchWithRetry(`${ONE_FICHIER_API}/download/get_token.cgi`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: fileUrl, pretty: 1 }),
        });
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "import-video": {
        const { url: videoUrl, title, file_size, format } = body;
        if (!videoUrl) {
          return new Response(JSON.stringify({ error: "URL requise" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const dlResponse = await fetchWithRetry(`${ONE_FICHIER_API}/download/get_token.cgi`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: videoUrl, pretty: 1 }),
        });
        const dlData = await dlResponse.json();
        const { data: imported, error: insertError } = await supabase
          .from("imported_videos")
          .insert({
            user_id: user.id,
            source: "1fichier",
            title: title || "Vidéo 1fichier",
            original_url: videoUrl,
            download_url: dlData.url || null,
            file_size: file_size || null,
            format: format || null,
            metadata: { one_fichier_response: dlData },
          })
          .select()
          .single();
        if (insertError) throw insertError;
        return new Response(JSON.stringify({ success: true, video: imported }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Action inconnue" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("one-fichier error:", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
