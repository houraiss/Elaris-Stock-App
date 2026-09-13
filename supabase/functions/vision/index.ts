// Supabase Edge Function (Deno). Proxies vision calls to Anthropic so the
// API key never ships inside the mobile app — set it as a function secret
// (ANTHROPIC_API_KEY), never as an EXPO_PUBLIC_ env var.
//
// Deploy via the Supabase Dashboard: Edge Functions -> Deploy a new function
// -> name it "vision" -> paste this file's contents -> Deploy. Then add the
// secret under Edge Functions -> Manage secrets.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL = 'claude-sonnet-5';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageInput {
  mediaType: string;
  data: string; // base64, no data: prefix
}

interface MatchCandidate {
  pieceId: string;
  label: string;
  image: ImageInput;
}

interface RequestBody {
  mode: 'match' | 'describe';
  image: ImageInput;
  candidates?: MatchCandidate[];
}

function imageBlock(image: ImageInput) {
  return { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } };
}

async function callClaude(content: unknown[]): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${text}`);
  }

  const json = await response.json();
  const text = json.content?.[0]?.text;
  if (!text) throw new Error('No text in Anthropic response');
  return text;
}

function extractJson(text: string): unknown {
  // Claude sometimes wraps JSON in a code fence despite instructions not to.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}

async function handleMatch(body: RequestBody): Promise<unknown> {
  const candidates = body.candidates ?? [];
  if (candidates.length === 0) {
    return { matches: [] };
  }

  const content: unknown[] = [
    {
      type: 'text',
      text:
        'You are matching a newly photographed piece of jewellery against a small personal catalogue, ' +
        'to help a shop owner find which existing piece (if any) it is. The first image is the new photo. ' +
        'Each candidate afterward is labelled "Candidate <id> (<label>)" followed by its catalogue photo. ' +
        'Compare the new photo against every candidate and return ONLY a JSON object of the shape ' +
        '{"matches": [{"pieceId": string, "confidence": number, "reason": string}]} ' +
        'with up to 5 entries, sorted by confidence descending (0 to 1), pieceId copied exactly from the ' +
        'candidate labels, and reason a short (under 15 words) note on what visually matches or differs. ' +
        'Return an empty matches array if nothing looks plausibly similar. No prose outside the JSON.',
    },
    { type: 'text', text: 'New photo:' },
    imageBlock(body.image),
  ];

  for (const candidate of candidates) {
    content.push({ type: 'text', text: `Candidate ${candidate.pieceId} (${candidate.label}):` });
    content.push(imageBlock(candidate.image));
  }

  const text = await callClaude(content);
  return extractJson(text);
}

async function handleDescribe(body: RequestBody): Promise<unknown> {
  const content = [
    {
      type: 'text',
      text:
        'You are helping enter a new piece of silver jewellery into a shop catalogue from a single photo. ' +
        'Return ONLY a JSON object of the shape ' +
        '{"category": string, "materialGuess": "argent_rhodie_925" | "argent_925" | "argent_800" | null, ' +
        '"styleDescriptors": string[], "suggestedName": string, "caption": string}. ' +
        'category is a short noun like "Ring", "Bangle", "Necklace", "Earrings" or "Bracelet". ' +
        'materialGuess is your best guess at which of those three silver purities this is from its finish and ' +
        'colour, or null if you cannot tell from a photo alone (rhodium-plated 925 looks brighter/whiter; ' +
        'plain 925 has a warmer grey-white tone; 800 is often older, more traditional Moroccan pieces, ' +
        'sometimes engraved or filigree). styleDescriptors is 2-5 short tags (e.g. "filigree", "engraved", ' +
        '"minimalist", "traditional Moroccan"). suggestedName is a short evocative catalogue name. caption is ' +
        'a 1-2 sentence Instagram-ready caption. No prose outside the JSON.',
    },
    imageBlock(body.image),
  ];

  const text = await callClaude(content);
  return extractJson(text);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
  }

  try {
    const body: RequestBody = await req.json();
    const result = body.mode === 'match' ? await handleMatch(body) : await handleDescribe(body);
    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
  }
});
