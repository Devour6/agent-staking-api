// Mock for prom-client that works with Jest
class MockRegistry {
  constructor() {
    this._metrics = new Map();
    this._defaultLabels = {};
  }

  setDefaultLabels(labels) {
    this._defaultLabels = labels;
  }

  async metrics() {
    return '# Mock metrics output';
  }

  registerMetric(metric) {
    this._metrics.set(metric.name, metric);
  }
}

class MockHistogram {
  constructor(config) {
    this.name = config.name;
    this.help = config.help;
  }

  observe() {}
  startTimer() {
    return () => {};
  }
  labels() {
    return this;
  }
}

class MockCounter {
  constructor(config) {
    this.name = config.name;
    this.help = config.help;
  }

  inc() {}
  labels() {
    return this;
  }
}

class MockGauge {
  constructor(config) {
    this.name = config.name;
    this.help = config.help;
  }

  set() {}
  inc() {}
  dec() {}
  labels() {
    return this;
  }
}

const mockCollectDefaultMetrics = () => {};

module.exports = {
  Registry: MockRegistry,
  Histogram: MockHistogram,
  Counter: MockCounter,
  Gauge: MockGauge,
  collectDefaultMetrics: mockCollectDefaultMetrics,
  register: new MockRegistry()
};