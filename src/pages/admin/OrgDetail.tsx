import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/shared/AppHeader";
import { AppFooter } from "@/components/shared/AppFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { RulesEditor } from "@/components/rules/RulesEditor";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgRules } from "@/hooks/useRules";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Copy, Trash2, Check, Upload, X, Settings, KeyRound, Bot, Users } from "lucide-react";

interface Member {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { email: string; full_name: string | null };
}

interface Org {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  join_code: string;
  settings: Record<string, unknown>;
}

const OrgDetail = () => {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Editable fields
  const [orgName, setOrgName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Org rules for this specific org
  const {
    data: orgRules,
    isLoading: rulesLoading,
    create: createRule,
    update: updateRule,
    remove: removeRule,
  } = useOrgRules(orgId);

  useEffect(() => {
    if (orgId) loadData();
  }, [orgId]);

  async function loadData() {
    const [orgResult, membersResult] = await Promise.all([
      supabase.from("organizations").select("*").eq("id", orgId!).single(),
      supabase.from("organization_members").select("*").eq("organization_id", orgId!),
    ]);

    if (orgResult.data) {
      const orgData = orgResult.data as Org;
      setOrg(orgData);
      setOrgName(orgData.name);
      setLogoUrl(orgData.logo_url);
    }

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

    setLoading(false);
  }

  // ─── Logo ──────────────────────────────────────────────────────────

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Error", description: "File must be under 2MB", variant: "destructive" });
      return;
    }
    setUploadingLogo(true);
    const path = `${orgId}/logo`;
    const { error: uploadError } = await supabase.storage.from("org-logos").upload(path, file, { upsert: true });
    if (uploadError) {
      toast({ title: "Error", description: uploadError.message, variant: "destructive" });
      setUploadingLogo(false);
      return;
    }
    const { data: publicUrlData } = supabase.storage.from("org-logos").getPublicUrl(path);
    const { error: updateError } = await supabase.from("organizations").update({ logo_url: publicUrlData.publicUrl }).eq("id", orgId);
    if (updateError) {
      toast({ title: "Error", description: updateError.message, variant: "destructive" });
    } else {
      setLogoUrl(publicUrlData.publicUrl);
      toast({ title: "Logo updated" });
    }
    setUploadingLogo(false);
    e.target.value = "";
  }

  async function handleRemoveLogo() {
    if (!orgId) return;
    await supabase.storage.from("org-logos").remove([`${orgId}/logo`]);
    const { error } = await supabase.from("organizations").update({ logo_url: null }).eq("id", orgId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setLogoUrl(null);
      toast({ title: "Logo removed" });
    }
  }

  // ─── Save Org Name ─────────────────────────────────────────────────

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("organizations").update({ name: orgName }).eq("id", orgId!);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setOrg(prev => prev ? { ...prev, name: orgName } : prev);
      toast({ title: "Saved", description: "Organization settings updated." });
    }
    setSaving(false);
  }

  // ─── Invite ────────────────────────────────────────────────────────

  function getInviteMessage() {
    if (!org) return "";
    return `You've been invited to join ${orgName || org.name} on FLAIX Ads Media.\n\nCreate your account: ${window.location.origin}/auth?mode=signup&code=${org.join_code}`;
  }

  async function handleCopyMessage() {
    await navigator.clipboard.writeText(getInviteMessage());
    setCopied(true);
    toast({ title: "Copied!", description: "Invite message copied to clipboard." });
    setTimeout(() => setCopied(false), 2000);
  }

  // ─── Members ───────────────────────────────────────────────────────

  async function handleChangeRole(memberId: string, newRole: string) {
    const { error } = await supabase
      .from("organization_members")
      .update({ role: newRole })
      .eq("id", memberId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
      toast({ title: "Role updated" });
    }
  }

  async function handleRemoveMember(memberId: string) {
    const { error } = await supabase.from("organization_members").delete().eq("id", memberId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      loadData();
    }
  }

  // ─── Delete Org ──────────────────────────────────────────────────

  async function handleDeleteOrg() {
    if (!orgId || confirmDelete !== org?.name) return;
    setDeleting(true);
    const { error } = await supabase.from("organizations").delete().eq("id", orgId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setDeleting(false);
    } else {
      toast({ title: "Organization deleted", description: `${org?.name} has been permanently deleted.` });
      navigate("/admin");
    }
  }

  const roleColors: Record<string, string> = {
    super_admin: "bg-red-100 text-red-700",
    org_admin: "bg-blue-100 text-blue-700",
    commercial: "bg-green-100 text-green-700",
  };

  if (loading) return <div className="min-h-screen bg-gray-50"><AppHeader /><div className="p-8 text-gray-500 font-light">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AppHeader />
      <main className="flex-1 container mx-auto px-8 md:px-12 py-8">
        <button
          onClick={() => navigate("/admin")}
          className="flex items-center gap-2 text-sm font-light text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </button>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              {logoUrl && <AvatarImage src={logoUrl} alt={orgName} />}
              <AvatarFallback className="text-lg font-semibold">{orgName.charAt(0).toUpperCase() || "?"}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-light tracking-tight text-gray-900">{org?.name}</h1>
              <p className="text-sm font-light text-gray-400 mt-0.5">{org?.slug}</p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* General — Logo & Name */}
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg font-light flex items-center gap-2">
                <Settings className="h-4 w-4" strokeWidth={1.5} /> General
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <Label className="text-sm font-light">Organization Logo</Label>
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14">
                    {logoUrl && <AvatarImage src={logoUrl} alt={orgName} />}
                    <AvatarFallback className="text-lg font-semibold">{orgName.charAt(0).toUpperCase() || "?"}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="logo-upload"
                      className="inline-flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 border rounded-md hover:bg-gray-50 transition-colors w-fit"
                    >
                      <Upload className="h-4 w-4" />
                      {uploadingLogo ? "Uploading..." : "Upload Logo"}
                    </Label>
                    <input id="logo-upload" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                    {logoUrl && (
                      <button type="button" onClick={handleRemoveLogo} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 w-fit">
                        <X className="h-3 w-3" />
                        Remove
                      </button>
                    )}
                    <p className="text-xs text-muted-foreground">PNG, JPG, SVG or WebP. Max 2MB.</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveOrg} className="flex gap-4 items-end">
                <div className="flex-1 space-y-2">
                  <Label className="text-sm font-light">Organization Name</Label>
                  <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
                </div>
                <Button type="submit" disabled={saving} className="bg-black text-white hover:bg-gray-900">
                  {saving ? "..." : "Save"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Join Code */}
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg font-light flex items-center gap-2">
                <KeyRound className="h-4 w-4" strokeWidth={1.5} /> Join Code
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <code className="text-2xl font-mono tracking-[0.3em] bg-gray-100 px-6 py-3 rounded-lg font-medium">
                  {org?.join_code}
                </code>
              </div>

              <Button
                onClick={handleCopyMessage}
                className="gap-2 bg-black text-white hover:bg-gray-900"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy Invite Message"}
              </Button>

              <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs font-light text-gray-500 whitespace-pre-line">
                {getInviteMessage()}
              </div>
            </CardContent>
          </Card>

          {/* Org Rules */}
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg font-light flex items-center gap-2">
                <Bot className="h-4 w-4" strokeWidth={1.5} /> Agent Rules
              </CardTitle>
              <CardDescription className="text-sm font-light">
                These rules apply to all members of this organization. LEO will follow them in every conversation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RulesEditor
                rules={orgRules}
                isLoading={rulesLoading}
                onCreate={createRule.mutateAsync}
                onUpdate={updateRule.mutateAsync}
                onDelete={removeRule.mutateAsync}
                emptyMessage="No organization rules. Add some to guide LEO's behavior for the whole team."
                placeholderTitle="Ex: Never recommend supports below 40% score"
                placeholderContent="Describe the rule LEO should follow for all users..."
              />
            </CardContent>
          </Card>

          {/* Members */}
          <Card className="border-0 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg font-light flex items-center gap-2">
                <Users className="h-4 w-4" strokeWidth={1.5} /> Members ({members.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-3 border-b last:border-b-0">
                    <div>
                      <p className="text-sm font-normal text-gray-900">
                        {m.profile?.full_name || m.profile?.email || m.user_id}
                      </p>
                      <p className="text-xs font-light text-gray-400">{m.profile?.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={m.role}
                        onChange={(e) => handleChangeRole(m.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-full border-0 cursor-pointer ${roleColors[m.role] || 'bg-gray-100'}`}
                      >
                        <option value="org_admin">org_admin</option>
                        <option value="commercial">commercial</option>
                      </select>
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {members.length === 0 && (
                  <p className="text-gray-400 font-light text-center py-4">No members yet. Share the join code to invite people.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border border-red-200 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg font-light flex items-center gap-2 text-red-600">
                <Trash2 className="h-4 w-4" strokeWidth={1.5} /> Danger Zone
              </CardTitle>
              <CardDescription className="text-sm font-light">
                Permanently delete this organization and all its data (conversations, members, rules, exports). This cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-light text-gray-700">
                  Type <span className="font-medium text-red-600">{org?.name}</span> to confirm
                </Label>
                <Input
                  value={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.value)}
                  placeholder={org?.name}
                  className="font-light"
                />
              </div>
              <Button
                variant="destructive"
                disabled={confirmDelete !== org?.name || deleting}
                onClick={handleDeleteOrg}
                className="w-full"
              >
                {deleting ? "Deleting..." : "Delete Organization"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
      <AppFooter />
    </div>
  );
};

export default OrgDetail;
