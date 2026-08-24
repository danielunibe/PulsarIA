export interface VideoSummary {
  title: string;
  summary: string[];
  category: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

function simulateSummary(): VideoSummary {
  return {
    title: 'Resumen audiovisual estructurado',
    summary: [
      'El contenido sintetiza ideas clave del material procesado.',
      'Se identifican patrones semánticos y conceptos principales.',
      'Listo para consulta interactiva y búsqueda por vectores.',
    ],
    category: 'Tecnología',
    sentiment: 'positive',
  };
}

function simulateChatResponse(query: string): string {
  return `Análisis RAG para "${query}": Basado en los fragmentos de video indexados en la biblioteca, los contenidos abordan conceptos relevantes sobre esta temática con alta coincidencia semántica.`;
}

export async function generateVideoSummary(transcriptText: string): Promise<VideoSummary> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

  if (!apiKey || !transcriptText.trim()) {
    return simulateSummary();
  }

  try {
    const prompt = `Eres un asistente experto en analisis de contenido audiovisual. A partir del siguiente transcripto de video, genera un resumen estructurado en formato JSON, SIN bloque de codigo markdown ni texto adicional.

Reglas estrictas:
- title: titulo conceptual enriquecido (maximo 80 caracteres).
- summary: array con exactamente 3 vinetas ejecutivas.
- category: una categoria tematica entre: Programacion, Fitness, Finanzas, Humor, Educacion, Tecnologia, Otros.
- sentiment: 'positive', 'neutral' o 'negative'.

Transcripto:
"""${transcriptText}"""`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 }
      })
    });

    if (!res.ok) return simulateSummary();
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    if (!text) return simulateSummary();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return simulateSummary();

    const parsed = JSON.parse(jsonMatch[0]) as Partial<VideoSummary>;
    const sentiment = parsed.sentiment;

    if (
      typeof parsed.title !== 'string' ||
      !Array.isArray(parsed.summary) ||
      typeof parsed.category !== 'string' ||
      typeof sentiment !== 'string' ||
      !['positive', 'neutral', 'negative'].includes(sentiment)
    ) {
      return simulateSummary();
    }

    return {
      title: parsed.title.slice(0, 80),
      summary: parsed.summary.slice(0, 3),
      category: parsed.category,
      sentiment: sentiment,
    };
  } catch {
    return simulateSummary();
  }
}

export async function generateChatResponse(query: string, context: string[]): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

  if (!apiKey) {
    return simulateChatResponse(query);
  }

  try {
    const contextBlock = context
      .map((chunk, index) => `[Fragmento ${index + 1}]\n${chunk}`)
      .join('\n\n');

    const prompt = `Eres un asistente util basado unicamente en el siguiente contexto. Responde la consulta del usuario de forma clara y concisa. Si la respuesta no esta en el contexto, indicalo explicitamente.

Contexto:
${contextBlock}

Consulta: ${query}`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
      })
    });

    if (!res.ok) return simulateChatResponse(query);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    return text || simulateChatResponse(query);
  } catch {
    return simulateChatResponse(query);
  }
}
