import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const { systemPrompt, userPrompt } = await req.json();

    if (!systemPrompt || !userPrompt) {
      return NextResponse.json({ error: "Missing prompts" }, { status: 400 });
    }

    // Read environment variables INSIDE the handler.
    const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || "";
    const GROQ_KEY = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY || "";

    if (!GEMINI_KEY && !OPENROUTER_KEY && !GROQ_KEY) {
      return NextResponse.json({ error: "API keys are not configured in environment variables." }, { status: 500 });
    }

    let lastError: any = null;

    // 1. Try Gemini API first (Supports Google Search for real-time data)
    if (GEMINI_KEY) {
      try {
        console.log("Trying Gemini API...");
        const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            tools: [{ googleSearch: {} }],
            toolConfig: { includeServerSideToolInvocations: true }
          }
        });
        
        if (response.text) {
          return NextResponse.json({ text: response.text });
        }
      } catch (error: any) {
        console.warn("Gemini API failed:", error?.message || error);
        lastError = error;
      }
    }

    // Groq and OpenRouter require the prompt to explicitly mention "JSON"
    const finalSystemPrompt = systemPrompt + "\n\nPlease return your response in JSON format.";

    // 2. Fallback to OpenRouter
    if (OPENROUTER_KEY) {
      try {
        console.log("Trying OpenRouter...");
        const openRouter = new OpenAI({
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: OPENROUTER_KEY,
        });
        const response = await openRouter.chat.completions.create({
          model: "google/gemini-2.0-flash-lite-preview-02-05:free",
          messages: [
            { role: "system", content: finalSystemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: { type: "json_object" },
        });
        return NextResponse.json({ text: response.choices[0].message.content });
      } catch (error: any) {
        console.warn("OpenRouter failed:", error?.message || error);
        lastError = error;
      }
    }

    // 3. Fallback to Groq
    if (GROQ_KEY) {
      try {
        console.log("Trying Groq...");
        const groq = new OpenAI({
          baseURL: "https://api.groq.com/openai/v1",
          apiKey: GROQ_KEY,
        });
        const response = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: finalSystemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: { type: "json_object" },
        });
        return NextResponse.json({ text: response.choices[0].message.content });
      } catch (error: any) {
        console.warn("Groq failed:", error?.message || error);
        lastError = error;
      }
    }

    // If we get here, all attempted providers failed
    throw new Error(lastError?.message || "All AI providers failed. Please check your API keys.");
  } catch (e: any) {
    console.error("Generation error:", e);
    return NextResponse.json({ error: e.message || "Failed to generate content" }, { status: 500 });
  }
}
