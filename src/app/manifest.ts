import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "声音实验室 · 跟读训练",
    short_name: "跟读",
    description: "英剧美剧片段影子跟读训练，30 天练出流利口语",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d0b09",
    theme_color: "#0d0b09",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
