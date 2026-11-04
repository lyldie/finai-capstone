/** Keep backend/network implementation details out of alerts and inline error text. */
export function userFacingError(error: unknown, fallback: string): string {
  const message = typeof error === 'string'
    ? error.trim()
    : error instanceof Error
      ? error.message.trim()
      : '';

  if (!message) return fallback;

  const technical = /^(request failed\s*\(\d+\)|http\s+\d{3}|\d{3}\s*:\s*|internal server error|network request failed|network error|failed to fetch|fetch failed|network unavailable|invalid .* response|unexpected response|syntaxerror|typeerror|referenceerror|timeout|aborted|\{.*\}|[A-Z][A-Z0-9_]{2,})/i;
  if (technical.test(message) || /\bat\s+\w+\s+\(/i.test(message) || message.length > 220) return fallback;

  return message;
}

export function isExpectedNetworkError(error: unknown): boolean {
  const candidate = error as { name?: unknown; message?: unknown } | null;
  const message = typeof candidate?.message === 'string' ? candidate.message : typeof error === 'string' ? error : '';
  const name = typeof candidate?.name === 'string' ? candidate.name : '';
  return /^(network request failed|failed to fetch|fetch failed|network error|network unavailable|connection error|request timed out|timeout|aborted)$/i.test(message.trim())
    || /network request failed|failed to fetch|fetch failed|network error|timed? ?out|connection (was )?lost/i.test(message)
    || name === 'AbortError';
}

export function logUnexpectedError(label: string, error: unknown): void {
  if (!isExpectedNetworkError(error)) console.error(label, error);
}
