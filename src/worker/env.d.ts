/// <reference types="@cloudflare/workers-types" />

// Ambient declaration for Worker environment bindings
interface Env {
  DB: D1Database;
}
