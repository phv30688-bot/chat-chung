export interface PlatformPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: "vertical",
    label: "TikTok / YouTube Shorts / Reels (dọc 9:16)",
    width: 720,
    height: 1280,
  },
  {
    id: "square",
    label: "Instagram vuông (1:1)",
    width: 720,
    height: 720,
  },
  {
    id: "horizontal",
    label: "YouTube dài / Facebook (ngang 16:9)",
    width: 1280,
    height: 720,
  },
];
