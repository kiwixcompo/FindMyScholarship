import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || "";
const GROQ_KEY = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || "";

const openRouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_KEY,
});

const groq = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: GROQ_KEY,
});

export async function POST(req: Request) {
  try {
    const { systemPrompt, userPrompt } = await req.json();

    if (!systemPrompt || !userPrompt) {
      return NextResponse.json({ error: "Missing prompts" }, { status: 400 });
    }

    if (!OPENROUTER_KEY && !GROQ_KEY) {
      return NextResponse.json({ error: "API keys are not configured in environment variables." }, { status: 500 });
    }

    try {
      console.log("Trying OpenRouter...");
      const response = await openRouter.chat.completions.create({
        model: "google/gemma-2-9b-it:free", // Highly reliable free model on OpenRouter
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
      });
      return NextResponse.json({ text: response.choices[0].message.content });
    } catch (error: any) {
      console.warn("OpenRouter failed, falling back to Groq...", error?.message || error);
      
      if (!GROQ_KEY) {
        throw new Error("OpenRouter failed and Groq key is missing.");
      }

      const response = await groq.chat.completions.create({
        model: "llama3-70b-8192",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
      });
      return NextResponse.json({ text: response.choices[0].message.content });
    }
  } catch (e: any) {
    console.error("Generation error:", e);
    return NextResponse.json({ error: e.message || "Failed to generate content" }, { status: 500 });
  }
}
