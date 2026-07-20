import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkUsageLimit, recordUsage, usageLimitResponse } from "@/lib/usageLimit";

export const runtime = "nodejs";

interface ClipInput {
  id: string;
  text: string;
}

// Giới hạn độ dài transcript mỗi đoạn gửi cho Claude để tổng chi phí mỗi lượt có trần dự đoán được.
const MAX_CHARS_PER_CLIP = 4000;
const MAX_CLIPS = 8;

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
  const topic: string = body?.topic ?? "";
  const clips: ClipInput[] = (body?.clips ?? []).slice(0, MAX_CLIPS);

  if (clips.length < 2) {
    return NextResponse.json(
      { error: "Cần ít nhất 2 đoạn video đã có phụ đề để sắp xếp." },
      { status: 400 }
    );
  }

  const clipIds = clips.map((c) => c.id);

  const responseSchema = {
    type: "object",
    properties: {
      title: { type: "string", description: "Tiêu đề gợi ý cho video tổng hợp" },
      order: {
        type: "array",
        description: "Thứ tự các đoạn (theo id) để ghép thành video mạch lạc",
        items: { type: "string", enum: clipIds },
      },
      notes: {
        type: "array",
        description: "Lý do ngắn gọn cho việc đặt mỗi đoạn ở vị trí đó",
        items: {
          type: "object",
          properties: {
            id: { type: "string", enum: clipIds },
            reason: { type: "string" },
          },
          required: ["id", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "order", "notes"],
    additionalProperties: false,
  } as const;

  const clipsForPrompt = clips
    .map(
      (c, i) =>
        `Đoạn [id=${c.id}] (thứ tự tải lên: ${i + 1}):\n${c.text.slice(0, MAX_CHARS_PER_CLIP)}`
    )
    .join("\n\n");

  const client = new Anthropic({ apiKey });

  const aiResponse = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system:
      "Bạn là biên tập viên video. Người dùng đưa cho bạn nhiều đoạn clip (mỗi đoạn có id và bản chép lời) cùng một chủ đề mong muốn. Hãy sắp xếp lại thứ tự các đoạn (dùng đúng id đã cho, không tự bịa id mới) sao cho khi ghép nối tiếp nhau tạo thành một video mạch lạc, đúng chủ đề. Đặt tiêu đề tổng cho video, và giải thích ngắn gọn (1 câu) lý do mỗi đoạn ở vị trí đó. Luôn trả lời bằng đúng ngôn ngữ của các đoạn transcript.",
    messages: [
      {
        role: "user",
        content: `Chủ đề mong muốn: ${topic || "(không nêu rõ, hãy tự suy ra từ nội dung)"}\n\n${clipsForPrompt}`,
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: responseSchema },
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
