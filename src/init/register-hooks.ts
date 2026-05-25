import type { HostBridge } from '../plugin-adapter/plugin-adapter.js';

export interface RegisterHooksOptions {
  bridge?: HostBridge | null;
  gatewayReloadUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface RegisterHooksResult {
  registered: boolean;
  reload: 'ok' | 'unsupported' | 'unreachable' | 'skipped';
  warning?: string;
}

export async function registerPipelineHooks(options: RegisterHooksOptions = {}): Promise<RegisterHooksResult> {
  const registered = Boolean(options.bridge);
  const reloadUrl = options.gatewayReloadUrl ?? 'http://127.0.0.1:3000/api/plugins/reload';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (!fetchImpl) {
    return { registered, reload: 'skipped', warning: 'fetch unavailable; plugin will activate on next Gateway start.' };
  }

  try {
    const response = await fetchImpl(reloadUrl, { method: 'POST' });
    if (response.ok) return { registered, reload: 'ok' };
    if (response.status === 404) {
      return { registered, reload: 'unsupported', warning: 'Gateway plugin reload endpoint is unavailable; restart Gateway manually when safe.' };
    }
    return { registered, reload: 'unreachable', warning: `Gateway plugin reload failed with HTTP ${response.status}.` };
  } catch (err) {
    return { registered, reload: 'unreachable', warning: `Gateway not reachable; plugin will activate on next Gateway start. ${err instanceof Error ? err.message : String(err)}` };
  }
}
