// Benchmark adapter contract for bench-renderer-shootout.
//
// A real benchmark suite (renderer comparison, runtime shootout, parity check)
// graduates from the deterministic harness by implementing this shape and
// registering itself before app.js boots:
//
//   window.__aiWebGpuLabBenchmarkRegistry.register(myBenchmark);
//
// The harness consults the registry only when it needs benchmark metadata for
// the result draft. Existing deterministic scenarios stay unchanged.

class BenchmarkAdapterRegistry {
  constructor() {
    this.adapters = new Map();
    this.deterministic = {
      id: "deterministic-renderer-shootout",
      label: "Deterministic Renderer Shootout",
      version: "1.0.0",
      capabilities: ["profile-comparison", "winner-selection", "fallback-pair"],
      benchmarkType: "synthetic",
      isReal: false
    };
  }

  register(adapter) {
    if (!adapter || typeof adapter !== "object") {
      throw new Error("benchmark adapter must be an object");
    }
    for (const field of ["id", "label", "version"]) {
      if (typeof adapter[field] !== "string" || !adapter[field]) {
        throw new Error(`benchmark adapter.${field} is required`);
      }
    }
    for (const method of ["createBenchmark", "runProfile", "aggregateResults"]) {
      if (typeof adapter[method] !== "function") {
        throw new Error(`benchmark adapter.${method} must be a function`);
      }
    }
    this.adapters.set(adapter.id, {
      ...adapter,
      isReal: true,
      capabilities: Array.isArray(adapter.capabilities) ? adapter.capabilities : []
    });
    return adapter.id;
  }

  list() {
    return [...this.adapters.values()];
  }

  describe(modeId) {
    const reportRealAdapter = modeId === "adapter-stub" || (typeof modeId === "string" && modeId.startsWith("real-"));
    if (reportRealAdapter) {
      const registered = [...this.adapters.values()];
      if (registered.length === 0) {
        return {
          id: "stub-not-connected",
          label: "Benchmark Adapter Stub (not connected)",
          status: "not-connected",
          isReal: false,
          version: "n/a",
          capabilities: this.deterministic.capabilities,
          benchmarkType: "stub",
          message: `No real benchmark adapter has registered for mode='${modeId}'. Falling back to the deterministic harness.`
        };
      }
      const primary = registered[0];
      return {
        id: primary.id,
        label: primary.label,
        status: "connected",
        isReal: true,
        version: primary.version,
        capabilities: primary.capabilities,
        benchmarkType: primary.benchmarkType || "unknown",
        message: `Real benchmark adapter '${primary.id}' is connected.`
      };
    }
    return {
      ...this.deterministic,
      status: "deterministic",
      message: "Deterministic harness — replace by registering a real benchmark adapter."
    };
  }
}

if (typeof window !== "undefined") {
  if (!window.__aiWebGpuLabBenchmarkRegistry) {
    window.__aiWebGpuLabBenchmarkRegistry = new BenchmarkAdapterRegistry();
  }
}

export { BenchmarkAdapterRegistry };
