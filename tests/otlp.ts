import { parse } from "protobufjs";

// Minimal OTLP trace schema: unknown fields are skipped by protobufjs.
// Decode real SDK wire bytes rather than treating a non-empty body as success.
const request = parse(`
  syntax = "proto3";
  message AnyValue { string string_value = 1; }
  message KeyValue { string key = 1; AnyValue value = 2; }
  message Resource { repeated KeyValue attributes = 1; }
  message Status { int32 code = 3; }
  message Span {
    bytes trace_id = 1; bytes span_id = 2; bytes parent_span_id = 4;
    string name = 5; int32 kind = 6; Status status = 15;
  }
  message ScopeSpans { repeated Span spans = 2; }
  message ResourceSpans { Resource resource = 1; repeated ScopeSpans scope_spans = 2; }
  message ExportTraceServiceRequest { repeated ResourceSpans resource_spans = 1; }
`).root.lookupType("ExportTraceServiceRequest");

export function decodeTraces(body: ArrayBuffer) {
  const batch = request.toObject(request.decode(new Uint8Array(body)), {
    defaults: true,
  });
  for (const resource of batch.resourceSpans) {
    for (const scope of resource.scopeSpans) {
      for (const span of scope.spans) {
        for (const key of ["traceId", "spanId", "parentSpanId"]) {
          span[key] = Buffer.from(span[key]).toString("hex");
        }
      }
    }
  }
  return batch;
}
