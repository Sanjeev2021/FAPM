import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/shared/AppHeader";
import { AppFooter } from "@/components/shared/AppFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, Plus, ChevronRight } from "lucide-react";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  member_count?: number;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: "", slug: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadOrgs();
  }, []);

  async function loadOrgs() {
    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading orgs:", error);
    } else {
      // Load member counts
      const orgsWithCounts = await Promise.all(
        (data || []).map(async (org) => {
          const { count } = await supabase
            .from("organization_members")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", org.id);
          return { ...org, member_count: count || 0 };
        })
      );
      setOrgs(orgsWithCounts);
    }
    setLoading(false);
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    const slug = newOrg.slug || newOrg.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const { error } = await supabase
      .from("organizations")
      .insert({ name: newOrg.name, slug });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Organization created", description: `${newOrg.name} is ready.` });
      setNewOrg({ name: "", slug: "" });
      setShowCreate(false);
      loadOrgs();
    }
    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AppHeader />
      <main className="flex-1 container mx-auto px-8 md:px-12 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light tracking-tight text-gray-900">Super Admin</h1>
            <p className="text-sm font-light text-gray-500 mt-1">Manage organizations and users</p>
          </div>
          <Button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-black text-white hover:bg-gray-900"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Organization
          </Button>
        </div>

        {showCreate && (
          <Card className="mb-8 border-0 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg font-light">Create Organization</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateOrg} className="flex gap-4 items-end">
                <div className="flex-1 space-y-2">
                  <Label className="text-sm font-light">Name</Label>
                  <Input
                    value={newOrg.name}
                    onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                    placeholder="Acme Corp"
                    required
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label className="text-sm font-light">Slug (optional)</Label>
                  <Input
                    value={newOrg.slug}
                    onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })}
                    placeholder="acme-corp"
                  />
                </div>
                <Button type="submit" disabled={creating} className="bg-black text-white hover:bg-gray-900">
                  {creating ? "Creating..." : "Create"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-gray-500 font-light">Loading organizations...</p>
        ) : (
          <div className="grid gap-4">
            {orgs.map((org) => (
              <Card
                key={org.id}
                className="border-0 shadow-card hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/admin/org/${org.id}`)}
              >
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-r from-[#7C8CF8] to-[#C084FC] flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-normal text-gray-900">{org.name}</h3>
                      <p className="text-xs font-light text-gray-400">{org.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 text-sm font-light text-gray-500">
                      <Users className="h-4 w-4" />
                      {org.member_count} members
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </div>
                </CardContent>
              </Card>
            ))}
            {orgs.length === 0 && (
              <p className="text-gray-400 font-light text-center py-12">No organizations yet. Create your first one.</p>
            )}
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  );
};

export default AdminDashboard;
