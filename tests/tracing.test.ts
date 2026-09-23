import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { decodeTraces } from "./otlp";

for (const protocol of ["http/json", "http/protobuf"]) {
  test(`${protocol}: Bun HTTP continues W3C context through tools/fetch and flushes OTLP on SIGTERM`, async () => {
    const batches: any[] = [];
    const parents: string[] = [];
    const collector = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        expect(new URL(req.url).pathname).toBe("/v1/traces");
        expect(req.headers.get("content-type")).toBe(
          protocol === "http/protobuf"
            ? "application/x-protobuf"
            : "application/json",
        );
        batches.push(
          protocol === "http/protobuf"
            ? decodeTraces(await req.arrayBuffer())
            : await req.json(),
        );
        expect(req.headers.get("test-auth")).toBe("local-only");
        return protocol === "http/protobuf"
          ? new Response(new Uint8Array(), {
              headers: { "content-type": "application/x-protobuf" },
            })
          : Response.json({});
      },
    });
    const upstream = Bun.serve({
      port: 0,
      fetch(req) {
        parents.push(req.headers.get("traceparent") ?? "");
        return Response.json(
          new URL(req.url).pathname.includes("fixtures")
            ? []
            : { teams: [], elements: [], events: [], element_types: [] },
        );
      },
    });
    const reserve = Bun.serve({ port: 0, fetch: () => new Response() });
    const port = reserve.port!;
    reserve.stop(true);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("OTEL_")),
    );
    const child = Bun.spawn([process.execPath, "tests/fixtures/app.ts"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...env,
        PORT: String(port),
        TEST_UPSTREAM: upstream.url.origin,
        OTEL_EXPORTER_OTLP_ENDPOINT: collector.url.origin,
        OTEL_EXPORTER_OTLP_PROTOCOL: protocol,
        OTEL_SERVICE_NAME: "local-fpl-smoke",
        OTEL_RESOURCE_ATTRIBUTES: "service.name=lower-priority",
        OTEL_SERVICE_VERSION: "smoke-version",
        OTEL_EXPORTER_OTLP_HEADERS: "test-auth=local-only",
        OTEL_METRICS_EXPORTER: "none",
        OTEL_LOGS_EXPORTER: "none",
        OTEL_BSP_SCHEDULE_DELAY: "60000",
      },
    });
    const traceId = "12345678901234567890123456789012";
    const parentId = "1234567890123456";
    const client = new Client({ name: "tracing-test", version: "1" });
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) {
            ready = true;
            break;
          }
        } catch {}
        await Bun.sleep(50);
      }
      expect(ready).toBe(true);
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${port}/mcp`),
          {
            requestInit: {
              headers: { traceparent: `00-${traceId}-${parentId}-01` },
            },
          },
        ),
      );
      const result = await client.callTool({
        name: "list_teams",
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
      expect(parents.length).toBe(2);
      expect(parents.every(value => value.startsWith(`00-${traceId}-`))).toBe(
        true,
      );
      await client.close();
      expect(batches).toHaveLength(0); // Long batch delay: SIGTERM must do the export.
      child.kill("SIGTERM");
      expect(await child.exited).toBe(0);
      const resources = batches.flatMap(batch => batch.resourceSpans);
      expect(resources.length).toBeGreaterThan(0);
      for (const resource of resources) {
        for (const [key, value] of [
          ["service.name", "local-fpl-smoke"],
          ["service.version", "smoke-version"],
        ]) {
          expect(
            resource.resource.attributes.find((a: any) => a.key === key)?.value
              .stringValue,
          ).toBe(value);
        }
      }
      const spans = batches.flatMap(batch =>
        batch.resourceSpans.flatMap((resource: any) =>
          resource.scopeSpans.flatMap((scope: any) => scope.spans),
        ),
      );
      const matching = spans.filter(span => span.traceId === traceId);
      expect(
        matching.some(
          span => span.kind === 2 && span.parentSpanId === parentId,
        ),
      ).toBe(true);
      const tool = matching.find(span => span.name === "mcp.tool list_teams");
      expect(tool).toBeDefined();
      expect(
        matching.filter(
          span => span.kind === 3 && span.parentSpanId === tool.spanId,
        ).length,
      ).toBe(2);
    } finally {
      await client.close().catch(() => {});
      child.kill();
      await child.exited;
      collector.stop(true);
      upstream.stop(true);
    }
  }, 15000);
}
