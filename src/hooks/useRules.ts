import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';

export interface Rule {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

type RuleInsert = { title: string; content: string };
type RuleUpdate = Partial<Pick<Rule, 'title' | 'content' | 'is_active' | 'sort_order'>>;

// ─── User Rules ───────────────────────────────────────────────────────────────

export function useUserRules() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['user_rules', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_rules')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as Rule[];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async (input: RuleInsert) => {
      const maxSort = Math.max(0, ...(query.data?.map(r => r.sort_order) ?? [0]));
      const { error } = await supabase.from('user_rules').insert({
        user_id: user!.id,
        organization_id: orgId!,
        title: input.title,
        content: input.content,
        sort_order: maxSort + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user_rules'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: RuleUpdate & { id: string }) => {
      const { error } = await supabase.from('user_rules').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user_rules'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user_rules'] }),
  });

  return { ...query, create, update, remove };
}

// ─── Org Rules ────────────────────────────────────────────────────────────────

export function useOrgRules(overrideOrgId?: string) {
  const { orgId: contextOrgId } = useOrg();
  const orgId = overrideOrgId || contextOrgId;
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['org_rules', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_rules')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as Rule[];
    },
    enabled: !!orgId,
  });

  const create = useMutation({
    mutationFn: async (input: RuleInsert) => {
      const maxSort = Math.max(0, ...(query.data?.map(r => r.sort_order) ?? [0]));
      const { error } = await supabase.from('org_rules').insert({
        organization_id: orgId!,
        title: input.title,
        content: input.content,
        sort_order: maxSort + 1,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org_rules'] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: RuleUpdate & { id: string }) => {
      const { error } = await supabase.from('org_rules').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org_rules'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('org_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org_rules'] }),
  });

  return { ...query, create, update, remove };
}
