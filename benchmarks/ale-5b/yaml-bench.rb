require 'json'
require 'yaml'
require 'benchmark'

corpus = JSON.parse(File.read(ARGV.fetch(0)))
iterations = Integer(ENV.fetch('ALE_BENCH_ITERATIONS', '40'))
samples = Integer(ENV.fetch('ALE_BENCH_SAMPLES', '9'))
records = corpus.map do |entry|
  yaml = YAML.dump(entry.fetch('value'))
  decoded = YAML.safe_load(yaml, permitted_classes: [], permitted_symbols: [], aliases: false)
  { 'id' => entry.fetch('id'), 'yaml' => yaml, 'decoded' => decoded }
end

def measure(records, iterations, samples, &block)
  3.times { iterations.times { records.each { |record| block.call(record) } } }
  times = samples.times.map do
    start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    iterations.times { records.each { |record| block.call(record) } }
    (Process.clock_gettime(Process::CLOCK_MONOTONIC) - start) * 1000.0
  end
  sorted = times.sort
  { 'medianMs' => sorted[sorted.length / 2], 'p95Ms' => sorted[[(sorted.length * 0.95).ceil - 1, sorted.length - 1].min] }
end

serialization = measure(corpus, iterations, samples) { |entry| YAML.dump(entry.fetch('value')) }
parsing = measure(records, iterations, samples) do |record|
  YAML.safe_load(record.fetch('yaml'), permitted_classes: [], permitted_symbols: [], aliases: false)
end
round_trip = measure(corpus, iterations, samples) do |entry|
  YAML.safe_load(YAML.dump(entry.fetch('value')), permitted_classes: [], permitted_symbols: [], aliases: false)
end
puts JSON.generate({
  'psychVersion' => Psych::VERSION,
  'rubyVersion' => RUBY_VERSION,
  'yamlRecords' => records,
  'serialization' => serialization,
  'parsing' => parsing,
  'roundTrip' => round_trip,
  'iterationsPerSample' => iterations,
  'samples' => samples
})
