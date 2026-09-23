import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  isTracingSuppressed,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Server, type IncomingMessage, type ServerResponse } from "node:http";

// Bun does not support Node's import-in-the-middle hooks. Instrument the actual
// node:http boundary used by FastMCP and Bun's native fetch explicitly instead.
// Exporter, protocol, credentials, identity and sampling come from OTEL_* only.
const sdk = new NodeSDK({
  // envDetector retains precedence for OTEL_RESOURCE_ATTRIBUTES / OTEL_SERVICE_NAME.
  resource: process.env.OTEL_SERVICE_VERSION
    ? resourceFromAttributes({
        "service.version": process.env.OTEL_SERVICE_VERSION,
      })
    : undefined,
  contextManager: new AsyncLocalStorageContextManager(),
  textMapPropagator: new W3CTraceContextPropagator(),
});
sdk.start();
const tracer = trace.getTracer("fpl-mcp");

const originalEmit = Server.prototype.emit;
Server.prototype.emit = function (
  event: string | symbol,
  ...args: any[]
): boolean {
  if (event !== "request")
    return Reflect.apply(originalEmit, this, [event, ...args]);
  const [req, res] = args as [IncomingMessage, ServerResponse];
  const path = (req.url ?? "/").split("?")[0];
  const route = ["/mcp", "/sse", "/healthz"].includes(path!) ? path! : "other";
  const parent = propagation.extract(ROOT_CONTEXT, req.headers);
  const span = tracer.startSpan(
    `${req.method} ${route}`,
    {
      kind: SpanKind.SERVER,
      attributes: {
        "http.request.method": req.method ?? "GET",
        "http.route": route,
      },
    },
    parent,
  );
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    span.setAttribute("http.response.status_code", res.statusCode);
    if (res.statusCode >= 500 || !res.writableFinished)
      span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  };
  res.once("finish", end);
  res.once("close", end);
  return context.with(trace.setSpan(parent, span), () => {
    try {
      return Reflect.apply(originalEmit, this, [event, ...args]);
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException({
        name: "RequestError",
        message: "HTTP handler failed",
      });
      end();
      throw error;
    }
  });
};

const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (isTracingSuppressed(context.active()))
      return originalFetch(input, init);
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");
    return tracer.startActiveSpan(
      `HTTP ${method}`,
      {
        kind: SpanKind.CLIENT,
        // Deliberately omit query strings, bodies, headers and exception messages.
        attributes: {
          "http.request.method": method,
          "server.address": url.hostname,
          "server.port": Number(
            url.port || (url.protocol === "https:" ? 443 : 80),
          ),
        },
      },
      async span => {
        try {
          const headers = new Headers(
            init?.headers ??
              (input instanceof Request ? input.headers : undefined),
          );
          propagation.inject(context.active(), headers, {
            set: (carrier, key, value) => carrier.set(key, value),
          });
          const response = await originalFetch(input, { ...init, headers });
          span.setAttribute("http.response.status_code", response.status);
          if (response.status >= 400)
            span.setStatus({ code: SpanStatusCode.ERROR });
          return response;
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.recordException({
            name: "FetchError",
            message: "Outbound HTTP request failed",
          });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  },
  originalFetch,
);

let shutdownPromise: Promise<void> | undefined;
export const shutdownTelemetry = () => (shutdownPromise ??= sdk.shutdown());
