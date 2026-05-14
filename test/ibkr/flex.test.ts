import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getFlexQuery,
  listFlexQueries,
  forgetFlexQuery,
  _resetFlexCacheForTests,
} from "../../src/ibkr/flex.js";

const FLEX_BASE = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService";

function mockFetchSequence(responses: Array<{ url?: RegExp; body: string; status?: number }>) {
  let i = 0;
  return vi.fn(async (input: string) => {
    const r = responses[i++];
    if (r.url && !r.url.test(input)) {
      throw new Error(`fetch url ${input} does not match ${r.url}`);
    }
    return {
      ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
      status: r.status ?? 200,
      text: async () => r.body,
    } as Response;
  });
}

describe("getFlexQuery", () => {
  beforeEach(() => {
    _resetFlexCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hits SendRequest with token + queryId, then GetStatement with reference code", async () => {
    const fetchMock = mockFetchSequence([
      {
        url: /SendRequest/,
        body:
          '<FlexStatementResponse><Status>Success</Status><ReferenceCode>123456</ReferenceCode><Url>https://example.com</Url></FlexStatementResponse>',
      },
      {
        url: /GetStatement/,
        body:
          '<FlexQueryResponse queryName="Q1" type="AF"><FlexStatements count="1"><FlexStatement accountId="DU1"><Trades><Trade symbol="AAPL"/></Trades></FlexStatement></FlexStatements></FlexQueryResponse>',
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFlexQuery("987654321", "tok-abc", { pollMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstUrl).toContain(FLEX_BASE + ".SendRequest");
    expect(firstUrl).toContain("t=tok-abc");
    expect(firstUrl).toContain("q=987654321");
    const secondUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondUrl).toContain(FLEX_BASE + ".GetStatement");
    expect(secondUrl).toContain("q=123456");
    expect(secondUrl).toContain("t=tok-abc");
    expect(result.referenceCode).toBe("123456");
    expect(result.xml).toContain("FlexQueryResponse");
  });

  it("throws when SendRequest returns an error status", async () => {
    const fetchMock = mockFetchSequence([
      {
        url: /SendRequest/,
        body:
          '<FlexStatementResponse><Status>Fail</Status><ErrorCode>1019</ErrorCode><ErrorMessage>Statement generation in progress</ErrorMessage></FlexStatementResponse>',
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(getFlexQuery("987654321", "tok-abc", { pollMs: 0 })).rejects.toThrow(/1019/);
  });

  it("caches successful queries by (queryId, token)", async () => {
    const fetchMock = mockFetchSequence([
      {
        body:
          '<FlexStatementResponse><Status>Success</Status><ReferenceCode>R1</ReferenceCode></FlexStatementResponse>',
      },
      { body: "<FlexQueryResponse></FlexQueryResponse>" },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const a = await getFlexQuery("q1", "t1", { pollMs: 0 });
    const b = await getFlexQuery("q1", "t1", { pollMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // second call uses cache
    expect(b).toBe(a);
    expect(listFlexQueries()).toEqual(["q1"]);
  });
});

describe("listFlexQueries / forgetFlexQuery", () => {
  beforeEach(() => {
    _resetFlexCacheForTests();
  });

  it("lists cached query IDs and forgets one", async () => {
    const fetchMock = mockFetchSequence([
      {
        body:
          '<FlexStatementResponse><Status>Success</Status><ReferenceCode>R1</ReferenceCode></FlexStatementResponse>',
      },
      { body: "<FlexQueryResponse></FlexQueryResponse>" },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    await getFlexQuery("qX", "tok", { pollMs: 0 });
    expect(listFlexQueries()).toEqual(["qX"]);
    forgetFlexQuery("qX");
    expect(listFlexQueries()).toEqual([]);
  });
});
