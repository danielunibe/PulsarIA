import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
    globalIgnores([
        "node_modules/**",
        ".next/**",
        "out/**",
        "target/**",
        "target-*/**",
        "src-tauri/target*/**",
    ]),
    {
        extends: [...next],
    },
]);
