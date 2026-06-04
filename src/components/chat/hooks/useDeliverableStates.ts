import { useMemo } from 'react';
import type { UIMessage } from 'ai';
import { isToolUIPart, getToolName } from 'ai';
import { useExportJob } from './useExportJob';

export interface DeliverableState {
  available: boolean;
  jobId?: string;
  jobStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  fileUrl?: string;
  emailHtml?: string;
  campaignSummary?: object;
}

interface ExportResult {
  status: string;
  job_id?: string;
  type?: string;
  toastMessage?: string;
}

interface DraftEmailResult {
  status: string;
  email_body_html?: string;
  campaign_summary?: object;
}

export function useDeliverableStates(messages: UIMessage[]) {
  // Scan messages from end for latest completed tool calls
  const { excelJobId, pptJobId, emailState } = useMemo(() => {
    let excelJobId: string | null = null;
    let pptJobId: string | null = null;
    let emailState: { html?: string; summary?: object } | null = null;

    // Scan from end — latest call wins, stop early when all found
    for (let i = messages.length - 1; i >= 0; i--) {
      if (excelJobId && pptJobId && emailState) break;
      const msg = messages[i];
      for (const part of msg.parts) {
        if (!isToolUIPart(part) || part.state !== 'output-available') continue;
        const toolName = getToolName(part);
        const output = part.output;

        if (toolName === 'generateExcel' && !excelJobId) {
          const result = output as ExportResult;
          if (result?.job_id) excelJobId = result.job_id;
        }
        if (toolName === 'generatePpt' && !pptJobId) {
          const result = output as ExportResult;
          if (result?.job_id) pptJobId = result.job_id;
        }
        if (toolName === 'draftEmail' && !emailState) {
          const result = output as DraftEmailResult;
          if (result?.status === 'ready') {
            emailState = {
              html: result.email_body_html,
              summary: result.campaign_summary,
            };
          }
        }
      }
    }

    return { excelJobId, pptJobId, emailState };
  }, [messages]);

  // Always call both hooks unconditionally (React hook rules)
  const { data: excelJob } = useExportJob(excelJobId);
  const { data: pptJob } = useExportJob(pptJobId);

  const excel: DeliverableState = {
    available: !!excelJobId,
    jobId: excelJobId ?? undefined,
    jobStatus: excelJob?.status,
    fileUrl: excelJob?.file_url ?? undefined,
  };

  const ppt: DeliverableState = {
    available: !!pptJobId,
    jobId: pptJobId ?? undefined,
    jobStatus: pptJob?.status,
    fileUrl: pptJob?.file_url ?? undefined,
  };

  const email: DeliverableState = {
    available: !!emailState,
    emailHtml: emailState?.html,
    campaignSummary: emailState?.summary,
  };

  return { excel, ppt, email };
}
