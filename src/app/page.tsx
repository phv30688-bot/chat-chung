import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center gap-6 py-32 px-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          ChatChung
        </h1>
        <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Ứng dụng đang được xây dựng từng bước. Bắt đầu với tính năng đầu
          tiên: cắt video ngay trên trình duyệt của bạn, không cần tải lên
          máy chủ.
        </p>
        <Link
          href="/edit"
          className="rounded-full bg-foreground px-6 py-3 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Thử cắt video
        </Link>
      </main>
    </div>
  );
}
