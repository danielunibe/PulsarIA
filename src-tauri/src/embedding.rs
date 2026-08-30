/// Motor de inferencia de embeddings ONNX para búsqueda semántica.
/// 
/// Gestiona el modelo `all-MiniLM-L6-v2` exportado a ONNX y su tokenizer asociado.
/// Produce vectores densos de 384 dimensiones normalizados L2, listos para indexación
/// HNSW y búsqueda por similitud coseno.
/// 
/// # Uso
/// 
/// ```ignore
/// let mut manager = ONNXModelManager::new(
/// &PathBuf::from("assets/models/all-MiniLM-L6-v2/model.onnx"),
/// &PathBuf::from("assets/models/all-MiniLM-L6-v2/tokenizer.json"),
/// )?;
/// let embedding: Vec<f32> = manager.generate_embedding("text to embed")?;
/// assert_eq!(embedding.len(), 384);
/// ```

use ort::{
    session::{builder::GraphOptimizationLevel, Session},
    value::Value,
};
use std::path::PathBuf;
use tokenizers::Tokenizer;

/// Gestor del modelo ONNX de embeddings (all-MiniLM-L6-v2, 384d).
///
/// Encapsula la sesión de inferencia ONNX y el tokenizer de HuggingFace.
/// Cada instancia es independiente y puede usarse concurrentemente desde
/// un `tokio::sync::Mutex<ONNXModelManager>`.
pub struct ONNXModelManager {
    session: Session,
    tokenizer: Tokenizer,
}

impl ONNXModelManager {
    /// Crea una nueva instancia cargando el modelo ONNX y el tokenizer desde disco.
    ///
    /// # Parámetros
    ///
    /// * `model_path` — Ruta al archivo `.onnx` del modelo de embeddings.
    /// * `tokenizer_path` — Ruta al archivo `tokenizer.json` de HuggingFace.
    ///
    /// # Errores
    ///
    /// Retorna `Err(String)` si falla la carga del modelo, la inicialización del
    /// runtime ONNX, o la lectura del tokenizer.
    pub fn new(model_path: &PathBuf, tokenizer_path: &PathBuf) -> Result<Self, String> {
        let _ = ort::init().with_name("tiktok-processor").commit();

        let session = Session::builder()
            .map_err(|e| format!("Failed to create ORT session builder: {}", e))?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|e| format!("Failed to set optimization level: {}", e))?
            .with_execution_providers([
                ort::execution_providers::DirectMLExecutionProvider::default().build(),
            ])
            .map_err(|e| format!("Failed to register DirectML execution provider: {}", e))?
            .with_intra_threads(4)
            .map_err(|e| format!("Failed to set intra threads: {}", e))?
            .commit_from_file(model_path)
            .map_err(|e| format!("Failed to load ONNX model: {}", e))?;

        let tokenizer = Tokenizer::from_file(tokenizer_path)
            .map_err(|e| format!("Failed to load tokenizer: {}", e))?;

        Ok(Self { session, tokenizer })
    }

    /// Genera un embedding normalizado (L2) de 384 dimensiones para el texto dado.
    ///
    /// El proceso consta de:
    /// 1. Tokenización con el tokenizer del modelo (truncado automático)
    /// 2. Inferencia ONNX con DirectML (fallback a CPU)
    /// 3. Mean pooling sobre los tokens de salida
    /// 4. Normalización L2 del vector resultante
    ///
    /// # Parámetros
    ///
    /// * `text` — Texto de entrada a embeber (transcripción, query, etc.)
    ///
    /// # Retorno
    ///
    /// `Vec<f32>` de exactamente 384 elementos normalizados (norma unitaria).
    ///
    /// # Errores
    ///
    /// Retorna `Err(String)` si falla la tokenización o la inferencia ONNX.
    pub fn generate_embedding(&mut self, text: &str) -> Result<Vec<f32>, String> {
        // 1. Tokenize input
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| format!("Failed to tokenize: {}", e))?;

        let input_ids = encoding
            .get_ids()
            .iter()
            .map(|&x| x as i64)
            .collect::<Vec<_>>();
        let attention_mask = encoding
            .get_attention_mask()
            .iter()
            .map(|&x| x as i64)
            .collect::<Vec<_>>();
        let token_type_ids = encoding
            .get_type_ids()
            .iter()
            .map(|&x| x as i64)
            .collect::<Vec<_>>();

        let seq_len = input_ids.len();
        let shape = [1, seq_len];

        // 2. Create ORT Values directly using standard arrays to avoid missing ndarray feature flags
        let input_ids_value =
            Value::from_array((shape, input_ids)).map_err(|e| format!("Value error: {}", e))?;
        let attention_mask_value = Value::from_array((shape, attention_mask.clone()))
            .map_err(|e| format!("Value error: {}", e))?;
        let token_type_ids_value = Value::from_array((shape, token_type_ids))
            .map_err(|e| format!("Value error: {}", e))?;

        // 3. Create ORT inputs and Run Inference
        let outputs = self
            .session
            .run(ort::inputs![
                "input_ids" => input_ids_value,
                "attention_mask" => attention_mask_value,
                "token_type_ids" => token_type_ids_value,
            ])
            .map_err(|e| format!("Inference failed: {}", e))?;

        let (_shape, last_hidden_state_flat) = outputs["last_hidden_state"]
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Failed to extract hidden state: {}", e))?;

        // 4. Mean Pooling (simplification assuming sentence-transformers style)
        let mut embedding = vec![0.0f32; 384];
        let mut mask_sum = 0.0;

        for i in 0..seq_len {
            let mask = attention_mask[i] as f32;
            mask_sum += mask;
            for j in 0..384 {
                embedding[j] += last_hidden_state_flat[i * 384 + j] * mask;
            }
        }

        for j in 0..384 {
            embedding[j] /= mask_sum.max(1e-9);
        }

        // 6. L2 Normalization
        let mut norm = 0.0;
        for val in &embedding {
            norm += val * val;
        }
        let norm = norm.sqrt().max(1e-12);
        for val in &mut embedding {
            *val /= norm;
        }

        Ok(embedding)
    }
}
