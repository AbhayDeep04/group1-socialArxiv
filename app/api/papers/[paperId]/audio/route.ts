import { NextRequest, NextResponse } from 'next/server';
import { QdrantClient } from '@qdrant/js-client-rest';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { elevenlabs } from '@ai-sdk/elevenlabs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

const collection = 'paper_semantics';
const MAX_CHARS = 10000; // ElevenLabs free tier limit
const DEFAULT_RACHEL_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

let cachedVoiceId: string | undefined;

async function resolveElevenLabsVoiceId(): Promise<string> {
  if (cachedVoiceId) return cachedVoiceId;

  const envId = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (envId) {
    cachedVoiceId = envId;
    return cachedVoiceId;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    cachedVoiceId = DEFAULT_RACHEL_VOICE_ID;
    return cachedVoiceId;
  }

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`List voices failed: ${res.status}`);
    const data = await res.json();
    const voices = Array.isArray(data?.voices) ? data.voices : [];
    const rachel = voices.find((v: any) => v?.name?.toLowerCase() === 'rachel');
    const resolvedVoiceId = rachel?.voice_id || voices[0]?.voice_id || DEFAULT_RACHEL_VOICE_ID;
    cachedVoiceId = resolvedVoiceId;
    console.log(`Using ElevenLabs voice: ${rachel?.name || voices[0]?.name || 'Rachel (default)'} (${resolvedVoiceId})`);
    return resolvedVoiceId;
  } catch (e) {
    console.warn('Failed to list ElevenLabs voices, falling back to default Rachel ID:', e);
    cachedVoiceId = DEFAULT_RACHEL_VOICE_ID;
    return cachedVoiceId;
  }
}

function stripReferences(text: string): string {
  const markers = [
    /[\r\n]\s*references\s*[\r\n]/i,
    /[\r\n]\s*bibliography\s*[\r\n]/i,
    /[\r\n]\s*works\s+cited\s*[\r\n]/i,
    /[\r\n]\s*acknowledgments?\s*[\r\n]/i,
  ];

  let cutIndex = -1;
  for (const regex of markers) {
    const matches = [...text.matchAll(new RegExp(regex, 'gi'))];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      if (lastMatch.index !== undefined) {
        cutIndex = Math.max(cutIndex, lastMatch.index);
      }
    }
  }

  if (cutIndex > -1) {
    return text.slice(0, cutIndex).trim();
  }
  return text;
}

async function fetchAllChunks(paperId: string): Promise<any[]> {
  let points: any[] = [];
  let nextOffset: any = undefined;

  do {
    const response: any = await qdrantClient.scroll(collection, {
      filter: {
        must: [
          { key: 'paperId', match: { value: paperId } },
          { key: 'level', match: { value: 'fulltext' } },
        ],
      },
      with_payload: true,
      limit: 100,
      offset: nextOffset,
    });

    points = points.concat(response.points || []);
    nextOffset = response.next_page_offset;
  } while (nextOffset);

  return points;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const { paperId } = await params;

    console.log(`Generating audio for paper ${paperId}...`);

    let points = await fetchAllChunks(paperId);

    if (!points.length) {
      return NextResponse.json(
        { error: 'Text not available for this paper. Please try again later.' },
        { status: 404 }
      );
    }

    points.sort((a, b) => (a.payload?.chunkIndex ?? 0) - (b.payload?.chunkIndex ?? 0));

    const fullText = points.map((p) => p.payload?.chunkText || '').join(' ').trim();
    const cleanedText = stripReferences(fullText);
    const textInput = cleanedText.slice(0, MAX_CHARS);

    console.log(
      `Text length: ${textInput.length} characters (limit: ${MAX_CHARS}, full paper: ${cleanedText.length})`
    );
    if (cleanedText.length > MAX_CHARS) {
      console.log(
        `Note: Using first ${MAX_CHARS} chars of paper (typically Abstract + Introduction)`
      );
    }

    const voiceId = await resolveElevenLabsVoiceId();

    const result = await generateSpeech({
      model: elevenlabs.speech('eleven_multilingual_v2'),
      voice: voiceId,
      text: textInput,
    });

    console.log('Audio generated successfully');

    // Convert GeneratedAudioFile to proper format for streaming
    const { audio } = result;
    
    console.log('Audio object type:', typeof audio);
    console.log('Audio object keys:', Object.keys(audio));
    console.log('Has uint8Array?', 'uint8Array' in audio);
    console.log('Has bytes?', 'bytes' in audio);
    console.log('Has base64?', 'base64' in audio);
    
    // The Vercel AI SDK GeneratedAudioFile should have a uint8Array property
    let audioData: Uint8Array | ArrayBuffer;
    
    if ((audio as any).uint8Array) {
      console.log('Using uint8Array property');
      audioData = (audio as any).uint8Array;
    } else if ((audio as any).bytes) {
      console.log('Using bytes property');
      audioData = (audio as any).bytes;
    } else if ((audio as any).base64) {
      console.log('Using base64 property - converting to Buffer');
      const base64 = (audio as any).base64;
      audioData = Buffer.from(base64, 'base64');
    } else if (typeof (audio as any).arrayBuffer === 'function') {
      console.log('Using arrayBuffer() method');
      audioData = await (audio as any).arrayBuffer();
    } else if (typeof (audio as any).toArrayBuffer === 'function') {
      console.log('Using toArrayBuffer() method');
      audioData = await (audio as any).toArrayBuffer();
    } else {
      console.error('Available audio properties:', Object.getOwnPropertyNames(audio));
      throw new Error('Could not extract audio data from GeneratedAudioFile');
    }

    const mimeType = (audio as any).mimeType || 'audio/mpeg';
    const byteLength = audioData instanceof Uint8Array ? audioData.byteLength : audioData.byteLength;
    
    console.log(`Returning audio: ${byteLength} bytes, type: ${mimeType}`);

    // Convert to Buffer if needed (Response accepts Buffer)
    const responseBody = audioData instanceof Uint8Array ? Buffer.from(audioData) : audioData;

    return new Response(responseBody as BodyInit, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(byteLength),
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    console.error('Error generating audio:', error);
    
    let hint = '';
    if (error?.message?.includes('voice_id')) {
      hint = ' Ensure ELEVENLABS_VOICE_ID is set to a voice you have access to, or that your ElevenLabs API key can list voices.';
    } else if (error?.responseBody?.includes('max_character_limit_exceeded')) {
      hint = ' Your ElevenLabs plan has a character limit. Consider upgrading your plan for longer audio generation.';
    }
    
    return NextResponse.json(
      {
        error: 'Failed to generate audio',
        message: (error.message || 'Unknown error') + hint,
      },
      { status: 500 }
    );
  }
}
