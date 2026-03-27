import { OpenAICompatibleProvider } from './openai-compatible.js';

export class AzureOpenAIProvider extends OpenAICompatibleProvider {
  constructor({ apiKey, apiBase, deployment, apiVersion = '2024-06-01', defaultModel }) {
    const base = apiBase
      ? `${apiBase.replace(/\/$/, '')}/openai/deployments/${deployment}`
      : undefined;
    super({
      apiKey,
      apiBase: base ? `${base}?api-version=${apiVersion}` : undefined,
      defaultModel: defaultModel || deployment,
      spec: { name: 'azure', stripModelPrefix: true },
    });
  }

  _buildKwargs({ messages, tools, model, maxTokens, temperature, reasoningEffort }) {
    const kwargs = super._buildKwargs({ messages, tools, model, maxTokens, temperature, reasoningEffort });
    kwargs.model = this.defaultModel;
    return kwargs;
  }
}
