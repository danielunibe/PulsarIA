export interface VideoSummary {
  title: string;
  summary: string[];
  category: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

const GEMINI_MODEL = 'gemini-1.5-flash';
const ALLOWED_CATEGORIES = new Set([
  'Programacion',
  'Fitness',
  'Finanzas',
  'Humor',
  'Educacion',
  'Tecnologia',
  'Otros',
]);

function requireApiKey(): string {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Gemini is not configured. Set NEXT_PUBLIC_GOOGLE_API_KEY.');
  }
  return apiKey;
}

async function callGemini(prompt: string, maxOutputTokens: number): Promise<string> {
  const apiKey = requireApiKey();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}

export async function generateVideoSummary(transcriptText: string): Promise<VideoSummary> {
  const transcript = transcriptText.trim();
  if (!transcript) throw new Error('Cannot summarize an empty transcript.');

  const prompt = `Eres un asistente experto en análisis de contenido audiovisual. A partir de la siguiente transcripción, devuelve exclusivamente JSON válido, sin markdown ni texto adicional.

Esquema obligatorio:
{"title":"string de máximo 80 caracteres","summary":["string","string","string"],"category":"Programacion|Fitness|Finanzas|Humor|Educacion|Tecnologia|Otros","sentiment":"positive|neutral|negative"}

La matriz summary debe tener exactamente tres elementos y no debes inventar información ausente de la transcripción.

Transcripción:
<<<
${transcript}
>>>`;

  const text = await callGemini(prompt, 512);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini did not return a JSON summary.');

  let parsed: Partial<VideoSummary>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Partial<VideoSummary>;
  } catch (error) {
    throw new Error(`Gemini returned invalid JSON: ${String(error)}`);
  }

  const sentiment = parsed.sentiment;
  if (
    typeof parsed.title !== 'string' ||
    !Array.isArray(parsed.summary) ||
    parsed.summary.length !== 3 ||
    !parsed.summary.every((item) => typeof item === 'string') ||
    typeof parsed.category !== 'string' ||
    !ALLOWED_CATEGORIES.has(parsed.category) ||
    (sentiment !== 'positive' && sentiment !== 'neutral' && sentiment !== 'negative')
  ) {
    throw new Error('Gemini returned a summary that does not match the required schema.');
  }

  return {
    title: parsed.title.trim().slice(0, 80),
    summary: parsed.summary.map((item) => item.trim()),
    category: parsed.category,
    sentiment,
  };
}

export async function generateChatResponse(query: string, context: string[]): Promise<string> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error('Cannot answer an empty query.');

  const contextBlock = context.length > 0
    ? context.map((chunk, index) => `[Fragmento ${index + 1}]\n${chunk}`).join('\n\n')
    : '(No se encontraron fragmentos relevantes en la biblioteca.)';
  const prompt = `Eres un asistente útil. Responde exclusivamente con base en el contexto proporcionado. Si la respuesta no está en el contexto, dilo explícitamente; no inventes datos.

Contexto:
${contextBlock}

Consulta: ${normalizedQuery}`;

  try {
    return await callGemini(prompt, 1024);
  } catch (error) {
    // La UI puede mostrar este mensaje sin presentar una respuesta inventada.
    return `No fue posible consultar Gemini: ${error instanceof Error ? error.message : String(error)}`;
  }
}
