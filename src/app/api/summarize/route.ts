import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkUsageLimit, recordUsage, usageLimitResponse } from "@/lib/usageLimit";

export const runtime = "nodejs";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

// Giới hạn độ dài transcript gửi cho Claude để chi phí mỗi lượt luôn có trần dự đoán được.
const MAX_TRANSCRIPT_CHARS = 15000;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Tiêu đề ngắn, hấp dẫn cho video" },
    description: { type: "string", description: "Mô tả/caption ngắn cho video" },
    hashtags: { type: "array", items: { type: "string" } },
    keep_segments: {
      type: "array",
      description:
        "Các đoạn thời gian (giây) nên giữ lại để video ngắn gọn hơn nhưng vẫn đủ ý chính",
      items: {
        type: "object",
        properties: {
          start: { type: "number" },
          end: { type: "number" },
        },
        required: ["start", "end"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "description", "hashtags", "keep_segments"],
  additionalProperties: false,
} as const;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server chưa cấu hình ANTHROPIC_API_KEY." },
      { status: 500 }
    );
  }

  const { allowed, count } = checkUsageLimit(req);
  if (!allowed) {
    return usageLimitResponse();
  }

  const body = await req.json();
  const segments: TranscriptSegment[] = body?.segments ?? [];
  const fullText: string = body?.text ?? "";

  if (!fullText.trim()) {
    return NextResponse.json(
      { error: "Không có nội dung văn bản để phân tích." },
      { status: 400 }
    );
  }

  const transcriptForPrompt = (
    segments.length
      ? segments
          .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
          .join("\n")
      : fullText
  ).slice(0, MAX_TRANSCRIPT_CHARS);

  const client = new Anthropic({ apiKey });

  const aiResponse = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system:
      "Bạn là trợ lý biên tập video ngắn. Dựa vào bản chép lời (transcript) có mốc thời gian, hãy: (1) gợi ý tiêu đề ngắn hấp dẫn, (2) viết mô tả/caption ngắn, (3) gợi ý 3-5 hashtag liên quan, (4) chọn ra các đoạn thời gian (start, end tính bằng giây) nên GIỮ LẠI để video ngắn gọn hơn nhưng vẫn đủ ý chính — bỏ các đoạn lan man, lặp lại, hoặc im lặng dài. Luôn trả lời bằng đúng ngôn ngữ của transcript.",
    messages: [
      {
        role: "user",
        content: `Transcript có mốc thời gian:\n\n${transcriptForPrompt}`,
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
  });

  const textBlock = aiResponse.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json(
      { error: "Claude không trả về kết quả hợp lệ." },
      { status: 502 }
    );
  }

  const result = JSON.parse(textBlock.text);
  const res = NextResponse.json(result);
  recordUsage(res, count);
  return res;
}
