import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Settings, Save, Globe, Film, CreditCard, Shield, Loader2, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

const AdminSettingsEnhanced = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings state
  const [general, setGeneral] = useState({ site_name: "StreamFlix", contact_email: "", timezone: "Europe/Paris" });
  const [video, setVideo] = useState({ default_quality: "auto", autoplay: true, allow_quality_change: true, default_volume: 80 });
  const [subscription, setSubscription] = useState({ gateway: "stripe", stripe_key: "", test_mode: true });
  const [security, setSecurity] = useState({ force_email_verification: true, multiple_sessions: true, max_login_attempts: 5 });
  const [plans, setPlans] = useState({
    free: { name: "Free", max_resolution: "HD", allow_downloads: false, show_ads: true },
    premium: { name: "Premium", monthly_price: 9.99, yearly_price: 99.99, max_resolution: "4K", allow_downloads: true, show_ads: false, trial_days: 7 },
  });

  // AllDebrid
  const [alldebridToken, setAlldebridToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<"unknown" | "valid" | "invalid">("unknown");

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from("site_settings").select("*");
    if (data) {
      data.forEach((s: any) => {
        if (s.key === "general") setGeneral(s.value);
        if (s.key === "video") setVideo(s.value);
        if (s.key === "subscription") setSubscription(s.value);
        if (s.key === "security") setSecurity(s.value);
        if (s.key === "plans") setPlans(s.value);
      });
    }
    // Load alldebrid token
    const { data: adData } = await supabase.from("admin_settings").select("value").eq("id", "alldebrid_token").maybeSingle();
    if (adData?.value) setAlldebridToken(adData.value);
    setLoading(false);
  };

  const saveSettings = async (key: string, value: any) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase.from("site_settings").upsert({ key, value, updated_by: user.id, updated_at: new Date().toISOString() });
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else toast({ title: "Paramètres sauvegardés" });
    setSaving(false);
  };

  const saveAlldebrid = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("admin_settings").upsert({ id: "alldebrid_token", value: alldebridToken.trim(), updated_by: user.id, updated_at: new Date().toISOString() });
    toast({ title: "Token AllDebrid sauvegardé" });
  };

  const testAlldebrid = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-alldebrid", { body: { token: alldebridToken } });
      if (!error && data?.status === "success") { setTokenStatus("valid"); toast({ title: "Token valide" }); }
      else { setTokenStatus("invalid"); toast({ title: "Token invalide", variant: "destructive" }); }
    } catch { setTokenStatus("invalid"); }
    setTesting(false);
  };

  const yearlyDiscount = plans.premium.monthly_price && plans.premium.yearly_price
    ? Math.round((1 - plans.premium.yearly_price / (plans.premium.monthly_price * 12)) * 100)
    : 0;

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Settings size={20} className="text-primary" /> Paramètres
      </h2>

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap">
          <TabsTrigger value="general" className="gap-1"><Globe size={14} /> Général</TabsTrigger>
          <TabsTrigger value="video" className="gap-1"><Film size={14} /> Vidéo</TabsTrigger>
          <TabsTrigger value="plans" className="gap-1"><CreditCard size={14} /> Abonnements</TabsTrigger>
          <TabsTrigger value="security" className="gap-1"><Shield size={14} /> Sécurité</TabsTrigger>
          <TabsTrigger value="alldebrid">AllDebrid</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="mt-4">
          <section className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div><Label>Nom du site</Label><Input value={general.site_name} onChange={e => setGeneral({ ...general, site_name: e.target.value })} /></div>
            <div><Label>Email contact</Label><Input type="email" value={general.contact_email} onChange={e => setGeneral({ ...general, contact_email: e.target.value })} /></div>
            <div>
              <Label>Timezone</Label>
              <Select value={general.timezone} onValueChange={v => setGeneral({ ...general, timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Europe/Paris", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "UTC"].map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => saveSettings("general", general)} disabled={saving}><Save size={14} className="mr-1" /> Sauvegarder</Button>
          </section>
        </TabsContent>

        {/* Video */}
        <TabsContent value="video" className="mt-4">
          <section className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div>
              <Label>Qualité par défaut</Label>
              <div className="flex gap-4 mt-1">
                {["SD", "HD", "auto"].map(q => (
                  <label key={q} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={video.default_quality === q} onChange={() => setVideo({ ...video, default_quality: q })} className="accent-primary" />
                    <span className="text-sm">{q.toUpperCase()}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={video.autoplay} onCheckedChange={v => setVideo({ ...video, autoplay: !!v })} /><span className="text-sm">Auto-play vidéos</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={video.allow_quality_change} onCheckedChange={v => setVideo({ ...video, allow_quality_change: !!v })} /><span className="text-sm">Autoriser changement qualité</span></label>
            <div>
              <Label>Volume par défaut : {video.default_volume}%</Label>
              <input type="range" min={0} max={100} value={video.default_volume} onChange={e => setVideo({ ...video, default_volume: parseInt(e.target.value) })} className="w-full accent-primary" />
            </div>
            <Button onClick={() => saveSettings("video", video)} disabled={saving}><Save size={14} className="mr-1" /> Sauvegarder</Button>
          </section>
        </TabsContent>

        {/* Plans */}
        <TabsContent value="plans" className="mt-4 space-y-4">
          <section className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Plan Free</h3>
            <div><Label>Nom</Label><Input value={plans.free.name} onChange={e => setPlans({ ...plans, free: { ...plans.free, name: e.target.value } })} /></div>
            <div>
              <Label>Résolution max</Label>
              <Select value={plans.free.max_resolution} onValueChange={v => setPlans({ ...plans, free: { ...plans.free, max_resolution: v } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["SD", "HD", "Full HD", "4K"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={plans.free.allow_downloads} onCheckedChange={v => setPlans({ ...plans, free: { ...plans.free, allow_downloads: !!v } })} /><span className="text-sm">Autoriser téléchargements</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={plans.free.show_ads} onCheckedChange={v => setPlans({ ...plans, free: { ...plans.free, show_ads: !!v } })} /><span className="text-sm">Afficher publicités</span></label>
          </section>

          <section className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Plan Premium</h3>
            <div><Label>Nom</Label><Input value={plans.premium.name} onChange={e => setPlans({ ...plans, premium: { ...plans.premium, name: e.target.value } })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Prix mensuel ($)</Label><Input type="number" step="0.01" value={plans.premium.monthly_price} onChange={e => setPlans({ ...plans, premium: { ...plans.premium, monthly_price: parseFloat(e.target.value) || 0 } })} /></div>
              <div>
                <Label>Prix annuel ($) {yearlyDiscount > 0 && <span className="text-emerald-500">(-{yearlyDiscount}%)</span>}</Label>
                <Input type="number" step="0.01" value={plans.premium.yearly_price} onChange={e => setPlans({ ...plans, premium: { ...plans.premium, yearly_price: parseFloat(e.target.value) || 0 } })} />
              </div>
            </div>
            <div>
              <Label>Résolution max</Label>
              <Select value={plans.premium.max_resolution} onValueChange={v => setPlans({ ...plans, premium: { ...plans.premium, max_resolution: v } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["SD", "HD", "Full HD", "4K"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={plans.premium.allow_downloads} onCheckedChange={v => setPlans({ ...plans, premium: { ...plans.premium, allow_downloads: !!v } })} /><span className="text-sm">Autoriser téléchargements</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={plans.premium.show_ads} onCheckedChange={v => setPlans({ ...plans, premium: { ...plans.premium, show_ads: !!v } })} /><span className="text-sm">Afficher publicités</span></label>
            <div><Label>Essai gratuit (jours)</Label><Input type="number" value={plans.premium.trial_days} onChange={e => setPlans({ ...plans, premium: { ...plans.premium, trial_days: parseInt(e.target.value) || 0 } })} /></div>
          </section>

          <section className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Gateway paiement</h3>
            <div className="flex gap-4">
              {["stripe", "paypal"].map(g => (
                <label key={g} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={subscription.gateway === g} onChange={() => setSubscription({ ...subscription, gateway: g })} className="accent-primary" />
                  <span className="text-sm capitalize">{g}</span>
                </label>
              ))}
            </div>
            <div><Label>Clé API Stripe</Label><Input type="password" value={subscription.stripe_key} onChange={e => setSubscription({ ...subscription, stripe_key: e.target.value })} placeholder="sk_..." /></div>
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={subscription.test_mode} onCheckedChange={v => setSubscription({ ...subscription, test_mode: !!v })} /><span className="text-sm">Mode test</span></label>
          </section>

          <Button onClick={() => { saveSettings("plans", plans); saveSettings("subscription", subscription); }} disabled={saving}><Save size={14} className="mr-1" /> Sauvegarder tout</Button>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="mt-4">
          <section className="bg-card border border-border rounded-lg p-6 space-y-4">
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={security.force_email_verification} onCheckedChange={v => setSecurity({ ...security, force_email_verification: !!v })} /><span className="text-sm">Forcer vérification email</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={security.multiple_sessions} onCheckedChange={v => setSecurity({ ...security, multiple_sessions: !!v })} /><span className="text-sm">Sessions multiples autorisées</span></label>
            <div><Label>Limite tentatives connexion</Label><Input type="number" min={1} max={20} value={security.max_login_attempts} onChange={e => setSecurity({ ...security, max_login_attempts: parseInt(e.target.value) || 5 })} className="w-32" /></div>
            <Button onClick={() => saveSettings("security", security)} disabled={saving}><Save size={14} className="mr-1" /> Sauvegarder</Button>
          </section>
        </TabsContent>

        {/* AllDebrid */}
        <TabsContent value="alldebrid" className="mt-4">
          <section className="bg-card border border-border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-foreground">AllDebrid - Débrideur de liens</h3>
            <p className="text-sm text-muted-foreground">Les liens 1fichier seront débridés via AllDebrid.</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input type={showToken ? "text" : "password"} value={alldebridToken} onChange={e => { setAlldebridToken(e.target.value); setTokenStatus("unknown"); }} placeholder="Token API..." className="pr-10" />
                <button onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showToken ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
              <Button onClick={saveAlldebrid} disabled={!alldebridToken.trim()}><Save size={14} className="mr-1" /> Sauver</Button>
              <Button variant="outline" onClick={testAlldebrid} disabled={testing || !alldebridToken.trim()}>
                {testing ? <Loader2 size={14} className="animate-spin" /> : tokenStatus === "valid" ? <CheckCircle size={14} className="text-emerald-500" /> : tokenStatus === "invalid" ? <XCircle size={14} className="text-destructive" /> : null}
                <span className="ml-1">Tester</span>
              </Button>
            </div>
            {tokenStatus === "valid" && <p className="text-sm text-emerald-500 flex items-center gap-1"><CheckCircle size={14} /> Token valide</p>}
            {tokenStatus === "invalid" && <p className="text-sm text-destructive flex items-center gap-1"><XCircle size={14} /> Token invalide</p>}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSettingsEnhanced;
