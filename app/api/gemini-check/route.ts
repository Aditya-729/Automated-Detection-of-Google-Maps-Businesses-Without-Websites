import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const buildHtmlResponse = (body: string, status: number) =>
  new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gemini Check</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 32px; color: #0f172a; }
      .card { max-width: 640px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; }
      .ok { color: #15803d; }
      .err { color: #b91c1c; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
      pre { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 8px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Gemini Check</h1>
      ${body}
      <p>
        Go to the app: <a href="/">https://website-gap-finder-v2.vercel.app</a>
      </p>
    </div>
  </body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    }
  );

export async function GET(request: NextRequest) {
  const wantsHtml =
    request.headers.get("accept")?.includes("text/html") ?? false;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    if (wantsHtml) {
      return buildHtmlResponse(
        `<p class="err">GEMINI_API_KEY is missing.</p>`,
        400
      );
    }
    return NextResponse.json(
      { ok: false, error: "GEMINI_API_KEY is missing." },
      { status: 400 }
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent("Reply with OK.");
    const text = result.response.text().trim();

    if (wantsHtml) {
      return buildHtmlResponse(
        `<p class="ok">Gemini check OK.</p>
         <pre>{"ok":true,"model":"gemini-2.0-flash","sample":"${text.replace(/"/g, '\\"')}"}</pre>`,
        200
      );
    }

    return NextResponse.json({
      ok: true,
      model: "gemini-2.0-flash",
      sample: text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (wantsHtml) {
      return buildHtmlResponse(`<p class="err">${message}</p>`, 500);
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
