import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { calculateNet, parseTarifText } from '@/lib/pricing';
import type { VisuelData, ContactData } from '@/lib/devisCalculations';

export interface CampaignSupport {
  id: string;
  conversation_id: string;
  organization_id: string;
  is_selected: boolean;
  support_data: {
    support_name: string;
    support_slug: string;
    variant_slug: string;
    canal: 'Print' | 'Web' | 'NL';
    type_tarif?: 'forfait' | 'cpm' | 'pack' | 'unitaire';
    categorie: string | null;
    lectorat: string | null;
    editeur?: string | null;
    periodicite_print?: string | null;
    diffusion_print?: number | null;
    format_print?: string | null;
    format_pub?: string | null;
    visites_par_mois_web?: number | null;
    pages_vues_par_mois_web?: number | null;
    nombre_envois_nl?: number | null;
    tarif_brut: string | null;
    tarif_net: string | null;
    dates_parution?: string[];
    dates_bouclage?: string[];
    similarity?: number;
    visuels_data?: VisuelData[] | null;
    contacts_data?: ContactData[] | null;
    url?: string | null;
    periodicite_nl?: string | null;
    abonnes_nl?: number | null;
    taux_ouverture_nl?: number | null;
    format_nl?: string | null;
    format_web?: string | null;
  };
  deal_overrides: {
    quantite?: number;
    date_parution?: string;
    date_bouclage?: string;
    remise_1?: number;
    remise_exceptionnelle?: number;
    remise_2?: number;
  };
  created_at: string;
}

export function useWorkingSet(conversationId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['campaign_supports', conversationId],
    queryFn: async (): Promise<CampaignSupport[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('campaign_supports')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('is_selected', true)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CampaignSupport[];
    },
    enabled: !!conversationId,
  });

  const supports = query.data ?? [];

  const netTotal = supports.reduce((sum, s) => {
    const o = s.deal_overrides;
    const qty = o.quantite ?? 1;
    const hasDiscount = (o.remise_1 ?? 0) > 0 || (o.remise_exceptionnelle ?? 0) > 0 || (o.remise_2 ?? 0) > 0;
    const hasOverride = qty > 1 || hasDiscount;
    return sum + (hasOverride
      ? calculateNet(s.support_data.tarif_brut, o.remise_1, o.remise_exceptionnelle, o.remise_2) * qty
      : parseTarifText(s.support_data.tarif_net));
  }, 0);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['campaign_supports', conversationId] });
  };

  return {
    supports,
    isLoading: query.isLoading,
    totalCount: supports.length,
    netTotal,
    invalidate,
  };
}

export function useRemoveSupport(conversationId: string | null) {
  const queryClient = useQueryClient();

  const { mutate: removeSupport, isPending: isRemoving } = useMutation({
    mutationFn: async (supportId: string) => {
      const { error } = await supabase
        .from('campaign_supports')
        .update({ is_selected: false })
        .eq('id', supportId);
      if (error) throw error;
    },
    onSuccess: (_, supportId) => {
      queryClient.setQueryData<CampaignSupport[]>(
        ['campaign_supports', conversationId],
        (old) => (old ?? []).filter((s) => s.id !== supportId)
      );
      queryClient.invalidateQueries({ queryKey: ['campaign_supports', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['campaign_supports_rejected', conversationId] });
    },
  });

  return { removeSupport, isRemoving };
}

export function useRejectedSupports(conversationId: string | null) {
  return useQuery({
    queryKey: ['campaign_supports_rejected', conversationId],
    queryFn: async (): Promise<CampaignSupport[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('campaign_supports')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('is_selected', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampaignSupport[];
    },
    enabled: !!conversationId,
  });
}

export function useDealOverridesMutation(conversationId: string | null) {
  const queryClient = useQueryClient();

  const { mutate: mergeOverrides, isPending } = useMutation({
    mutationFn: async ({ supportId, overrides }: { supportId: string; overrides: Record<string, unknown> }) => {
      const { error } = await supabase.rpc('merge_deal_overrides', {
        p_support_id: supportId,
        p_overrides: overrides,
      });
      if (error) throw error;
    },
    onMutate: async ({ supportId, overrides }) => {
      await queryClient.cancelQueries({ queryKey: ['campaign_supports', conversationId] });
      const previous = queryClient.getQueryData<CampaignSupport[]>(['campaign_supports', conversationId]);
      queryClient.setQueryData<CampaignSupport[]>(
        ['campaign_supports', conversationId],
        (old) => (old ?? []).map((s) =>
          s.id === supportId
            ? { ...s, deal_overrides: { ...s.deal_overrides, ...overrides } }
            : s
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['campaign_supports', conversationId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign_supports', conversationId] });
    },
  });

  return { mergeOverrides, isPending };
}

export function useReAddSupport(conversationId: string | null) {
  const queryClient = useQueryClient();

  const { mutate: reAddSupport } = useMutation({
    mutationFn: async (supportId: string) => {
      const { error } = await supabase
        .from('campaign_supports')
        .update({ is_selected: true })
        .eq('id', supportId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign_supports', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['campaign_supports_rejected', conversationId] });
    },
  });

  return { reAddSupport };
}
