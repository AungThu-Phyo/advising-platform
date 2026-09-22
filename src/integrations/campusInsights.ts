export type CampusInsightsConfig = {
  CAMPUS_INSIGHTS_LECTURER_URL?: string;
  CAMPUS_INSIGHTS_AVAILABILITY_URL?: string;
  CAMPUS_INSIGHTS_RATINGS_URL?: string;
  CAMPUS_INSIGHTS_TOPICS_URL?: string;
  CAMPUS_INSIGHTS_BOOKING_STATS_URL?: string;
};

type IntegrationResult = { status: number; body: Record<string, unknown> };
type EndpointName = "availability" | "ratings" | "topics" | "booking statistics";

// This is the only endpoint confirmed by Campus Insights. It is configurable because
// their shared development deployment is not guaranteed to remain online.
const CONFIRMED_LECTURER_URL = "https://obscure-potato-r46p4qgrgqxrhvvr-5001.app.github.dev/campus-insight-623f0/us-central/api/api/v1/lecturers";

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

  async getLecturerByEmail(email: string): Promise<IntegrationResult> {
    const endpoint = this.config.CAMPUS_INSIGHTS_LECTURER_URL ?? CONFIRMED_LECTURER_URL;
    const url = new URL(endpoint);
    url.searchParams.set("email", email);
    return this.fetchPartner(url.toString());
  }

  async getConfigured(name: EndpointName, values: Record<string, string>): Promise<IntegrationResult> {
    const endpoint = endpointFor(this.config, name);
    if (!endpoint) return { status: 503, body: { success: false, source: "campus-insights", fallback: true, error: "Campus Insights endpoint is not configured", endpoint: name } };
    return this.fetchPartner(expandTemplate(endpoint, values));
  }

  private async fetchPartner(url: string): Promise<IntegrationResult> {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
      const text = await response.text();
      let partnerResponse: unknown = text;
      try { partnerResponse = JSON.parse(text); } catch { /* Preserve a non-JSON response. */ }
      if (!response.ok) return { status: 502, body: { success: false, source: "campus-insights", fallback: true, error: "Campus Insights returned a non-success response", partnerStatus: response.status, partnerResponse } };
      return { status: 200, body: { success: true, source: "campus-insights", partnerStatus: response.status, data: partnerResponse } };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return { status: timedOut ? 504 : 502, body: { success: false, source: "campus-insights", fallback: true, error: timedOut ? "Campus Insights request timed out" : "Campus Insights request failed" } };
    }
  }
}
