const TRANSIENT_CODES = new Set(["quota_exceeded", "upstream_error", "network_error", "timeout", "empty_text"]);

export class OracleCloudClient {
  constructor({ primary, chatFallbacks = [], speechProvider = primary, transcribeProvider = primary, now = Date.now, failureThreshold = 2, cooldownMs = 30_000 } = {}) {
    if (!primary) throw new TypeError("primary cloud client is required");
    this.primary = primary;
    this.speechProvider = speechProvider;
    this.transcribeProvider = transcribeProvider;
    this.chatProviders = [primary, ...chatFallbacks];
    this.now = now;
    this.failureThreshold = Math.max(1, failureThreshold);
    this.cooldownMs = Math.max(1_000, cooldownMs);
    this.circuits = new Map();
    this.models = Object.freeze({
      ...primary.models,
      speech: speechProvider?.model ?? primary.models?.speech,
      transcribe: transcribeProvider?.models?.transcribe ?? primary.models?.transcribe,
    });
    this.providerSummary = this.chatProviders.map(providerName).join(" + ");
    this.speechProviderName = providerName(speechProvider);
    this.transcribeProviderName = providerName(transcribeProvider);
  }

  transcribe(payload) { return this.transcribeProvider.transcribe(payload); }
  speech(payload) { return this.speechProvider.speech(payload); }

  async chat(payload) {
    let lastError = null;
    const providers = this.#availableProviders();
    for (const provider of providers) {
      try {
        const result = await provider.chat(payload);
        this.#markSuccess(provider);
        return result;
      } catch (error) {
        lastError = error;
        if (!isTransientProviderError(error)) throw error;
        this.#markFailure(provider);
      }
    }
    throw lastError ?? Object.assign(new Error("No cloud chat provider is available"), { status: 503, code: "upstream_error" });
  }

  async *chatStream(payload) {
    let lastError = null;
    for (const provider of this.#availableProviders()) {
      let emitted = false;
      try {
        for await (const chunk of provider.chatStream(payload)) {
          emitted = true;
          yield chunk;
        }
        this.#markSuccess(provider);
        return;
      } catch (error) {
        lastError = error;
        if (!isTransientProviderError(error)) throw error;
        this.#markFailure(provider);
        if (emitted) throw error;
      }
    }
    throw lastError ?? Object.assign(new Error("No cloud chat provider is available"), { status: 503, code: "upstream_error" });
  }

  #availableProviders() {
    const timestamp = this.now();
    const available = this.chatProviders.filter((provider) => (this.circuits.get(provider)?.openUntil ?? 0) <= timestamp);
    return available.length ? available : [this.primary];
  }

  #markSuccess(provider) {
    this.circuits.delete(provider);
  }

  #markFailure(provider) {
    const previous = this.circuits.get(provider) ?? { failures: 0, openUntil: 0 };
    const failures = previous.failures + 1;
    this.circuits.set(provider, {
      failures,
      openUntil: failures >= this.failureThreshold ? this.now() + this.cooldownMs : 0,
    });
  }
}

export function isTransientProviderError(error) {
  return TRANSIENT_CODES.has(error?.code);
}

function providerName(provider) {
  return provider?.provider || "gemini";
}
