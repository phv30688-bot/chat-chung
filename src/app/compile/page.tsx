import VideoCompiler from "@/components/VideoCompiler";

export default function CompilePage() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Ghép nhiều video theo chủ đề
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Tải lên vài video, cắt mỗi video thành một đoạn bạn muốn dùng, để AI
          gợi ý thứ tự rồi ghép thành 1 video dài.
        </p>
      </div>
      <VideoCompiler />
    </div>
  );
}
