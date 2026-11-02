/** Keys are entered per reconstruction; never persist them in browser storage or URLs. */
export const meshyKeyField = () =>
  `<div class="meshy-credentials"><label for="meshy-api-key">Your Meshy API key<input id="meshy-api-key" name="meshy-api-key" type="password" autocomplete="off" spellcheck="false" autocapitalize="none" maxlength="512" placeholder="msy_…" aria-describedby="meshy-key-help"></label><p id="meshy-key-help" class="muted small">Required for new photo reconstructions. Uses your Meshy account and credits; an API-enabled Meshy plan is required. The key goes to Kamino’s backend and Meshy, stays in memory while this job runs, and is not saved. <a href="https://www.meshy.ai/developers/keys" target="_blank" rel="noopener noreferrer">Get your Meshy API key ↗</a></p></div>`

export const validMeshyKey = (value: string) => /^msy_[A-Za-z0-9_-]{4,508}$/.test(value.trim())

export const canResumeMeshy = (job: {
  provider: string
  status: string
  mesh_path?: string | null
  provider_task_id?: string | null
  error?: { code: string } | null
}) =>
  job.provider === 'meshy' &&
  job.status === 'failed' &&
  !job.mesh_path &&
  !!job.provider_task_id &&
  new Set([
    'meshy_key_required',
    'meshy_key_rejected',
    'meshy_credits_exhausted',
    'provider_timeout',
    'provider_response_error',
    'provider_http_error',
    'reconstruction_error',
    'asset_download_error',
    'storage_budget_exhausted',
  ]).has(job.error?.code || '')
