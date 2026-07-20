"use client";

import { useState } from "react";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { PLATFORM_PRESETS, type PlatformPreset } from "@/lib/platformPresets";

interface TranscriptData {
  text: string;
  segments: { start: number; end: number; text: string }[];
}

interface ClipItem {
  id: string;
  file: File;
  sourceUrl: string;
  duration: number;
  start: number;
  end: number;
  trimmedBlob: Blob | null;
  trimStatus: "idle" | "processing" | "error";
  transcript: TranscriptData | null;
  note: string | null;
}

type PlanStatus = "idle" | "transcribing" | "planning" | "done" | "error";
type CompileStatus = "idle" | "processing" | "done" | "error";

interface TransitionOption {
  id: string;
  label: string;
  xfade: string;
}

const TRANSITION_OPTIONS: TransitionOption[] = [
  { id: "fade", label: "Tan hình", xfade: "fade" },
  { id: "dissolve", label: "Hoà tan", xfade: "dissolve" },
  { id: "wipeleft", label: "Trượt trái", xfade: "wipeleft" },
  { id: "circleopen", label: "Mở vòng tròn", xfade: "circleopen" },
  { id: "zoomin", label: "Phóng to dần", xfade: "zoomin" },
];

const OVERLAY_FONT_URL = "/fonts/DejaVuSans-Bold.ttf";
const MAX_OVERLAY_TEXT_LENGTH = 60;

function formatSeconds(seconds: number) {
  return seconds.toFixed(1);
}

function escapeDrawtext(text: string) {
  return text
    .slice(0, MAX_OVERLAY_TEXT_LENGTH)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "’")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export default function VideoCompiler() {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [topic, setTopic] = useState("");
  const [engineLoading, setEngineLoading] = useState(false);
  const [ffmpegInstance, setFfmpegInstance] = useState<FFmpeg | null>(null);

  const [planStatus, setPlanStatus] = useState<PlanStatus>("idle");
  const [planTitle, setPlanTitle] = useState<string | null>(null);
  const [planError, setPlanError] = useState("");

  const [selectedPresetId, setSelectedPresetId] = useState(
    PLATFORM_PRESETS[2].id
  );
  const [selectedTransitionId, setSelectedTransitionId] = useState(
    TRANSITION_OPTIONS[0].id
  );
  const [overlayText, setOverlayText] = useState("");
  const [compileStatus, setCompileStatus] = useState<CompileStatus>("idle");
  const [compileProgress, setCompileProgress] = useState(0);
  const [compileError, setCompileError] = useState("");
  const [compiledUrl, setCompiledUrl] = useState<string | null>(null);

  const allTrimmed = clips.length >= 2 && clips.every((c) => c.trimmedBlob);

  async function getFfmpeg() {
    if (ffmpegInstance) return ffmpegInstance;

    setEngineLoading(true);
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress }) => {
        setCompileProgress(Math.min(100, Math.round(progress * 100)));
      });
      await ffmpeg.load({
        coreURL: "/ffmpeg/ffmpeg-core.js",
        wasmURL: "/ffmpeg/ffmpeg-core.wasm",
      });
      setFfmpegInstance(ffmpeg);
      return ffmpeg;
    } finally {
      setEngineLoading(false);
    }
  }

  function handleAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const newClips: ClipItem[] = files.map((file) => ({
      id: makeId(),
      file,
      sourceUrl: URL.createObjectURL(file),
      duration: 0,
      start: 0,
      end: 0,
      trimmedBlob: null,
      trimStatus: "idle",
      transcript: null,
      note: null,
    }));
    setClips((prev) => [...prev, ...newClips]);
    e.target.value = "";
  }

  function removeClip(id: string) {
    setClips((prev) => {
      const clip = prev.find((c) => c.id === id);
      if (clip) URL.revokeObjectURL(clip.sourceUrl);
      return prev.filter((c) => c.id !== id);
    });
  }

  function updateClip(id: string, patch: Partial<ClipItem>) {
    setClips((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  function moveClip(id: string, direction: -1 | 1) {
    setClips((prev) => {
      const index = prev.findIndex((c) => c.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function trimClip(id: string) {
    const clip = clips.find((c) => c.id === id);
    if (!clip || clip.end <= clip.start) return;

    updateClip(id, { trimStatus: "processing", transcript: null, note: null });

    try {
      const ffmpeg = await getFfmpeg();
      const { fetchFile } = await import("@ffmpeg/util");
      const inputName =
        "clip-src" + (clip.file.name.match(/\.\w+$/)?.[0] ?? ".mp4");
      const outputName = "clip-output.mp4";

      await ffmpeg.writeFile(inputName, await fetchFile(clip.file));
      await ffmpeg.exec([
        "-ss",
        formatSeconds(clip.start),
        "-i",
        inputName,
        "-t",
        formatSeconds(clip.end - clip.start),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        outputName,
      ]);
      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      updateClip(id, { trimmedBlob: blob, trimStatus: "idle" });

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error(err);
      updateClip(id, { trimStatus: "error" });
    }
  }

  function keepWholeClip(id: string) {
    const clip = clips.find((c) => c.id === id);
    if (!clip || clip.duration <= 0) return;

    updateClip(id, {
      trimmedBlob: clip.file,
      start: 0,
      end: clip.duration,
      trimStatus: "idle",
      transcript: null,
      note: null,
    });
  }

  async function transcribeClip(clip: ClipItem): Promise<TranscriptData> {
    const ffmpeg = await getFfmpeg();
    const { fetchFile } = await import("@ffmpeg/util");
    const inputName = "t-src.mp4";
    const audioName = "t-audio.mp3";

    await ffmpeg.writeFile(inputName, await fetchFile(clip.trimmedBlob!));
    await ffmpeg.exec([
      "-i",
      inputName,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "32k",
      audioName,
    ]);
    const audioData = await ffmpeg.readFile(audioName);
    const audioBlob = new Blob([audioData as BlobPart], {
      type: "audio/mpeg",
    });
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(audioName);

    const formData = new FormData();
    formData.append("audio", audioBlob, "audio.mp3");
    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Có lỗi khi tạo phụ đề.");
    }
    return data;
  }

  async function handlePlanCompilation() {
    if (!allTrimmed) return;

    setPlanError("");
    setPlanTitle(null);

    try {
      setPlanStatus("transcribing");
      const clipsWithTranscripts: ClipItem[] = [];
      for (const clip of clips) {
        if (clip.transcript) {
          clipsWithTranscripts.push(clip);
          continue;
        }
        const transcript = await transcribeClip(clip);
        updateClip(clip.id, { transcript });
        clipsWithTranscripts.push({ ...clip, transcript });
      }

      setPlanStatus("planning");
      const response = await fetch("/api/plan-compilation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          clips: clipsWithTranscripts.map((c) => ({
            id: c.id,
            text: c.transcript?.text ?? "",
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Có lỗi không xác định.");
      }

      const order: string[] = data.order ?? [];
      const notes: { id: string; reason: string }[] = data.notes ?? [];
      const noteById = new Map(notes.map((n) => [n.id, n.reason]));

      setClips((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        const ordered = order
          .map((id) => byId.get(id))
          .filter((c): c is ClipItem => Boolean(c));
        const remaining = prev.filter((c) => !order.includes(c.id));
        return [...ordered, ...remaining].map((c) => ({
          ...c,
          note: noteById.get(c.id) ?? c.note,
        }));
      });
      setPlanTitle(data.title ?? null);
      setOverlayText((prev) => prev || data.title || "");
      setPlanStatus("done");
    } catch (err) {
      console.error(err);
      setPlanError(
        err instanceof Error
          ? err.message
          : "Có lỗi khi sắp xếp bằng AI. Thử lại sau."
      );
      setPlanStatus("error");
    }
  }

  async function handleCompile(preset: PlatformPreset, transition: TransitionOption) {
    if (!allTrimmed) return;

    setCompileError("");
    setCompiledUrl(null);
    setCompileProgress(0);
    setCompileStatus("processing");

    try {
      const ffmpeg = await getFfmpeg();
      const { fetchFile } = await import("@ffmpeg/util");

      const trimmedOverlayText = overlayText.trim();
      if (trimmedOverlayText) {
        await ffmpeg.writeFile("overlay-font.ttf", await fetchFile(OVERLAY_FONT_URL));
      }

      const durations = clips.map((c) => c.end - c.start);
      // Độ dài hiệu ứng chuyển cảnh: không dài hơn 1/3 đoạn ngắn nhất, để tránh lỗi khi có đoạn rất ngắn.
      const fadeDuration = Math.max(
        0.15,
        Math.min(0.5, Math.min(...durations) / 3)
      );

      const normalizedNames: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        const srcName = `c${i}-src.mp4`;
        const normName = `c${i}-norm.mp4`;
        await ffmpeg.writeFile(srcName, await fetchFile(clips[i].trimmedBlob!));
        await ffmpeg.exec([
          "-i",
          srcName,
          "-vf",
          `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=increase,crop=${preset.width}:${preset.height},setsar=1`,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-c:a",
          "aac",
          "-r",
          "30",
          normName,
        ]);
        await ffmpeg.deleteFile(srcName);
        normalizedNames.push(normName);
      }

      // Nối các đoạn bằng hiệu ứng tan hình (xfade/acrossfade) thay vì cắt cứng,
      // để chuyển cảnh giữa các video mượt hơn.
      let videoLabel = "0:v";
      let audioLabel = "0:a";
      let runningDuration = durations[0];
      const filterParts: string[] = [];
      for (let i = 1; i < clips.length; i++) {
        const offset = Math.max(0, runningDuration - fadeDuration);
        const nextVideoLabel = `v${i}`;
        const nextAudioLabel = `a${i}`;
        filterParts.push(
          `[${videoLabel}][${i}:v]xfade=transition=${transition.xfade}:duration=${fadeDuration.toFixed(3)}:offset=${offset.toFixed(3)}[${nextVideoLabel}]`
        );
        filterParts.push(
          `[${audioLabel}][${i}:a]acrossfade=d=${fadeDuration.toFixed(3)}[${nextAudioLabel}]`
        );
        videoLabel = nextVideoLabel;
        audioLabel = nextAudioLabel;
        runningDuration = runningDuration + durations[i] - fadeDuration;
      }

      if (trimmedOverlayText) {
        const escaped = escapeDrawtext(trimmedOverlayText);
        filterParts.push(
          `[${videoLabel}]drawtext=fontfile=overlay-font.ttf:text='${escaped}':fontsize=${Math.round(preset.width / 18)}:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=16:x=(w-text_w)/2:y=h-text_h-60[vtext]`
        );
        videoLabel = "vtext";
      }

      const inputArgs = normalizedNames.flatMap((name) => ["-i", name]);
      const finalName = "final.mp4";
      await ffmpeg.exec([
        ...inputArgs,
        "-filter_complex",
        filterParts.join(";"),
        "-map",
        `[${videoLabel}]`,
        "-map",
        `[${audioLabel}]`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        finalName,
      ]);

      const data = await ffmpeg.readFile(finalName);
      const blob = new Blob([data as BlobPart], { type: "video/mp4" });
      setCompiledUrl(URL.createObjectURL(blob));
      setCompileStatus("done");

      for (const name of normalizedNames) {
        await ffmpeg.deleteFile(name);
      }
      await ffmpeg.deleteFile(finalName);
      if (trimmedOverlayText) {
        await ffmpeg.deleteFile("overlay-font.ttf");
      }
    } catch (err) {
      console.error(err);
      setCompileError(
        "Có lỗi khi ghép video. Kiểm tra lại các đoạn đã cắt và thử lại."
      );
      setCompileStatus("error");
    }
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 p-8 text-center hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500">
        <span className="font-medium text-black dark:text-zinc-50">
          Bấm để thêm video (có thể chọn nhiều lần)
        </span>
        <span className="text-sm text-zinc-500">
          Video không được tải lên máy chủ nào — mọi xử lý diễn ra ngay trên
          trình duyệt của bạn.
        </span>
        <input
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={handleAddFiles}
        />
      </label>

      {clips.map((clip, index) => (
        <div
          key={clip.id}
          className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="flex items-center justify-between">
            <p className="font-medium text-black dark:text-zinc-50">
              Video {index + 1}: {clip.file.name}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => moveClip(clip.id, -1)}
                disabled={index === 0}
                className="rounded border border-black/[.08] px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/[.145]"
              >
                ▲
              </button>
              <button
                onClick={() => moveClip(clip.id, 1)}
                disabled={index === clips.length - 1}
                className="rounded border border-black/[.08] px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/[.145]"
              >
                ▼
              </button>
              <button
                onClick={() => removeClip(clip.id)}
                className="rounded border border-black/[.08] px-2 py-1 text-xs text-red-600 dark:border-white/[.145]"
              >
                Xoá
              </button>
            </div>
          </div>

          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={clip.sourceUrl}
            controls
            className="w-full rounded-lg bg-black"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              updateClip(clip.id, { duration: d, start: 0, end: d });
            }}
          />

          {clip.duration > 0 && (
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex flex-col gap-1">
                <span>Bắt đầu: {formatSeconds(clip.start)}s</span>
                <input
                  type="range"
                  min={0}
                  max={clip.duration}
                  step={0.1}
                  value={clip.start}
                  onChange={(e) =>
                    updateClip(clip.id, {
                      start: Math.min(Number(e.target.value), clip.end),
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Kết thúc: {formatSeconds(clip.end)}s</span>
                <input
                  type="range"
                  min={0}
                  max={clip.duration}
                  step={0.1}
                  value={clip.end}
                  onChange={(e) =>
                    updateClip(clip.id, {
                      end: Math.max(Number(e.target.value), clip.start),
                    })
                  }
                />
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => trimClip(clip.id)}
              disabled={
                clip.end <= clip.start ||
                engineLoading ||
                clip.trimStatus === "processing"
              }
              className="w-fit rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              {engineLoading
                ? "Đang tải công cụ…"
                : clip.trimStatus === "processing"
                  ? "Đang cắt…"
                  : "Chỉ dùng đoạn đã chọn"}
            </button>
            <button
              onClick={() => keepWholeClip(clip.id)}
              disabled={clip.duration <= 0}
              className="w-fit rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Giữ nguyên cả video
            </button>
          </div>

          {clip.trimStatus === "error" && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Có lỗi khi cắt đoạn này. Thử lại với khoảng thời gian khác.
            </p>
          )}
          {clip.trimmedBlob && (
            <p className="text-sm text-green-700 dark:text-green-400">
              {clip.end - clip.start >= clip.duration - 0.05
                ? `Sẽ dùng toàn bộ video (${formatSeconds(clip.duration)}s)`
                : `Đã chọn đoạn ${formatSeconds(clip.end - clip.start)}s`}
            </p>
          )}
          {clip.note && (
            <p className="text-sm text-zinc-500">Gợi ý AI: {clip.note}</p>
          )}
        </div>
      ))}

      {clips.length >= 2 && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-black dark:text-zinc-50">
              Sắp xếp bằng AI
            </p>
            <p className="text-sm text-zinc-500">
              Nêu chủ đề (không bắt buộc), AI sẽ đọc nội dung các đoạn đã cắt
              và gợi ý thứ tự hợp lý. Bạn có thể chỉnh lại bằng nút ▲▼ ở trên.
            </p>
          </div>

          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ví dụ: video giới thiệu chuyến du lịch Đà Lạt"
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
          />

          <button
            onClick={handlePlanCompilation}
            disabled={
              !allTrimmed ||
              planStatus === "transcribing" ||
              planStatus === "planning"
            }
            className="w-fit rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            {planStatus === "transcribing" && "Đang tạo phụ đề từng đoạn…"}
            {planStatus === "planning" && "Đang sắp xếp…"}
            {(planStatus === "idle" ||
              planStatus === "done" ||
              planStatus === "error") &&
              "Sắp xếp bằng AI"}
          </button>

          {!allTrimmed && (
            <p className="text-sm text-zinc-500">
              Cần cắt xong tất cả các đoạn ở trên trước khi sắp xếp.
            </p>
          )}

          {planError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {planError}
            </p>
          )}

          {planTitle && (
            <p className="text-sm">
              <span className="font-medium text-black dark:text-zinc-50">
                Tiêu đề gợi ý:{" "}
              </span>
              {planTitle}
            </p>
          )}
        </div>
      )}

      {clips.length >= 2 && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-black dark:text-zinc-50">
              Ghép thành video
            </p>
            <p className="text-sm text-zinc-500">
              Video xuất ra ở độ phân giải Full HD (1080p).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {PLATFORM_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setSelectedPresetId(preset.id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium ${
                  selectedPresetId === preset.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-500">Kiểu chuyển cảnh giữa các đoạn:</p>
            <div className="flex flex-wrap gap-2">
              {TRANSITION_OPTIONS.map((transition) => (
                <button
                  key={transition.id}
                  onClick={() => setSelectedTransitionId(transition.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium ${
                    selectedTransitionId === transition.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-black/[.08] hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                  }`}
                >
                  {transition.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-500">
              Chữ hiển thị trên video (không bắt buộc, tối đa{" "}
              {MAX_OVERLAY_TEXT_LENGTH} ký tự):
            </span>
            <input
              type="text"
              value={overlayText}
              maxLength={MAX_OVERLAY_TEXT_LENGTH}
              onChange={(e) => setOverlayText(e.target.value)}
              placeholder="Ví dụ: Chuyến du lịch Đà Lạt"
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
          </label>

          <button
            onClick={() =>
              handleCompile(
                PLATFORM_PRESETS.find((p) => p.id === selectedPresetId) ??
                  PLATFORM_PRESETS[0],
                TRANSITION_OPTIONS.find((t) => t.id === selectedTransitionId) ??
                  TRANSITION_OPTIONS[0]
              )
            }
            disabled={
              !allTrimmed || engineLoading || compileStatus === "processing"
            }
            className="w-fit rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {engineLoading && "Đang tải công cụ…"}
            {!engineLoading &&
              compileStatus === "processing" &&
              `Đang ghép… ${compileProgress}%`}
            {!engineLoading &&
              (compileStatus === "idle" ||
                compileStatus === "done" ||
                compileStatus === "error") &&
              "Ghép thành video"}
          </button>

          {!allTrimmed && (
            <p className="text-sm text-zinc-500">
              Cần cắt xong tất cả các đoạn ở trên trước khi ghép.
            </p>
          )}

          {compileError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {compileError}
            </p>
          )}

          {compiledUrl && (
            <div className="flex flex-col gap-2">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={compiledUrl}
                controls
                className="w-full rounded-lg bg-black"
              />
              <a
                href={compiledUrl}
                download="video-tong-hop.mp4"
                className="w-fit rounded-full border border-black/[.08] px-5 py-2 text-sm font-medium hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                Tải video xuống
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
