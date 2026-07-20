import { NextRequest, NextResponse } from "next/server";

// Giới hạn tạm thời theo cookie trình duyệt (không cần đăng nhập) để tránh
// một trình duyệt gọi AI không giới hạn trong giai đoạn mời người dùng thử
// nghiệm sớm. Đây KHÔNG phải hàng rào chống lạm dụng thật sự (xoá cookie là
// bỏ qua được) — trước khi ra mắt công khai cần thay bằng giới hạn theo tài
// khoản (Supabase).
export const DAILY_AI_LIMIT = 8;

const COOKIE_NAME = "cc_ai_usage";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function checkUsageLimit(req: NextRequest): {
  allowed: boolean;
  count: number;
} {
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  let count = 0;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.date === todayKey() && typeof parsed.count === "number") {
        count = parsed.count;
      }
    } catch {
      count = 0;
    }
  }
  return { allowed: count < DAILY_AI_LIMIT, count };
}

export function usageLimitResponse() {
  return NextResponse.json(
    {
      error: `Bạn đã dùng hết ${DAILY_AI_LIMIT} lượt xử lý AI miễn phí hôm nay. Vui lòng quay lại vào ngày mai.`,
    },
    { status: 429 }
  );
}

export function recordUsage(res: NextResponse, currentCount: number) {
  res.cookies.set(
    COOKIE_NAME,
    JSON.stringify({ date: todayKey(), count: currentCount + 1 }),
    {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    }
  );
}
