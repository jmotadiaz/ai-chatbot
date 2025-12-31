import { registerOTel } from '@vercel/otel'

export function register() {
  // Avoid noisy/unstable tracing output during local development.
  // Enable explicitly with OTEL_ENABLED=1, or rely on production defaults.
  const isEnabled = process.env.OTEL_ENABLED === '1' || process.env.NODE_ENV === 'production'
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
