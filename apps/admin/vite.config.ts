import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/admin/",
  envDir: false,
  plugins: [react(), tailwind()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "**/*.env",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "**/.local/**",
        "**/.netlify/**",
        "**/.aws/**",
        "**/.azure/**",
        "**/.ssh/**",
        "**/.gnupg/**",
        "**/private/**",
        "**/secrets/**",
        "**/.secrets/**",
        "**/backups/**",
        "**/credentials*.json",
        "**/service-account*.json",
        "**/*-state*.json",
        "**/cookies*.json",
        "**/playwright/.auth/**",
      ],
    },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.API_PORT ?? "8787"}`,
        changeOrigin: false,
      },
    },
  },
});
