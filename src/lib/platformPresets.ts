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
    width: 1080,
    height: 1920,
  },
  {
    id: "square",
    label: "Instagram vuông (1:1)",
    width: 1080,
    height: 1080,
  },
  {
    id: "horizontal",
    label: "YouTube dài / Facebook (ngang 16:9)",
    width: 1920,
    height: 1080,
  },
];
