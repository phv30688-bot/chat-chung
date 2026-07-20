import { NextRequest, NextResponse } from "next/server";
import { checkUsageLimit, recordUsage, usageLimitResponse } from "@/lib/usageLimit";

export const runtime = "nodejs";

interface GroqSegment {
  start: number;
  end: number;
  text: string;
}

interface GroqTranscription {
  text: string;
  segments?: GroqSegment[];
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server chưa cấu hình GROQ_API_KEY." },
      { status: 500 }
    );
  }

  const { allowed, count } = checkUsageLimit(req);
  if (!allowed) {
    return usageLimitResponse();
  }

  const incomingForm = await req.formData();
  const audio = incomingForm.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "Thiếu file audio." }, { status: 400 });
  }

  const groqForm = new FormData();
  groqForm.append("file", audio, audio.name);
  groqForm.append("model", "whisper-large-v3-turbo");
  groqForm.append("response_format", "verbose_json");

  const groqResponse = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    }
  );

  if (!groqResponse.ok) {
    const errorText = await groqResponse.text();
    return NextResponse.json(
      { error: `Groq trả lỗi: ${errorText}` },
      { status: 502 }
    );
  }

  const data: GroqTranscription = await groqResponse.json();
  const response = NextResponse.json({
    text: data.text,
    segments: (data.segments ?? []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
  });
  recordUsage(response, count);
  return response;
}
