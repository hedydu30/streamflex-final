import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Users, Film, Eye, DollarSign, Loader2, Star } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const AdminAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalUsers: 0, totalVideos: 0, totalViews: 0, premiumUsers: 0 });
  const [topVideos, setTopVideos] = useState<any[]>([]);
  const [newUsersChart, setNewUsersChart] = useState<any[]>([]);
  const [categoryChart, setCategoryChart] = useState<any[]>([]);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);

    const [profilesRes, videosRes, categoriesRes] = await Promise.all([
      supabase.from("profiles").select("user_id, is_premium, created_at"),
      supabase.from("imported_videos").select("id, title, view_count, average_rating, category_id") as any,
      supabase.from("categories").select("id, name"),
    ]);

    const profiles = profilesRes.data || [];
    const videos = videosRes.data || [];
    const categories = categoriesRes.data || [];

    // Stats cards
    const totalViews = videos.reduce((acc: number, v: any) => acc + (v.view_count || 0), 0);
    setStats({
      totalUsers: profiles.length,
      totalVideos: videos.length,
      totalViews,
      premiumUsers: profiles.filter((p: any) => p.is_premium).length,
    });

    // Top 10 videos by views
    const sorted = [...videos].sort((a: any, b: any) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 10);
    setTopVideos(sorted);

    // New users last 30 days
    const now = new Date();
    const days30: any[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const count = profiles.filter((p: any) => p.created_at?.startsWith(key)).length;
      days30.push({ date: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }), count });
    }
    setNewUsersChart(days30);

    // Videos per category
    const catMap: Record<string, number> = {};
    categories.forEach((c: any) => catMap[c.id] = 0);
    videos.forEach((v: any) => { if (v.category_id && catMap[v.category_id] !== undefined) catMap[v.category_id]++; });
    const catChart = categories.map((c: any) => ({ name: c.name, count: catMap[c.id] || 0 })).filter((c: any) => c.count > 0).sort((a: any, b: any) => b.count - a.count);
    setCategoryChart(catChart);

    setLoading(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <BarChart3 size={20} className="text-primary" /> Analytics
      </h2>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Utilisateurs", value: stats.totalUsers, icon: Users, color: "text-primary" },
          { label: "Total Vidéos", value: stats.totalVideos, icon: Film, color: "text-blue-500" },
          { label: "Total Vues", value: stats.totalViews.toLocaleString(), icon: Eye, color: "text-emerald-500" },
          { label: "Utilisateurs Premium", value: stats.premiumUsers, icon: DollarSign, color: "text-amber-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg bg-accent ${color}`}><Icon size={20} /></div>
            </div>
            <span className="text-3xl font-bold text-foreground">{value}</span>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Top 10 videos */}
      <section className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Top 10 Vidéos (vues)</h3>
        <div className="space-y-2">
          {topVideos.length === 0 ? <p className="text-muted-foreground text-sm">Aucune donnée.</p> :
            topVideos.map((v: any, i: number) => (
              <div key={v.id} className="flex items-center gap-3 text-sm py-1.5">
                <span className="w-6 text-muted-foreground text-xs font-medium">{i + 1}.</span>
                <span className="flex-1 text-foreground truncate">{v.title}</span>
                <span className="text-muted-foreground text-xs flex items-center gap-1"><Eye size={12} />{v.view_count || 0}</span>
                <span className="text-muted-foreground text-xs flex items-center gap-1"><Star size={12} />{v.average_rating || "—"}</span>
              </div>
            ))}
        </div>
      </section>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Nouveaux utilisateurs (30 jours)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={newUsersChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Vidéos par catégorie</h3>
          <div className="h-64">
            {categoryChart.length === 0 ? <p className="text-muted-foreground text-sm">Aucune catégorie.</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminAnalytics;
