use crate::domain::models::TranscriptChunk;

const MAX_TOKENS_PER_CHUNK: usize = 150;
const OVERLAP_TOKENS: usize = 50;

pub struct SemanticChunker;

impl SemanticChunker {
    pub fn new() -> Self {
        Self
    }

    /// Divide un texto largo en sentencias completas y luego en chunks semánticos (SLIDING WINDOW)
    /// Aproxima tokens por conteo de palabras, rompiendo en límites lógicos para preservar contexto.
    pub fn chunk_text(&self, text: &str) -> Vec<TranscriptChunk> {
        let mut chunks = Vec::new();
        let words: Vec<&str> = text.split_whitespace().collect();

        if words.is_empty() {
            return chunks;
        }

        let mut i = 0;
        let mut chunk_index = 0;

        while i < words.len() {
            let mut end = (i + MAX_TOKENS_PER_CHUNK).min(words.len());

            // 1. Sentence Boundary Constraint: Tratar de no cortar frases por la mitad.
            // Si no estamos en el último chunk, retrocederemos buscando un fin lógico (., ?, !)
            if end < words.len() {
                // Buscamos un límite final de sentencia en los últimos N=50 tokens de este slide
                let search_start = end.saturating_sub(50).max(i);
                for j in (search_start..end).rev() {
                    let word = words[j];
                    // Bug #70 FIX: Skip abbreviations (Dr., vs., etc., U.S.A.) —
                    // short words ending with '.' are likely not sentence boundaries.
                    let is_sentence_end = if word.ends_with('.') {
                        word.len() > 3 // Skip short abbreviations like "Dr.", "vs.", "etc."
                    } else {
                        word.ends_with('?') || word.ends_with('!')
                    };
                    if is_sentence_end {
                        end = j + 1;
                        break;
                    }
                }
            }

            let chunk_words = &words[i..end];
            let chunk_str = chunk_words.join(" ");

            metrics::histogram!("chunk_size_tokens").record(chunk_words.len() as f64);

            chunks.push(TranscriptChunk {
                chunk_index,
                text: chunk_str,
            });

            chunk_index += 1;

            if end == words.len() {
                break;
            }

            // 2. Context overlap strategy (para encadenamiento semántico)
            i = end.saturating_sub(OVERLAP_TOKENS).max(i + 1);
        }

        metrics::counter!("semantic_chunks_generated").increment(chunks.len() as u64);
        chunks
    }
}
