export type CampusInsightsConfig = {
  CAMPUS_INSIGHTS_ENABLED?: string;
  CAMPUS_INSIGHTS_BASE_URL?: string;
  CAMPUS_INSIGHTS_LECTURER_PATH?: string;
  CAMPUS_INSIGHTS_LECTURER_URL?: string;
  CAMPUS_INSIGHTS_API_KEY?: string;
  ADVISING_PLATFORM_SECRET_KEY?: string;
  CAMPUS_INSIGHTS_LECTURER_BY_UID_URL?: string;
  CAMPUS_INSIGHTS_AVAILABILITY_URL?: string;
  CAMPUS_INSIGHTS_RATINGS_URL?: string;
  CAMPUS_INSIGHTS_TOPICS_URL?: string;
  CAMPUS_INSIGHTS_BOOKING_STATS_URL?: string;
};

type IntegrationResult = { status: number; body: Record<string, unknown> };
type EndpointName = "availability" | "ratings" | "topics" | "booking statistics";

function endpointFor(config: CampusInsightsConfig, name: EndpointName): string | undefined {
  return {
    availability: config.CAMPUS_INSIGHTS_AVAILABILITY_URL,
    ratings: config.CAMPUS_INSIGHTS_RATINGS_URL,
    topics: config.CAMPUS_INSIGHTS_TOPICS_URL,
    "booking statistics": config.CAMPUS_INSIGHTS_BOOKING_STATS_URL,
  }[name];
}

function expandTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(lecturerId|date|period)\}/g, (_, key: string) => encodeURIComponent(values[key] ?? ""));
}

export class CampusInsightsClient {
  constructor(private readonly config: CampusInsightsConfig) {}

  private apiKey(): string | undefined {
    return this.config.ADVISING_PLATFORM_SECRET_KEY ?? this.config.CAMPUS_INSIGHTS_API_KEY;
  }

  async getLecturerByEmail(email: string): Promise<IntegrationResult> {
    if (this.config.CAMPUS_INSIGHTS_ENABLED !== "true") {
      return { status: 503, body: { success: false, source: "campus-insights", fallback: true, error: "Campus Insights integration is disabled until the partner contract is configured" } };
    }
    const apiKey = this.apiKey();
    if (!apiKey) {
      return { status: 503, body: { success: false, source: "campus-insights", fallback: true, error: "Campus Insights API key is not configured" } };
    }
    const endpoint = this.config.CAMPUS_INSIGHTS_LECTURER_URL
      ?? (this.config.CAMPUS_INSIGHTS_BASE_URL && this.config.CAMPUS_INSIGHTS_LECTURER_PATH
        ? new URL(this.config.CAMPUS_INSIGHTS_LECTURER_PATH, this.config.CAMPUS_INSIGHTS_BASE_URL).toString()
        : undefined);
    if (!endpoint) {
      return { status: 503, body: { success: false, source: "campus-insights", fallback: true, error: "Campus Insights lecturer endpoint is not configured" } };
    }
    const url = new URL(endpoint);
    url.searchParams.set("email", email);
    return this.fetchPartner(url.toString(), { "x-api-key": apiKey });
  }

  async getLecturerByUid(uid: string): Promise<IntegrationResult> {
    if (this.config.CAMPUS_INSIGHTS_ENABLED !== "true") {
      return { status: 503, body: { success: false, source: "campus-insights", fallback: true, error: "Campus Insights integration is disabled until the partner contract is configured" } };
    }
    const apiKey = this.apiKey();
    if (!apiKey) {
      return { status: 503, body: { success: false, source: "campus-insights", fallback: true, error: "Campus Insights API key is not configured" } };
    }
    const endpoint = this.config.CAMPUS_INSIGHTS_LECTURER_BY_UID_URL
      ?? (this.config.CAMPUS_INSIGHTS_BASE_URL && this.config.CAMPUS_INSIGHTS_LECTURER_PATH
        ? new URL(this.config.CAMPUS_INSIGHTS_LECTURER_PATH.replace("{uid}", encodeURIComponent(uid)), this.config.CAMPUS_INSIGHTS_BASE_URL).toString()
        : undefined);
    if (!endpoint) {
      return { status: 503, body: { success: false, source: "campus-insights", fallback: true, error: "Campus Insights lecturer UID endpoint is not configured" } };
    }
    return this.fetchPartner(endpoint.replace("{uid}", encodeURIComponent(uid)), { "x-api-key": apiKey });
  }

  async getConfigured(name: EndpointName, values: Record<string, string>): Promise<IntegrationResult> {
    if (this.config.CAMPUS_INSIGHTS_ENABLED !== "true") {
      return { status: 503, body: { success: false, source: "campus-insights", fallback: true, error: "Campus Insights integration is disabled until the partner contract is configured", endpoint: name } };
    }
    const endpoint = endpointFor(this.config, name);
    if (!endpoint) return { status: 503, body: { success: false, source: "campus-insights", fallback: true, error: "Campus Insights endpoint is not configured", endpoint: name } };
    const apiKey = this.apiKey();
    if (!apiKey) return { status: 503, body: { success: false, source: "campus-insights", fallback: true, error: "Campus Insights API key is not configured", endpoint: name } };
    return this.fetchPartner(expandTemplate(endpoint, values), { "x-api-key": apiKey });
  }

  private async fetchPartner(url: string, headers: HeadersInit = {}): Promise<IntegrationResult> {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(8_000) });
      const text = await response.text();
      if (text.length > 1_000_000) {
        return { status: 502, body: { success: false, source: "campus-insights", fallback: true, error: "Campus Insights response was too large" } };
      }
      let partnerResponse: unknown = text;
      try { partnerResponse = JSON.parse(text); } catch { /* Preserve a non-JSON response. */ }
      if (!response.ok) return { status: response.status === 429 ? 429 : 502, body: { success: false, source: "campus-insights", fallback: true, error: response.status === 429 ? "Campus Insights rate limit exceeded" : "Campus Insights returned a non-success response", partnerStatus: response.status, partnerResponse } };
      return { status: 200, body: { success: true, source: "campus-insights", partnerStatus: response.status, data: partnerResponse } };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return { status: timedOut ? 504 : 502, body: { success: false, source: "campus-insights", fallback: true, error: timedOut ? "Campus Insights request timed out" : "Campus Insights request failed" } };
    }
  }
}
