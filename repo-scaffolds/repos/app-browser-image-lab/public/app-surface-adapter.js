// App surface adapter contract for app-blackhole-observatory.
//
// A real app surface (production demo, integrated dashboard, etc.) graduates
// from the deterministic harness by implementing this shape and registering
// itself before app.js boots:
//
//   window.__aiWebGpuLabAppSurfaceRegistry.register(mySurface);
//
// The harness consults the registry only when it needs surface metadata for the
// result draft. Existing deterministic scenarios stay unchanged.

class AppSurfaceAdapterRegistry {
  constructor() {
    this.adapters = new Map();
    this.deterministic = {
      id: "deterministic-observatory",
      label: "Deterministic Observatory",
      version: "1.0.0",
      capabilities: ["preset-replay", "renderer-scorecard", "telemetry-record"],
      surfaceType: "synthetic",
      isReal: false
    };
  }

  register(adapter) {
    if (!adapter || typeof adapter !== "object") {
      throw new Error("app surface adapter must be an object");
    }
    for (const field of ["id", "label", "version"]) {
      if (typeof adapter[field] !== "string" || !adapter[field]) {
        throw new Error(`app surface adapter.${field} is required`);
      }
    }
    for (const method of ["loadDataset", "renderSurface", "recordTelemetry"]) {
      if (typeof adapter[method] !== "function") {
        throw new Error(`app surface adapter.${method} must be a function`);
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
          label: "App Surface Adapter Stub (not connected)",
          status: "not-connected",
          isReal: false,
          version: "n/a",
          capabilities: this.deterministic.capabilities,
          surfaceType: "stub",
          message: `No real app surface adapter has registered for mode='${modeId}'. Falling back to the deterministic harness.`
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
        surfaceType: primary.surfaceType || "unknown",
        message: `Real app surface adapter '${primary.id}' is connected.`
      };
    }
    return {
      ...this.deterministic,
      status: "deterministic",
      message: "Deterministic harness — replace by registering a real app surface adapter."
    };
  }
}

if (typeof window !== "undefined") {
  if (!window.__aiWebGpuLabAppSurfaceRegistry) {
    window.__aiWebGpuLabAppSurfaceRegistry = new AppSurfaceAdapterRegistry();
  }
}

export { AppSurfaceAdapterRegistry };
