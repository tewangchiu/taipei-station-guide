import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isPrivateIPv4(host) {
  if (isIP(host) !== 4) return false;
  const [first, second] = host.split(".").map(Number);
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

export function resolveServerConfig(env = process.env) {
  const host = env.HOST === undefined ? "127.0.0.1" : env.HOST;
  const portText = env.PORT === undefined ? "4174" : env.PORT;
  if (!/^\d+$/u.test(portText)) throw new Error("PORT must be an integer from 1 to 65535");
  const port = Number(portText);
  if (port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535");
  if (host === "127.0.0.1") return { host, port, mode: "loopback" };
  if (!isPrivateIPv4(host)) {
    throw new Error("HOST must be 127.0.0.1 or an explicit RFC1918 private IPv4 address");
  }
  if (env.GATE4A_LAN_MODE !== "approved") {
    throw new Error("GATE4A_LAN_MODE must equal approved for a non-loopback HOST");
  }
  return { host, port, mode: "lan" };
}

const allowedFiles = new Map([
  ["/", "src/features/manual_visual/index.html"],
  ["/src/features/manual_visual/index.html", "src/features/manual_visual/index.html"],
  ["/src/features/manual_visual/styles.css", "src/features/manual_visual/styles.css"],
  ["/src/features/manual_visual/app.mjs", "src/features/manual_visual/app.mjs"],
  ["/src/features/manual_visual/session.mjs", "src/features/manual_visual/session.mjs"],
  ["/src/features/manual_visual/route_view.mjs", "src/features/manual_visual/route_view.mjs"],
  ["/src/features/manual_visual/route_context.mjs", "src/features/manual_visual/route_context.mjs"],
  ["/src/features/manual_visual/route_map.mjs", "src/features/manual_visual/route_map.mjs"],
  ["/references/official-b1-map-2019.png", "artifacts/route_reference/official_2019/official-b1-map.png"],
  ["/references/official-b1-map-2019.pdf", "artifacts/route_reference/official_2019/official-b1-map-2019.pdf"],
  ["/landmarks/Y28.png", "artifacts/route_reference/run_01_manual_v1/SIM01_Y28_FIXED.png"],
  ["/landmarks/Y26.png", "artifacts/route_reference/run_01_manual_v1/SIM02_Y26_FIXED.png"],
  ["/landmarks/Y23.png", "artifacts/route_reference/run_01_manual_v1/SIM03_Y23_FIXED.png"],
  ["/src/features/visual_localization/capture.mjs", "src/features/visual_localization/capture.mjs"],
  ["/src/features/visual_localization/decode.mjs", "src/features/visual_localization/decode.mjs"],
  ["/src/features/visual_localization/panel.mjs", "src/features/visual_localization/panel.mjs"],
  ["/src/features/visual_localization/ocr_recognizer.mjs", "src/features/visual_localization/ocr_recognizer.mjs"],
  ["/src/features/visual_localization/ocr_diagnostic.mjs", "src/features/visual_localization/ocr_diagnostic.mjs"],
  ["/vendor/tesseract/tesseract.esm.min.js", "node_modules/tesseract.js/dist/tesseract.esm.min.js"],
  ["/vendor/tesseract/worker.min.js", "node_modules/tesseract.js/dist/worker.min.js"],
  ["/vendor/tesseract-core/tesseract-core.wasm.js", "node_modules/tesseract.js-core/tesseract-core.wasm.js"],
  ["/vendor/tesseract-core/tesseract-core-simd.wasm.js", "node_modules/tesseract.js-core/tesseract-core-simd.wasm.js"],
  ["/vendor/tesseract-core/tesseract-core-lstm.wasm.js", "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js"],
  ["/vendor/tesseract-core/tesseract-core-simd-lstm.wasm.js", "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js"],
  ["/vendor/tesseract-core/tesseract-core-relaxedsimd.wasm.js", "node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm.js"],
  ["/vendor/tesseract-core/tesseract-core-relaxedsimd-lstm.wasm.js", "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["/vendor/tessdata/eng.traineddata.gz", "node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz"],
  ["/src/contracts/manual_visual_events.mjs", "src/contracts/manual_visual_events.mjs"],
  ["/src/state/manual_visual_machine.mjs", "src/state/manual_visual_machine.mjs"],
  ["/data/mvp/route_y28_y26_y23.manual-v1.json", "data/mvp/route_y28_y26_y23.manual-v1.json"],
]);

const loopbackOnlyFiles = new Map([
  ["/__test__/visual-localization-ocr", "tests/browser/visual_localization_ocr_smoke.html"],
  ["/__test__/visual-localization-ocr.mjs", "tests/browser/visual_localization_ocr_smoke.mjs"],
]);

const mimeTypes = new Map([
  [".png", "image/png"],
  [".pdf", "application/pdf"],
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".gz", "application/gzip"],
]);

const securityHeaders = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'self'; img-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self'",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

export function resolveRequestPath(url, host) {
  try {
    const pathname = decodeURIComponent(new URL(url, `http://${host}`).pathname);
    const relativePath = allowedFiles.get(pathname)
      ?? (host === "127.0.0.1" ? loopbackOnlyFiles.get(pathname) : null);
    return relativePath ? path.join(repoRoot, relativePath) : null;
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
}

function createManualVisualServer(host) {
  return createServer(async (request, response) => {
    const filePath = resolveRequestPath(request.url ?? "/", host);
    if (!filePath || !["GET", "HEAD"].includes(request.method ?? "")) {
      response.writeHead(filePath ? 405 : 404, {
        ...securityHeaders,
        "content-type": "text/plain; charset=utf-8",
      });
      response.end(filePath ? "Method not allowed\n" : "Not found\n");
      return;
    }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("not a file");
      response.writeHead(200, {
        ...securityHeaders,
        "content-type": mimeTypes.get(path.extname(filePath)) ?? "application/octet-stream",
        "content-length": info.size,
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, {
        ...securityHeaders,
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("Not found\n");
    }
  });
}

function startupMessage({ host, port, mode }) {
  const url = `http://${host}:${port}`;
  if (mode === "loopback") {
    return [
      "Gate 4A manual/visual UI (loopback only)",
      `Bind: ${host}:${port}`,
      `Open: ${url}`,
      "Press Ctrl-C to stop.",
    ].join("\n");
  }
  return [
    "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    "WARNING: APPROVED ISOLATED PRIVATE LAN MODE",
    "Expose this allowlist-only test server only on the controlled trusted LAN.",
    `Bind: ${host}:${port}`,
    `iPhone URL: ${url}`,
    "Press Ctrl-C to stop the server immediately after testing.",
    "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  ].join("\n");
}

function main() {
  const config = resolveServerConfig();
  if (process.argv.includes("--check-config")) {
    process.stdout.write(`Gate 4A server configuration accepted: host=${config.host} port=${config.port} mode=${config.mode}\n`);
    return;
  }
  const server = createManualVisualServer(config.host);
  server.once("error", (error) => {
    process.stderr.write(`Gate 4A server failed to bind ${config.host}:${config.port}: ${error.message}\n`);
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    process.stdout.write(`${startupMessage(config)}\n`);
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Gate 4A server configuration rejected: ${error.message}\n`);
    process.exitCode = 1;
  }
}
