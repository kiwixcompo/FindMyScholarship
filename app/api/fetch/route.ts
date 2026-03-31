import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const text = await response.text();
    
    // Strip HTML tags to save tokens
    const strippedText = text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    
    // Return first 15000 chars to avoid token limits
    return NextResponse.json({ text: strippedText.slice(0, 15000) });
  } catch (e) {
    console.error("Fetch error:", e);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
