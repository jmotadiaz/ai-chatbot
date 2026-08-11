import { registerOTel } from '@vercel/otel'
import { config } from "config";

export function register() {
  // Avoid noisy/unstable tracing output during local development.
  // Enable explicitly with OTEL_ENABLED=1, or rely on production defaults.
  const isEnabled = config.otelEnabled() || config.nodeEnv() === 'production'
  if (!isEnabled) return

  registerOTel({
    serviceName: 'next-app',
    instrumentations: [
      {
        name: 'ai-instrumentation',
        include: [/^\/api\/ai/]
      }
    ]
  })
}
