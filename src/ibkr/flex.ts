/**
 * IBKR Flex Web Service client.
 *
 * Flex queries are HTTPS calls, not socket. The flow is:
 *   1. SendRequest — POST/GET to FlexStatementService.SendRequest with
 *      token + queryId. Server returns a ReferenceCode and a URL.
 *   2. GetStatement — GET FlexStatementService.GetStatement with token +
 *      ReferenceCode. Server may respond with "Statement generation in
 *      progress" until the file is ready; we poll with backoff.
 *
 * Endpoint reference:
 *   https://www.interactivebrokers.com/en/software/am/am/reports/flex_web_service_version_3.htm
 */

const FLEX_BASE =
  "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService";

export interface FlexQueryResult {
  queryId: string;
  referenceCode: string;
  xml: string;
  fetchedAt: number;
}

export interface FlexOptions {
  /** Milliseconds between GetStatement polls when the file isn't ready. */
  pollMs?: number;
  /** Max number of polls before giving up. Default 10. */
  maxPolls?: number;
}

interface CacheKey {
  queryId: string;
  token: string;
}

const cache = new Map<string, FlexQueryResult>();

function cacheKey({ queryId, token }: CacheKey): string {
  return `${queryId}::${token}`;
}

function parseTag(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  return m?.[1];
}

async function sendRequest(queryId: string, token: string): Promise<string> {
  const url = `${FLEX_BASE}.SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`flex SendRequest http ${res.status}`);
  const xml = await res.text();
  const status = parseTag(xml, "Status");
  if (status !== "Success") {
    const code = parseTag(xml, "ErrorCode") ?? "?";
    const msg = parseTag(xml, "ErrorMessage") ?? xml.slice(0, 200);
    throw new Error(`flex SendRequest failed (${code}): ${msg}`);
  }
  const ref = parseTag(xml, "ReferenceCode");
  if (!ref) throw new Error("flex SendRequest: missing ReferenceCode");
  return ref;
}

async function getStatement(
  referenceCode: string,
  token: string,
  opts: Required<FlexOptions>,
): Promise<string> {
  const url = `${FLEX_BASE}.GetStatement?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=3`;
  for (let i = 0; i < opts.maxPolls; i++) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`flex GetStatement http ${res.status}`);
    const xml = await res.text();
    // IB returns a <FlexStatementResponse> with Status=Warn while the file
    // is still being generated; otherwise we get the actual FlexQueryResponse.
    if (xml.includes("<FlexQueryResponse")) return xml;
    const status = parseTag(xml, "Status");
    if (status === "Fail") {
      const code = parseTag(xml, "ErrorCode") ?? "?";
      const msg = parseTag(xml, "ErrorMessage") ?? "";
      throw new Error(`flex GetStatement failed (${code}): ${msg}`);
    }
    if (opts.pollMs > 0) await new Promise((r) => setTimeout(r, opts.pollMs));
  }
  throw new Error(`flex GetStatement: gave up after ${opts.maxPolls} polls`);
}

export async function getFlexQuery(
  queryId: string,
  token: string,
  options: FlexOptions = {},
): Promise<FlexQueryResult> {
  const key = cacheKey({ queryId, token });
  const hit = cache.get(key);
  if (hit) return hit;

  const opts: Required<FlexOptions> = {
    pollMs: options.pollMs ?? 1500,
    maxPolls: options.maxPolls ?? 10,
  };

  const referenceCode = await sendRequest(queryId, token);
  const xml = await getStatement(referenceCode, token, opts);
  const result: FlexQueryResult = {
    queryId,
    referenceCode,
    xml,
    fetchedAt: Date.now(),
  };
  cache.set(key, result);
  return result;
}

export function listFlexQueries(): string[] {
  const ids = new Set<string>();
  for (const k of cache.keys()) {
    const [qid] = k.split("::");
    ids.add(qid);
  }
  return [...ids];
}

export function forgetFlexQuery(queryId: string): void {
  for (const k of [...cache.keys()]) {
    if (k.startsWith(`${queryId}::`)) cache.delete(k);
  }
}

/** Test-only helper to clear the cache between cases. */
export function _resetFlexCacheForTests(): void {
  cache.clear();
}
