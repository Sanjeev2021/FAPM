import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Upload,
  Bot,
  ArrowLeft,
  Settings as SettingsIcon,
  Building2,
  KeyRound,
  Users,
  Trash2,
  Copy,
  Check,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { useUserRules, useOrgRules } from "@/hooks/useRules";
import { RulesEditor } from "@/components/rules/RulesEditor";

// ─── Types ──────────────────────────────────────────────────────────

interface Profile {
  full_name: string | null;
  company: string | null;
  company_logo: string | null;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { email: string; full_name: string | null };
}

type Tab = "settings" | "organization";

// ─── Side Tabs ──────────────────────────────────────────────────────

function SideTabs({
  active,
  onChange,
  showOrg,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
  showOrg: boolean;
}) {
  const tabs: { id: Tab; label: string; icon: typeof SettingsIcon }[] = [
    { id: "settings", label: "Paramètres", icon: SettingsIcon },
  ];
  if (showOrg) {
    tabs.push({ id: "organization", label: "Organisation", icon: Building2 });
  }

  return (
    <nav className="flex flex-col gap-1 w-full">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-light transition-colors text-left ${
              isActive
                ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-normal"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Profile Tab Content ────────────────────────────────────────────

function ProfileTab() {
  const { user, signOut } = useAuth();
  const { isSuperAdmin } = useOrg();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const {
    data: userRules,
    isLoading: rulesLoading,
    create: createRule,
    update: updateRule,
    remove: removeRule,
  } = useUserRules();

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, company, company_logo")
      .eq("id", user.id)
      .maybeSingle();
    if (error) console.error("Error fetching profile:", error);
    else setProfile(data);
    setLoading(false);
  };

  const handleLogout = async () => {
    await signOut();
    toast({ title: "Déconnexion réussie", description: "À bientôt sur FLAIX" });
    navigate("/");
  };

  if (loading) return null;

  return (
    <div className="space-y-8">
      {/* Identity & Branding — super admin only */}
      {isSuperAdmin && <Card className="border border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-light tracking-tight text-gray-900 dark:text-gray-100">
            Identité & Branding
          </CardTitle>
          <CardDescription className="text-sm font-light">
            Personnalisez votre profil et votre identité visuelle
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label className="text-sm font-light text-gray-700 dark:text-gray-300">
              Logo de l'entreprise
            </Label>
            <div className="flex items-center gap-4 mt-2">
              <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center hover:border-[#7C8CF8] transition-colors cursor-pointer">
                <Upload className="h-4 w-4 text-gray-400" strokeWidth={1.5} />
              </div>
              <p className="text-xs font-light text-gray-500">PNG ou SVG, max 2MB</p>
            </div>
          </div>

          <div>
            <Label htmlFor="company" className="text-sm font-light text-gray-700 dark:text-gray-300">
              Nom de la régie / entreprise
            </Label>
            <Input id="company" placeholder="Ex: FLAIX Media Agency" className="mt-1.5 font-light" defaultValue={profile?.company || ""} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contact" className="text-sm font-light text-gray-700 dark:text-gray-300">Contact principal</Label>
              <Input id="contact" placeholder="Nom du contact" className="mt-1.5 font-light" defaultValue={profile?.full_name || ""} />
            </div>
            <div>
              <Label htmlFor="email" className="text-sm font-light text-gray-700 dark:text-gray-300">Email</Label>
              <Input id="email" type="email" className="mt-1.5 font-light bg-gray-50 dark:bg-gray-800/50" defaultValue={user?.email || ""} readOnly />
            </div>
          </div>

          <div>
            <Label htmlFor="phone" className="text-sm font-light text-gray-700 dark:text-gray-300">Téléphone</Label>
            <Input id="phone" type="tel" placeholder="+33 6 12 34 56 78" className="mt-1.5 font-light" />
          </div>
        </CardContent>
      </Card>}

      {/* Profile info — read-only */}
      <Card className="border border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-light tracking-tight text-gray-900 dark:text-gray-100">
            Mon profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-light text-gray-700 dark:text-gray-300">Nom complet</Label>
              <Input className="mt-1.5 font-light bg-gray-50 dark:bg-gray-800/50" defaultValue={profile?.full_name || ""} readOnly />
            </div>
            <div>
              <Label className="text-sm font-light text-gray-700 dark:text-gray-300">Email</Label>
              <Input className="mt-1.5 font-light bg-gray-50 dark:bg-gray-800/50" defaultValue={user?.email || ""} readOnly />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Rules */}
      <Card className="border border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-light tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Bot className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
            Mes règles agent
          </CardTitle>
          <CardDescription className="text-sm font-light">
            Personnalisez le comportement de LÉO pour vos conversations. Ces règles s'appliquent uniquement à vous.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RulesEditor
            rules={userRules}
            isLoading={rulesLoading}
            onCreate={createRule.mutateAsync}
            onUpdate={updateRule.mutateAsync}
            onDelete={removeRule.mutateAsync}
            emptyMessage="Aucune règle personnelle. LÉO utilise les règles par défaut de votre organisation."
            placeholderTitle="Ex: Toujours suggérer des supports Print en priorité"
            placeholderContent="Décris comment LÉO devrait se comporter différemment pour toi..."
          />
        </CardContent>
      </Card>

      {/* Logout */}
      <Card className="border border-gray-100 dark:border-gray-800 shadow-sm">
        <CardContent className="pt-6 space-y-4">
          <button onClick={handleLogout} className="w-full text-sm font-light text-red-500 hover:text-red-700 transition-colors py-2">
            Déconnexion
          </button>
          <Separator />
          <p className="text-xs text-center font-light text-gray-400 pt-2">
            Version app : v1.0.0 – Mars 2026
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Organization Tab Content ───────────────────────────────────────

function OrganizationTab() {
  const { user } = useAuth();
  const { organization, orgId, isSuperAdmin, refreshOrg } = useOrg();
  const { toast } = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    data: orgRules,
    isLoading: rulesLoading,
    create: createRule,
    update: updateRule,
    remove: removeRule,
  } = useOrgRules();

  useEffect(() => {
    if (orgId) {
      loadData();
      setOrgName(organization?.name || "");
      setLogoUrl(organization?.logo_url || null);
    }
  }, [orgId, organization]);

  async function loadData() {
    const [membersResult, orgResult] = await Promise.all([
      supabase.from("organization_members").select("*").eq("organization_id", orgId!),
      supabase.from("organizations").select("join_code").eq("id", orgId!).single(),
    ]);

    if (membersResult.data && membersResult.data.length > 0) {
      const userIds = membersResult.data.map((m: any) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const enriched = membersResult.data.map((m: any) => ({
        ...m,
        profile: profileMap.get(m.user_id) || null,
      }));
      setMembers(enriched as Member[]);
    } else {
      setMembers([]);
    }

    if (orgResult.data) setJoinCode(orgResult.data.join_code);
    setLoading(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Erreur", description: "Le fichier doit faire moins de 2MB", variant: "destructive" });
      return;
    }
    setUploadingLogo(true);
    const path = `${orgId}/logo`;
    const { error: uploadError } = await supabase.storage.from("org-logos").upload(path, file, { upsert: true });
    if (uploadError) {
      toast({ title: "Erreur", description: uploadError.message, variant: "destructive" });
      setUploadingLogo(false);
      return;
    }
    const { data: publicUrlData } = supabase.storage.from("org-logos").getPublicUrl(path);
    const { error: updateError } = await supabase.from("organizations").update({ logo_url: publicUrlData.publicUrl }).eq("id", orgId);
    if (updateError) {
      toast({ title: "Erreur", description: updateError.message, variant: "destructive" });
    } else {
      setLogoUrl(publicUrlData.publicUrl);
      refreshOrg();
      toast({ title: "Logo mis à jour" });
    }
    setUploadingLogo(false);
    e.target.value = "";
  }

  async function handleRemoveLogo() {
    if (!orgId) return;
    await supabase.storage.from("org-logos").remove([`${orgId}/logo`]);
    const { error } = await supabase.from("organizations").update({ logo_url: null }).eq("id", orgId);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setLogoUrl(null);
      refreshOrg();
      toast({ title: "Logo supprimé" });
    }
  }

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("organizations").update({ name: orgName }).eq("id", orgId!);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      refreshOrg();
      toast({ title: "Enregistré", description: "Paramètres de l'organisation mis à jour." });
    }
    setSaving(false);
  }

  async function handleChangeRole(memberId: string, newRole: string) {
    const { error } = await supabase.from("organization_members").update({ role: newRole }).eq("id", memberId);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)));
      toast({ title: "Rôle mis à jour" });
    }
  }

  async function handleRemoveMember(memberId: string) {
    const { error } = await supabase.from("organization_members").delete().eq("id", memberId);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      loadData();
    }
  }

  function getInviteMessage() {
    return `Vous êtes invité à rejoindre ${orgName || organization?.name} sur FLAIX Ads Media.\n\nCréez votre compte : ${window.location.origin}/auth?mode=signup&code=${joinCode}`;
  }

  async function handleCopyMessage() {
    await navigator.clipboard.writeText(getInviteMessage());
    setCopied(true);
    toast({ title: "Copié !", description: "Message d'invitation copié." });
    setTimeout(() => setCopied(false), 2000);
  }

  const roleColors: Record<string, string> = {
    org_admin: "bg-blue-100 text-blue-700",
    commercial: "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-8">
      {/* General — super admin only */}
      {isSuperAdmin && <Card className="border border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-light flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" strokeWidth={1.5} /> Général
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <Label className="text-sm font-light">Logo de l'organisation</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                {logoUrl && <AvatarImage src={logoUrl} alt={orgName} />}
                <AvatarFallback className="text-lg font-semibold">{orgName.charAt(0).toUpperCase() || "?"}</AvatarFallback>
              </Avatar>
              {isSuperAdmin ? (
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="logo-upload"
                    className="inline-flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 border rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors w-fit"
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingLogo ? "Upload..." : "Télécharger un logo"}
                  </Label>
                  <input id="logo-upload" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                  {logoUrl && (
                    <button type="button" onClick={handleRemoveLogo} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 w-fit">
                      <X className="h-3 w-3" />
                      Supprimer
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground">PNG, JPG, SVG ou WebP. Max 2MB.</p>
                </div>
              ) : null}
            </div>
          </div>

          <form onSubmit={handleSaveOrg} className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label className="text-sm font-light">Nom de l'organisation</Label>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
            </div>
            <Button type="submit" disabled={saving} className="bg-black text-white hover:bg-gray-900">
              {saving ? "..." : "Enregistrer"}
            </Button>
          </form>
        </CardContent>
      </Card>}

      {/* Join Code */}
      <Card className="border border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-light flex items-center gap-2">
            <KeyRound className="h-4 w-4" strokeWidth={1.5} /> Code d'invitation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-light text-gray-500 mb-4">
            Partagez ce code avec votre équipe pour qu'ils puissent créer un compte et rejoindre votre organisation.
          </p>
          <div className="flex items-center gap-4 mb-4">
            <code className="text-2xl font-mono tracking-[0.3em] bg-gray-100 dark:bg-gray-800 px-6 py-3 rounded-lg font-medium">{joinCode}</code>
          </div>
          <Button onClick={handleCopyMessage} className="gap-2 bg-black text-white hover:bg-gray-900">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copié !" : "Copier le message d'invitation"}
          </Button>
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-xs font-light text-gray-500 whitespace-pre-line">{getInviteMessage()}</div>
        </CardContent>
      </Card>

      {/* Org Rules */}
      <Card className="border border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-light flex items-center gap-2">
            <Bot className="h-4 w-4" strokeWidth={1.5} /> Règles agent
          </CardTitle>
          <CardDescription className="text-sm font-light">
            Ces règles s'appliquent à tous les membres de l'organisation. LÉO les suivra dans chaque conversation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RulesEditor
            rules={orgRules}
            isLoading={rulesLoading}
            onCreate={createRule.mutateAsync}
            onUpdate={updateRule.mutateAsync}
            onDelete={removeRule.mutateAsync}
            emptyMessage="Aucune règle d'organisation. Ajoutez-en pour guider le comportement de LÉO pour toute l'équipe."
            placeholderTitle="Ex: Ne jamais recommander de supports sous 40% de score"
            placeholderContent="Décris la règle que LÉO doit suivre pour tous les utilisateurs..."
          />
        </CardContent>
      </Card>

      {/* Members */}
      <Card className="border border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-light flex items-center gap-2">
            <Users className="h-4 w-4" strokeWidth={1.5} /> Équipe ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-400 font-light">Chargement...</p>
          ) : (
            <div className="space-y-3">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-3 border-b last:border-b-0">
                  <div>
                    <p className="text-sm font-normal text-gray-900 dark:text-gray-100">
                      {m.profile?.full_name || m.profile?.email || m.user_id}
                    </p>
                    <p className="text-xs font-light text-gray-400">{m.profile?.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {m.user_id === user?.id ? (
                      <span className={`text-xs px-2 py-1 rounded-full ${roleColors[m.role] || "bg-gray-100"}`}>{m.role}</span>
                    ) : (
                      <>
                        <select
                          value={m.role}
                          onChange={(e) => handleChangeRole(m.id, e.target.value)}
                          className={`text-xs px-2 py-1 rounded-full border-0 cursor-pointer ${roleColors[m.role] || "bg-gray-100"}`}
                        >
                          <option value="org_admin">org_admin</option>
                          <option value="commercial">commercial</option>
                        </select>
                        <button onClick={() => handleRemoveMember(m.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {members.length === 0 && (
                <p className="text-gray-400 font-light text-center py-4">
                  Aucun membre. Partagez le code d'invitation pour inviter votre équipe.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────

const Settings = () => {
  const navigate = useNavigate();
  const { isOrgAdmin, isSuperAdmin } = useOrg();
  const [activeTab, setActiveTab] = useState<Tab>("settings");

  const showOrg = isOrgAdmin || isSuperAdmin;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            type="button"
            onClick={() => navigate("/chat")}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" strokeWidth={1.5} />
          </button>
          <div>
            <h1 className="text-2xl font-light tracking-tight text-gray-900 dark:text-gray-100">
              Paramètres
            </h1>
            <p className="text-sm font-light text-gray-500 mt-0.5">
              Gérez votre profil et votre organisation
            </p>
          </div>
        </div>

        {/* Layout: side tabs + content */}
        <div className="flex gap-8">
          {/* Side tabs */}
          <div className="w-48 shrink-0 hidden md:block">
            <div className="sticky top-8">
              <SideTabs active={activeTab} onChange={setActiveTab} showOrg={showOrg} />
            </div>
          </div>

          {/* Mobile tabs */}
          <div className="md:hidden w-full mb-6">
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className={`px-4 py-2 text-sm font-light rounded-t-lg transition-colors ${
                  activeTab === "settings"
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    : "text-gray-500"
                }`}
              >
                Paramètres
              </button>
              {showOrg && (
                <button
                  type="button"
                  onClick={() => setActiveTab("organization")}
                  className={`px-4 py-2 text-sm font-light rounded-t-lg transition-colors ${
                    activeTab === "organization"
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      : "text-gray-500"
                  }`}
                >
                  Organisation
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeTab === "settings" && <ProfileTab />}
            {activeTab === "organization" && showOrg && <OrganizationTab />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
