import VideoTrimmer from "@/components/VideoTrimmer";

export default function EditPage() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="flex w-full max-w-xl flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Cắt video
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Chọn một video và kéo thanh trượt để chọn đoạn muốn giữ lại.
        </p>
      </div>
      <VideoTrimmer />
    </div>
  );
}
