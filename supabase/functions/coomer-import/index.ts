import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COOMER_API = "https://coomer.st/api/v1";
const PROXY_BASE_URL = "https://streamflex-proxy.hedydu30.workers.dev";

// --- TES IDENTIFIANTS FIXES ---
const MY_USER_ID = "62e6f5bb-57f5-47e7-a757-d5d5bd78da4f";
const MY_ADMIN_KEY = "streamflex_admin_secret_2024";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = url.searchParams.get("action") || body.action || "parse-url";

    // --- GESTION DE L'AUTHENTIFICATION ANTI-CRASH ---
    const authHeader = req.headers.get("Authorization");
    const xApiKey = req.headers.get("x-api-key");
    const isAdmin = (xApiKey === MY_ADMIN_KEY) || (action === "auto-sync");

    let user = null;
    if (authHeader && !isAdmin) {
      try {
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: authData } = await userClient.auth.getUser();
        user = authData?.user;
      } catch (e) {
        console.error("Erreur de token session", e);
      }
    }

    if (!user && !isAdmin) {
      return new Response(JSON.stringify({ error: "Non authentifié ou clé API invalide" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const activeUserId = user?.id || MY_USER_ID;

    const browserHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json"
    };

    switch (action) {
      case "auto-sync": {
        console.log("Démarrage de la synchronisation automatique...");
        const { data: models, error: modelsErr } = await supabase.from("models").select("*");
        if (modelsErr) throw modelsErr;
        if (!models || models.length === 0) {
          return new Response(JSON.stringify({ message: "Aucun modèle à synchroniser" }), { headers: corsHeaders });
        }

        let totalImported = 0;
        for (const model of models) {
          try {
            const service = model.source_platform || "onlyfans";
            let creatorId = model.name;
            if (model.profile_image_url) {
              const match = model.profile_image_url.match(/\/icons\/\w+\/([^/]+)/);
              if (match) creatorId = match[1];
            }

            const response = await fetch(`${COOMER_API}/${service}/user/${creatorId}?o=0`, { headers: browserHeaders });
            if (!response.ok) continue;
            
            const posts = await response.json();
            if (!posts || posts.length === 0) continue;

            const videos = posts.flatMap((p: any) => extractVideos(p, service, creatorId));
            if (videos.length === 0) continue;

            const rows = videos.map((v: any) => ({
              user_id: model.user_id,
              source: "coomer",
              title: v.title || "Vidéo",
              original_url: v.url,
              download_url: v.url,
              thumbnail_url: v.thumbnail_url || null,
              metadata: v.metadata || {},
              model_id: model.id,
            }));

            const { data: ins } = await supabase.from("imported_videos").upsert(rows, { onConflict: "user_id,original_url", ignoreDuplicates: true }).select("id");
            totalImported += ins?.length || 0;
            
            await new Promise(res => setTimeout(res, 500));
          } catch (err) {
            console.error(`Erreur sync modèle ${model.name}:`, err);
          }
        }
        return new Response(JSON.stringify({ success: true, imported_new_videos: totalImported }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "search-creators": {
        const query = (body.query || "").trim();
        if (!query) return new Response(JSON.stringify({ error: "query requis" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const services = ["onlyfans", "fansly", "patreon", "subscribestar", "fanbox"];
        const results: any[] = [];

        for (const svc of services) {
          try {
            const resp = await fetch(`https://coomer.st/api/v1/${svc}/user/${encodeURIComponent(query)}/profile`, { headers: browserHeaders });
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
          } catch (e: any) { console.error(e.message); }
        }
        return new Response(JSON.stringify({ results, total: results.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "import-creator": {
        const { service, creator_id, creator_name, skip_fetch } = body;
        if (!service || !creator_id) return new Response(JSON.stringify({ error: "service et creator_id requis" }), { status: 400, headers: corsHeaders });
        
        const modelName = creator_name || creator_id;
        const profilePicUrl = `https://img.coomer.st/icons/${service}/${creator_id}`;
        const coverUrl = `https://img.coomer.st/banners/${service}/${creator_id}`;

        let modelId: string | null = null;
        const { data: existingModel } = await supabase.from("models").select("id").eq("user_id", activeUserId).ilike("name", modelName).maybeSingle();

        if (existingModel) {
          modelId = existingModel.id;
          await supabase.from("models").update({ profile_image_url: profilePicUrl, source_platform: service }).eq("id", modelId);
        } else {
          const { data: created } = await supabase.from("models").insert({ user_id: activeUserId, name: modelName, source_platform: service, profile_image_url: profilePicUrl }).select("id").single();
          modelId = created?.id || null;
        }

        if (skip_fetch) {
          return new Response(JSON.stringify({ success: true, model_id: modelId, model_name: modelName, cover_url: coverUrl, profile_pic_url: profilePicUrl }), { headers: corsHeaders });
        }

        const allVideos: any[] = [];
        let offset = 0, hasMore = true, pages = 0;
        while (hasMore && pages < 200) {
          try {
            const r = await fetch(`https://coomer.st/api/v1/${service}/user/${creator_id}?o=${offset}`, { headers: browserHeaders });
            if (!r.ok) break;
            const posts = await r.json();
            if (!posts || posts.length === 0) { hasMore = false; break; }
            allVideos.push(...posts.flatMap((p: any) => extractVideos(p, service, creator_id)));
            offset += 50;
            pages++;
            if (posts.length < 50) hasMore = false;
          } catch { hasMore = false; }
        }

        const CHUNK = 500;
        let imported = 0, duplicates = 0, errors = 0;
        let lastError = null;
        for (let i = 0; i < allVideos.length; i += CHUNK) {
          const rows = allVideos.slice(i, i + CHUNK).map((v: any) => ({
            user_id: activeUserId, source: "coomer", title: v.title || "Vidéo", original_url: v.url, download_url: v.url,
            thumbnail_url: v.thumbnail_url || null, metadata: v.metadata || {}, model_id: modelId,
          }));
          
          const { data: ins, error: insErr } = await supabase.from("imported_videos").upsert(rows, { onConflict: "user_id,original_url", ignoreDuplicates: true }).select("id");
            
          if (insErr) { errors += rows.length; lastError = insErr; } 
          else { imported += ins?.length || 0; duplicates += rows.length - (ins?.length || 0); }
        }

        if (lastError && imported === 0) return new Response(JSON.stringify({ error: "DB_ERROR", details: lastError }), { status: 500, headers: corsHeaders });

        return new Response(JSON.stringify({ success: true, videos_found: allVideos.length, imported, duplicates, errors }), { headers: corsHeaders });
      }

      case "parse-profile": {
        const profileUrl = body.url;
        const modelNameOverride = body.model_name;
        if (!profileUrl) return new Response(JSON.stringify({ error: "URL requise" }), { status: 400, headers: corsHeaders });

        const match = profileUrl.match(/coomer\.(su|party|st)\/(\w+)\/user\/([^/?\s]+)/);
        if (!match) return new Response(JSON.stringify({ error: "URL invalide" }), { status: 400, headers: corsHeaders });

        const [, , service, userId] = match;
        const modelName = modelNameOverride || userId;
        const profilePicUrl = `https://img.coomer.st/icons/${service}/${userId}`;
        const bannerUrl = `https://img.coomer.st/banners/${service}/${userId}`;

        let modelId: string | null = null;
        const { data: existingModel } = await supabase.from("models").select("id").eq("user_id", activeUserId).ilike("name", modelName).maybeSingle();

        if (existingModel) { 
          modelId = existingModel.id; 
          await supabase.from("models").update({ profile_image_url: profilePicUrl, banner_url: bannerUrl }).eq("id", modelId);
        } 
        else {
          const { data: created } = await supabase.from("models").insert({ user_id: activeUserId, name: modelName, source_platform: service, profile_image_url: profilePicUrl, banner_url: bannerUrl }).select("id").single();
          modelId = created?.id || null;
        }

        const allVideos: any[] = [];
        let offset = 0;
        let hasMore = true;
        // CORRECTION DE L'ERREUR "Aucune vidéo" : on creuse beaucoup plus loin
        while (hasMore && offset < 1000) {
          try {
            const response = await fetch(`${COOMER_API}/${service}/user/${userId}?o=${offset}`, { headers: browserHeaders });
            if (!response.ok) break;
            const posts = await response.json();
            if (!posts || posts.length === 0) { hasMore = false; break; }
            allVideos.push(...posts.flatMap((p: any) => extractVideos(p, service, userId)));
            offset += 50;
            if (posts.length < 50) hasMore = false;
          } catch { hasMore = false; }
        }

        const CHUNK_SIZE = 500;
        let totalImported = 0, totalDupes = 0, totalErrors = 0;

        for (let i = 0; i < allVideos.length; i += CHUNK_SIZE) {
          const chunk = allVideos.slice(i, i + CHUNK_SIZE);
          const rows = chunk.map((v: any) => ({
            user_id: activeUserId, source: "coomer", title: v.title || "Vidéo", original_url: v.url, download_url: v.url,
            thumbnail_url: v.thumbnail_url || null, metadata: v.metadata || {}, model_id: modelId,
          }));

          const { data: imported, error: insertError } = await supabase.from("imported_videos").upsert(rows, { onConflict: "user_id,original_url", ignoreDuplicates: true }).select("id");

          if (insertError) { totalErrors += chunk.length; } 
          else { totalImported += imported?.length || 0; totalDupes += chunk.length - (imported?.length || 0); }
        }

        return new Response(JSON.stringify({ success: true, imported: totalImported, duplicates: totalDupes, errors: totalErrors }), { headers: corsHeaders });
      }

      case "parse-url": {
        const coomerUrl = body.url;
        if (!coomerUrl) return new Response(JSON.stringify({ error: "URL requise" }), { status: 400, headers: corsHeaders });

        const urls = coomerUrl.split(/[\n\r]+/).map((u: string) => u.trim()).filter(Boolean);
        const allVideos: any[] = [];

        for (const singleUrl of urls) {
          const parsed = parseCoomerUrl(singleUrl);
          if (parsed) { allVideos.push(...parsed.videos); continue; }

          const match = singleUrl.match(/coomer\.(su|party|st)\/(\w+)\/user\/([^/]+)(?:\/post\/([^/]+))?/);
          if (match) {
            const [, , service, userId, postId] = match;
            if (postId) {
              const response = await fetch(`${COOMER_API}/${service}/user/${userId}/post/${postId}`, { headers: browserHeaders });
              if (response.ok) { const post = await response.json(); allVideos.push(...extractVideos(post, service, userId)); }
            } else {
              // CORRECTION MASS IMPORT : On boucle aussi pour être sûr de trouver les vidéos
              let offset = 0, hasMore = true;
              while(hasMore && offset < 500) {
                 const response = await fetch(`${COOMER_API}/${service}/user/${userId}?o=${offset}`, { headers: browserHeaders });
                 if (!response.ok) break;
                 const posts = await response.json();
                 if (!posts || posts.length === 0) break;
                 allVideos.push(...posts.flatMap((p: any) => extractVideos(p, service, userId)));
                 offset += 50;
                 if (posts.length < 50) hasMore = false;
              }
            }
            continue;
          }

          if (singleUrl.match(/\.(mp4|m4v|webm|mkv|avi|mov)/i)) {
            const filename = singleUrl.split("/").pop()?.split("?")[0] || "Vidéo";
            allVideos.push({
              url: singleUrl.replace(/https:\/\/coomer\.(st|su|party)/, PROXY_BASE_URL),
              title: filename, thumbnail_url: null, model_name: null, metadata: { source: "direct_url", original_url: singleUrl },
            });
          }
        }
        return new Response(JSON.stringify({ videos: allVideos, total_urls: urls.length }), { headers: corsHeaders });
      }

      case "import-batch": {
        const { videos } = body;
        if (!videos || !Array.isArray(videos) || videos.length === 0) return new Response(JSON.stringify({ error: "Liste requise" }), { status: 400, headers: corsHeaders });

        const modelNames = [...new Set(videos.map((v: any) => v.model_name).filter(Boolean))] as string[];
        const modelIdMap = new Map<string, string>();

        if (modelNames.length > 0) {
          const { data: existingModels } = await supabase.from("models").select("id, name").eq("user_id", activeUserId).in("name", modelNames);
          for (const m of existingModels || []) modelIdMap.set(m.name.toLowerCase(), m.id);

          const missingNames = modelNames.filter((n) => !modelIdMap.has(n.toLowerCase()));
          if (missingNames.length > 0) {
            const newModels = await Promise.all(missingNames.map(async (name) => ({
                user_id: activeUserId, name, source_platform: "coomer", profile_image_url: `https://img.coomer.st/icons/onlyfans/${name}`,
            })));
            const { data: created } = await supabase.from("models").insert(newModels).select("id, name");
            for (const m of created || []) modelIdMap.set(m.name.toLowerCase(), m.id);
          }
        }

        const CHUNK_SIZE = 500;
        let totalImported = 0, totalDupes = 0, totalErrors = 0, lastDbError = null;

        for (let i = 0; i < videos.length; i += CHUNK_SIZE) {
          const chunk = videos.slice(i, i + CHUNK_SIZE);
          const rows = chunk.map((v: any) => ({
            user_id: activeUserId, source: v.source || "coomer", title: v.title || "Vidéo", original_url: v.url, download_url: v.url,
            thumbnail_url: v.thumbnail_url || null, metadata: v.metadata || {}, model_id: v.model_name ? modelIdMap.get(v.model_name.toLowerCase()) || null : null,
          }));

          const { data: imported, error: insertError } = await supabase.from("imported_videos").upsert(rows, { onConflict: "user_id,original_url", ignoreDuplicates: true }).select("id");

          if (insertError) { totalErrors += chunk.length; lastDbError = insertError; } 
          else { totalImported += imported?.length || 0; totalDupes += chunk.length - (imported?.length || 0); }
        }

        if (lastDbError && totalImported === 0) return new Response(JSON.stringify({ error: "DB_ERROR", details: lastDbError }), { status: 500, headers: corsHeaders });

        return new Response(JSON.stringify({ success: true, imported: totalImported, duplicates: totalDupes, errors: totalErrors }), { headers: corsHeaders });
      }

      case "import-video": {
        const { url: videoUrl, title, thumbnail_url, metadata, model_name } = body;
        if (!videoUrl) return new Response(JSON.stringify({ error: "URL requise" }), { status: 400, headers: corsHeaders });

        let model_id = null;
        if (model_name) {
          const { data: existing } = await supabase.from("models").select("id").eq("user_id", activeUserId).ilike("name", model_name).maybeSingle();
          if (existing) { model_id = existing.id; } 
          else {
            const { data: created } = await supabase.from("models").insert({ user_id: activeUserId, name: model_name, source_platform: "coomer", profile_image_url: `https://img.coomer.st/icons/onlyfans/${model_name}` }).select("id").single();
            model_id = created?.id || null;
          }
        }

        const { data: imported, error: insertError } = await supabase.from("imported_videos").upsert({
            user_id: activeUserId, source: "coomer", title: title || "Vidéo Coomer", original_url: videoUrl, download_url: videoUrl,
            thumbnail_url: thumbnail_url || null, metadata: metadata || {}, model_id,
        }, { onConflict: "user_id,original_url", ignoreDuplicates: true }).select().single();

        if (insertError) throw insertError;
        return new Response(JSON.stringify({ success: true, video: imported }), { headers: corsHeaders });
      }

      default:
        return new Response(JSON.stringify({ error: "Action inconnue" }), { status: 400, headers: corsHeaders });
    }
  } catch (error) {
    console.error("Erreur générale serveur:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});

function extractModelName(url: string): string | null {
  const profileMatch = url.match(/coomer\.(su|party|st)\/\w+\/user\/([^/]+)/);
  if (profileMatch) return profileMatch[2];
  return null;
}

function parseCoomerUrl(singleUrl: string): { videos: any[] } | null {
  const directMatch = singleUrl.match(/coomer\.\w+\/data\/.*\.(mp4|m4v|webm|mkv|avi|mov)/i);
  if (directMatch) {
    const filename = singleUrl.split("/").pop()?.split("?")[0] || "Vidéo";
    const fParam = (() => { try { return new URL(singleUrl).searchParams.get("f"); } catch { return null; } })();
    return {
      videos: [{
          url: singleUrl.replace(/https:\/\/coomer\.(st|su|party)/, PROXY_BASE_URL),
          title: fParam || filename, thumbnail_url: null, model_name: extractModelName(singleUrl), metadata: { source: "coomer_direct", original_url: singleUrl },
      }],
    };
  }
  return null;
}

function extractVideos(post: any, service: string, userId: string) {
  const videos: any[] = [];
  const createEntry = (file: any) => {
    if (file && isVideoFile(file.name || file.path)) {
      videos.push({
        url: `${PROXY_BASE_URL}${file.path}`,
        title: post.title || file.name || "Vidéo",
        thumbnail_url: file.path ? `${PROXY_BASE_URL}/thumbnail${file.path}` : null,
        model_name: userId,
        metadata: { service, user_id: userId, post_id: post.id, published: post.published },
      });
    }
  };
  if (post.file) createEntry(post.file);
  if (post.attachments) post.attachments.forEach((att: any) => createEntry(att));
  return videos;
}

function isVideoFile(filename: string): boolean {
  if (!filename) return false;
  const cleanName = filename.split('?')[0];
  const ext = cleanName.split(".").pop()?.toLowerCase();
  return ["mp4", "webm", "mkv", "avi", "mov", "m4v", "wmv", "flv"].includes(ext || "");
}
