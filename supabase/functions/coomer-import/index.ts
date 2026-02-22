import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COOMER_API = "https://coomer.st/api/v1";
const PROXY_BASE_URL = "https://streamflex-proxy.hedydu30.workers.dev";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "parse-url";
    const body = req.method === "POST" ? await req.json() : {};

    const browserHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json"
    };

    switch (action) {
      case "search-creators": {
        const query = (body.query || "").trim();
        if (!query) return new Response(JSON.stringify({ error: "query requis" }), { status: 400, headers: corsHeaders });

        const services = ["onlyfans", "fansly", "patreon", "subscribestar", "fanbox"];
        const results: any[] = [];

        for (const svc of services) {
          try {
            const resp = await fetch(`https://coomer.st/api/v1/${svc}/user/${encodeURIComponent(query)}/profile`, {
              headers: browserHeaders,
            });
            if (!resp.ok) continue;
            const profile = await resp.json();
            if (profile && (profile.id || profile.name)) {
              results.push({
                id: profile.id || query,
                name: profile.name || query,
                service: svc,
                profile_url: `https://coomer.st/${svc}/user/${query}`,
                profile_pic_url: `https://img.coomer.st/icons/${svc}/${query}`,
                cover_url: `https://img.coomer.st/banners/${svc}/${query}`,
              });
            }
          } catch (e: any) { console.log(e.message); }
        }

        return new Response(JSON.stringify({ results, total: results.length }), { headers: corsHeaders });
      }

      case "import-creator": {
        const { service, creator_id, creator_name, skip_fetch } = body;
        if (!service || !creator_id) return new Response("Params manquants", { status: 400 });

        const modelName = creator_name || creator_id;
        let modelId: string | null = null;
        const { data: existingModel } = await supabase.from("models").select("id").eq("user_id", user.id).ilike("name", modelName).maybeSingle();

        if (existingModel) {
          modelId = existingModel.id;
        } else {
          const { data: created } = await supabase.from("models").insert({ user_id: user.id, name: modelName, source_platform: service }).select("id").single();
          modelId = created?.id || null;
        }

        if (skip_fetch) return new Response(JSON.stringify({ success: true, model_id: modelId }), { headers: corsHeaders });

        const allVideos: any[] = [];
        let offset = 0, hasMore = true, pages = 0;
        while (hasMore && pages < 200) {
          try {
            const r = await fetch(`https://coomer.st/api/v1/${service}/user/${creator_id}?o=${offset}`, { headers: browserHeaders });
            if (!r.ok) break;
            const posts = await r.json();
            if (!posts || posts.length === 0) break;
            allVideos.push(...posts.flatMap((p: any) => extractVideos(p, service, creator_id)));
            offset += 50;
            pages++;
            if (posts.length < 50) hasMore = false;
          } catch { break; }
        }

        const CHUNK = 500;
        let importedCount = 0;
        for (let i = 0; i < allVideos.length; i += CHUNK) {
          const rows = allVideos.slice(i, i + CHUNK).map((v: any) => ({
            user_id: user.id,
            source: "coomer",
            title: v.title || "Vidéo",
            original_url: v.url,
            download_url: v.url,
            thumbnail_url: v.thumbnail_url || null,
            metadata: v.metadata || {},
            model_id: modelId,
          }));
          
          // ON RECOUVRE L'ERREUR ICI POUR TE L'AFFICHER
          const { data: ins, error: insErr } = await supabase
            .from("imported_videos")
            .upsert(rows, { onConflict: "user_id,original_url", ignoreDuplicates: true })
            .select("id");
            
          if (insErr) {
            // SI SUPABASE REFUSE, ON AFFICHE POURQUOI DIRECTEMENT :
            return new Response(JSON.stringify({ error: "DB_ERROR", details: insErr }), { status: 500, headers: corsHeaders });
          }
          
          importedCount += ins?.length || 0;
        }

        return new Response(JSON.stringify({ success: true, videos_found: allVideos.length, imported: importedCount }), { headers: corsHeaders });
      }

      // Les autres méthodes restent les mêmes pour ne rien casser
      case "parse-profile": {
        const profileUrl = body.url;
        const match = profileUrl.match(/coomer\.(su|party|st)\/(\w+)\/user\/([^/?\s]+)/);
        if (!match) return new Response("URL Invalide", { status: 400 });

        const [, , service, userId] = match;
        const allVideos: any[] = [];
        let offset = 0, hasMore = true;
        while (hasMore) {
          try {
            const response = await fetch(`${COOMER_API}/${service}/user/${userId}?o=${offset}`, { headers: browserHeaders });
            if (!response.ok) break;
            const posts = await response.json();
            if (!posts || posts.length === 0) break;
            allVideos.push(...posts.flatMap((p: any) => extractVideos(p, service, userId)));
            offset += 50;
            if (posts.length < 50) hasMore = false;
          } catch { break; }
        }

        const rows = allVideos.map((v: any) => ({
          user_id: user.id,
          source: "coomer",
          title: v.title || "Vidéo",
          original_url: v.url,
          download_url: v.url,
          metadata: v.metadata || {},
        }));

        const { data: ins, error: insErr } = await supabase.from("imported_videos").upsert(rows, { onConflict: "user_id,original_url", ignoreDuplicates: true }).select("id");
        if (insErr) {
           return new Response(JSON.stringify({ error: "DB_ERROR", details: insErr }), { status: 500, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ success: true, found: allVideos.length, imported: ins?.length || 0 }), { headers: corsHeaders });
      }

      case "parse-url": {
        const coomerUrl = body.url;
        if (!coomerUrl) return new Response("URL requise", { status: 400 });
        const urls = coomerUrl.split(/[\n\r]+/).map((u: string) => u.trim()).filter(Boolean);
        const allVideos: any[] = [];

        for (const singleUrl of urls) {
          const parsed = parseCoomerUrl(singleUrl);
          if (parsed) {
            allVideos.push(...parsed.videos);
            continue;
          }
          const match = singleUrl.match(/coomer\.(su|party|st)\/(\w+)\/user\/([^/]+)(?:\/post\/([^/]+))?/);
          if (match) {
            const [, , service, userId, postId] = match;
            const apiUrl = postId ? `${COOMER_API}/${service}/user/${userId}/post/${postId}` : `${COOMER_API}/${service}/user/${userId}?o=0`;
            try {
              const resp = await fetch(apiUrl, { headers: browserHeaders });
              if (resp.ok) {
                const data = await resp.json();
                const posts = Array.isArray(data) ? data : [data];
                allVideos.push(...posts.flatMap((p: any) => extractVideos(p, service, userId)));
              }
            } catch (e) { console.error(e); }
          }
        }
        return new Response(JSON.stringify({ videos: allVideos }), { headers: corsHeaders });
      }

      case "import-batch": {
        const { videos } = body;
        const rows = videos.map((v: any) => ({
          user_id: user.id,
          source: v.source || "coomer",
          title: v.title || "Vidéo",
          original_url: v.url,
          download_url: v.url,
          metadata: v.metadata || {}
        }));
        const { data: ins, error: insErr } = await supabase.from("imported_videos").upsert(rows, { onConflict: "user_id,original_url", ignoreDuplicates: true }).select("id");
        if (insErr) {
           return new Response(JSON.stringify({ error: "DB_ERROR", details: insErr }), { status: 500, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, imported: ins?.length || 0 }), { headers: corsHeaders });
      }

      case "import-video": {
        const { url: vUrl, title, model_id, metadata } = body;
        const { data, error: insErr } = await supabase.from("imported_videos").upsert({
          user_id: user.id,
          source: "coomer",
          title: title || "Vidéo",
          original_url: vUrl,
          download_url: vUrl,
          metadata: metadata || {},
          model_id,
        }, { onConflict: "user_id,original_url", ignoreDuplicates: true }).select().single();
        if (insErr) {
           return new Response(JSON.stringify({ error: "DB_ERROR", details: insErr }), { status: 500, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, video: data }), { headers: corsHeaders });
      }

      default:
        return new Response("Action inconnue", { status: 400 });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});

function parseCoomerUrl(singleUrl: string): { videos: any[] } | null {
  const directMatch = singleUrl.match(/coomer\.\w+\/data\/.*\.(mp4|m4v|webm|mkv|avi|mov)/i);
  if (directMatch) {
    const filename = singleUrl.split("/").pop()?.split("?")[0] || "Vidéo";
    return {
      videos: [{
        url: singleUrl.replace(/https:\/\/coomer\.(st|su|party)/, PROXY_BASE_URL),
        title: filename,
        metadata: { source: "coomer_direct", original_url: singleUrl },
      }],
    };
  }
  return null;
}

function extractVideos(post: any, service: string, userId: string) {
  const videos: any[] = [];
  const baseUrl = PROXY_BASE_URL;

  const createEntry = (file: any) => {
    if (file && isVideoFile(file.name || file.path)) {
      videos.push({
        url: `${baseUrl}${file.path}`,
        title: post.title || file.name || "Vidéo",
        thumbnail_url: file.path ? `${baseUrl}/thumbnail${file.path}` : null,
        metadata: { service, user_id: userId, post_id: post.id },
      });
    }
  };

  if (post.file) createEntry(post.file);
  if (post.attachments) post.attachments.forEach((att: any) => createEntry(att));

  return videos;
}

function isVideoFile(filename: string): boolean {
  if (!filename) return false;
  const ext = filename.split('?')[0].split(".").pop()?.toLowerCase();
  return ["mp4", "webm", "mkv", "avi", "mov", "m4v"].includes(ext || "");
}