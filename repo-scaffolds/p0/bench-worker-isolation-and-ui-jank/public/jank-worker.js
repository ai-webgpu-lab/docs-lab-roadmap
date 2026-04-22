self.onmessage = (event) => {
  const data = event.data || {};
  if (data.type !== "burn") {
    return;
  }

  const startedAt = performance.now();
  let accumulator = 0;

  while (performance.now() - startedAt < data.durationMs) {
    accumulator += Math.sqrt(accumulator + 7.1) * Math.sin(accumulator + 0.25);
  }

  self.postMessage({
    id: data.id,
    durationMs: performance.now() - startedAt
  });
};
