const port = process.env.PORT || 3000;
process.env.PORT = port.toString();

console.log(`[Orient Hub Launcher] Starting Nitro production server on port ${port}...`);

import("./dist/server/index.mjs");
