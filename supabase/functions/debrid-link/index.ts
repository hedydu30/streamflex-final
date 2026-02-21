import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLDEBRID_API = "https://api.alldebrid.com/v4";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
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
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { link } = await req.json();
    if (!link) {
      return new Response(JSON.stringify({ error: "Lien requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get AllDebrid token from admin_settings
    const { data: setting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("id", "alldebrid_token")
      .single();

    if (!setting?.value) {
      return new Response(JSON.stringify({ error: "Token AllDebrid non configuré. Configurez-le dans le panel admin." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = setting.value;

    // Call AllDebrid unlock API
    const params = new URLSearchParams({
      agent: "StreamApp",
      apikey: token,
      link: link,
    });

    const response = await fetch(`${ALLDEBRID_API}/link/unlock?${params.toString()}`, {
      method: "GET",
    });

    const data = await response.json();

    if (data.status !== "success") {
      const errMsg = data.error?.message || data.error?.code || "Erreur AllDebrid inconnue";
      console.error("AllDebrid error:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      url: data.data.link,
      filename: data.data.filename,
      filesize: data.data.filesize,
      host: data.data.host,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("debrid-link error:", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
