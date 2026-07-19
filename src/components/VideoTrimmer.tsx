"use client";

import { useRef, useState } from "react";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

type Status =
  | "idle"
  | "loading-engine"
  | "processing"
  | "done"
  | "error";

function formatSeconds(seconds: number) {
  return seconds.toFixed(1);
}

export default function VideoTrimmer() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const ffmpegRef = useRef<FFmpeg | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setOutputUrl(null);
    setStatus("idle");
    setErrorMessage("");
    setFile(selected);
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(selected ? URL.createObjectURL(selected) : null);
  }

  function handleLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const videoDuration = e.currentTarget.duration;
    setDuration(videoDuration);
    setStart(0);
    setEnd(videoDuration);
  }

  async function getFfmpeg() {
    if (ffmpegRef.current) return ffmpegRef.current;

    setStatus("loading-engine");
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress: ratio }) => {
      setProgress(Math.min(100, Math.round(ratio * 100)));
    });
    await ffmpeg.load({
      coreURL: "/ffmpeg/ffmpeg-core.js",
      wasmURL: "/ffmpeg/ffmpeg-core.wasm",
    });
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  }

  async function handleTrim() {
    if (!file || end <= start) return;

    setErrorMessage("");
    setOutputUrl(null);
    setProgress(0);

    try {
      const ffmpeg = await getFfmpeg();
      setStatus("processing");

      const { fetchFile } = await import("@ffmpeg/util");
      const inputName = "input" + (file.name.match(/\.\w+$/)?.[0] ?? ".mp4");
      const outputName = "output.mp4";

      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec([
        "-ss",
        formatSeconds(start),
        "-i",
        inputName,
        "-t",
        formatSeconds(end - start),
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
      setOutputUrl(URL.createObjectURL(blob));
      setStatus("done");

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error(err);
      setErrorMessage(
        "Có lỗi khi xử lý video. Thử lại với video khác hoặc đoạn cắt ngắn hơn."
      );
      setStatus("error");
    }
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 p-8 text-center hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500">
        <span className="font-medium text-black dark:text-zinc-50">
          {file ? file.name : "Bấm để chọn video từ máy của bạn"}
        </span>
        <span className="text-sm text-zinc-500">
          Video không được tải lên máy chủ nào — mọi xử lý diễn ra ngay trên
          trình duyệt của bạn.
        </span>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {sourceUrl && (
        <div className="flex flex-col gap-4">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={sourceUrl}
            controls
            onLoadedMetadata={handleLoadedMetadata}
            className="w-full rounded-lg bg-black"
          />

          {duration > 0 && (
            <div className="flex flex-col gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span>Bắt đầu: {formatSeconds(start)}s</span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={start}
                  onChange={(e) =>
                    setStart(Math.min(Number(e.target.value), end))
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Kết thúc: {formatSeconds(end)}s</span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={end}
                  onChange={(e) =>
                    setEnd(Math.max(Number(e.target.value), start))
                  }
                />
              </label>
              <p className="text-zinc-500">
                Đoạn được giữ lại: {formatSeconds(end - start)} giây (trên
                tổng {formatSeconds(duration)} giây)
              </p>
            </div>
          )}

          <button
            onClick={handleTrim}
            disabled={
              !file ||
              end <= start ||
              status === "loading-engine" ||
              status === "processing"
            }
            className="rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {status === "loading-engine" && "Đang tải công cụ xử lý video…"}
            {status === "processing" && `Đang cắt video… ${progress}%`}
            {(status === "idle" || status === "done" || status === "error") &&
              "Cắt video"}
          </button>

          {errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}

          {outputUrl && (
            <div className="flex flex-col gap-2">
              <p className="font-medium text-black dark:text-zinc-50">
                Kết quả:
              </p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={outputUrl} controls className="w-full rounded-lg bg-black" />
              <a
                href={outputUrl}
                download="video-da-cat.mp4"
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
