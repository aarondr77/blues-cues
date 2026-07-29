import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Everything the app needs is same-origin: bundled JS, the vendored MediaPipe
// wasm/model, and blob URLs for the camera stream and the worklet.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' blob:",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  // `frame-ancestors` is header-only; browsers ignore it in a meta tag. Set
  // `Content-Security-Policy: frame-ancestors 'none'` at the web server instead.
].join('; ')

/** Dev keeps its inline HMR scripts; the shipped build gets locked down. */
function securityHeaders(): Plugin {
  return {
    name: 'blues-cues-security-headers',
    apply: 'build',
    transformIndexHtml() {
      return [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
        { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), securityHeaders()],
})
