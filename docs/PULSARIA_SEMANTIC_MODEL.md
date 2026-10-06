# Pulsaria Universal Semantic Model Specification

## 1. Executive Vision & Purpose

Pulsaria evolves from a raw media ingestion and transcription library into a multimodal semantic knowledge platform. This document specifies the **Universal Semantic Model** that provides the intermediate conceptual representation between raw evidence (transcripts, OCR, keyframes) and downstream domain transformers (culinary recipes, tech reviews, game guides, tutorials, etc.).

```text
EVIDENCE (Transcripts, OCR, Keyframes, Annotations)
      ↓
SEMANTIC UNDERSTANDING (Universal Semantic Model)
      ↓
KNOWLEDGE GRAPH (Entities, Topics, Concepts, Claims, Relations)
      ↓
DOMAIN DETECTION (Culinary, Technology, Gaming, Programming, etc.)
      ↓
STRUCTURED DOMAIN TRANSFORMATION (e.g., Recipe, Product Review, Tutorial)
```

---

## 2. Core Ontological Entities

The universal semantic model resides in `src-tauri/src/domain/semantic.rs` and defines the following foundational constructs:

### 2.1 Content Domain & Content Type
- **`ContentDomain`**:
  - `Culinary` (Gastronomy, recipes, cooking techniques)
  - `Technology` (Hardware, gadgets, consumer tech, software reviews)
  - `Gaming` (Gameplay, walkthroughs, mechanics, guide systems)
  - `Programming` (Software engineering, tutorials, algorithms)
  - `Education` (Academic lectures, explainers, STEM)
  - `Fitness` (Workouts, biomechanics, exercise routines)
  - `News` (Journalism, current events, reports)
  - `Finance` (Market analysis, personal finance, investing)
  - `Other(String)` (Extensible fallback)

- **`ContentType`**:
  - `Recipe` (Ingredients, steps, timings, techniques)
  - `Tutorial` (Instructional step-by-step guides)
  - `ProductReview` (Specs, benchmarks, pros & cons)
  - `GameGuide` (Quests, builds, boss strategies)
  - `Lesson` (Curriculum unit, conceptual explainer)
  - `Analysis` (Deep-dive opinion or thematic review)
  - `EventReport` (Chronological event coverage)
  - `Workout` (Sets, repetitions, rest periods)
  - `Discussion` (Conversations, interviews, podcasts)
  - `Other(String)`

### 2.2 Semantic Entities (`SemanticEntity`)
Represents typed, disambiguated real-world or conceptual entities extracted from the audiovisual evidence.
- Fields:
  - `name`: Surface text as mentioned in source.
  - `normalized_name`: Lowercased, trimmed canonical form.
  - `entity_type`: Canonical `EntityType` (`Ingredient`, `Tool`, `Equipment`, `Technique`, `Language`, `Framework`, `Hardware`, `Software`, `Game`, `Concept`, `Person`, `Brand`, `Location`, `Other`).
  - `confidence`: Calibrated float score $\in [0.0, 1.0]$.
  - `job_id`: Job ID originating the entity.
  - `timestamp_start` / `timestamp_end`: Exact media boundaries in seconds where the entity appears.

### 2.3 Topics, Concepts, and Claims
- **`SemanticTopic`**: Thematic subject matter (e.g., "Italian Pasta", "Computer Vision") with hierarchical depth and confidence.
- **`SemanticConcept`**: Abstract idea, principle, or method (e.g., "Emulsification", "Async I/O").
- **`SemanticClaim`**: Subject-predicate-object assertion extracted from evidence, optionally with quantitative value and unit (e.g., `Pasta` `requires_boiling_time` `10` `minutes`).
- **`SemanticRelation`**: Graph edge linking two entities (e.g., `Parmesan` `garnishes` `SpaghettiCarbonara`).

### 2.4 Model Metadata & Reproducibility (`ModelMetadata`)
Every semantic artifact records:
- `model_id`: Canonical identifier (e.g., `Qwen2.5-1.5B-Instruct-Q4_K_M`).
- `model_provider`: Engine provider (`llama.cpp`, `Sidecar`, `Mock`).
- `model_revision`: Weights revision or commit tag.
- `prompt_version`: Versioned prompt template (e.g., `recipe_extract_v1.0`).

---

## 3. Provenance & Integrity Invariants

1. **Every Entity Has Temporal Provenance:** An entity without a timestamp is either a global document topic or must be explicitly flagged with low confidence.
2. **Deterministic Canonicalization:** Entities are normalized to lower-case ASCII representations for high-speed indexing and deduplication.
3. **No Database Coupling:** Domain definitions reside purely in Rust domain layers (`domain::semantic`), separated completely from persistence engines and UI frameworks.
4. **Idempotent Invalidation:** If a model weights file or prompt version is updated, downstream structured knowledge artifacts are invalidated and recomputed cleanly without database corruption.
