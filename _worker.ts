import app from "./src/worker/index";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route API ke Hono app
    if (url.pathname.startsWith("/api")) {
      return app.fetch(request, env, ctx);
    }

    // Selain itu, layani aset statis (SPA fallback akan di-handle oleh konfigurasi Assets/_redirects)
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    // Fallback terakhir: kembalikan 404 jika ASSETS tidak tersedia
    return new Response("Not Found", { status: 404 });
  },
};
