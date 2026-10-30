# Pulsaria Domain Engine & Content Transformers

## 1. Architectural Philosophy

Pulsaria does not use LLMs as generic conversational agents or unconstrained text generators. Instead, Pulsaria adheres strictly to the rule:

> **AI proposes. Pulsaria validates. SQLite persists. Evidence provides provenance. Deterministic code enforces contracts.**

The Domain Engine is responsible for:
1. Identifying the semantic domain and content archetype of ingested media (`DomainDetector`).
2. Discovering domain-specific analytical capabilities (`CapabilityRegistry`).
3. Running specialized domain transformers (`ContentTransformer`) that transform multimodal evidence into structured domain objects.
4. Deterministically validating every field, quantity, timing, and evidence reference before any persistence occurs.

```text
VIDEO EVIDENCE PACKAGE
         ↓
DOMAIN DETECTION (Deterministic Heuristic + Local AI Fallback)
         ↓
DOMAIN IDENTIFIED (e.g., Domain = Culinary, Type = Recipe)
         ↓
CAPABILITY SELECTION (Ingredient extraction, step extraction, conflict check)
         ↓
CONTENT TRANSFORMER (RecipeTransformer)
         ↓
RAW PROPOSED STRUCTURE
         ↓
DETERMINISTIC VALIDATOR (validate_structured_recipe)
         ↓
VALIDATED / REQUIRES_REVIEW
         ↓
KNOWLEDGE REPOSITORY (SQLite persistence with temporal anchors)
```

---

## 2. Domain Detection (`application::domain_detector`)

The domain detector employs a two-tier strategy:

1. **Fast Deterministic Check:**
   - Evaluates canonical library annotations and high-confidence title keywords.
   - Detects categories such as `Culinary` (`recipe`, `receta`, `cocina`), `Technology` (`review`, `benchmark`, `unboxing`, `rtx`), `Programming` (`tutorial`, `python`, `rust`), etc.
   - Operates with $0$ LLM overhead and $100\%$ determinism.

2. **Structured Local AI Fallback:**
   - If annotations are missing or ambiguous, a structured prompt is dispatched to `LocalAiProvider`.
   - The provider requests a typed JSON response matching `DomainClassification`.
   - Markdown fences are automatically stripped, and JSON schema is verified.

---

## 3. Capability Registry (`domain::capabilities`)

Domains expose modular capabilities:

| Domain | Capability ID | Name | Execution Kind |
|---|---|---|---|
| **Culinary** | `culinary.ingredients` | Ingredient Extraction | Deterministic / Extraction |
| **Culinary** | `culinary.steps` | Step & Timing Extraction | Deterministic / Extraction |
| **Culinary** | `culinary.equipment` | Equipment & Utensils | Extraction |
| **Culinary** | `culinary.conflict_detector` | Conflict & Discrepancy Detection | Deterministic Analysis |
| **Technology** | `tech.specs` | Specification Extraction | Extraction |
| **Technology** | `tech.benchmarks` | Benchmark Metrics Extraction | Extraction |
| **Programming** | `code.snippets` | Code Block Extraction | Extraction |
| **Gaming** | `gaming.mechanics` | Game Mechanics & Guides | Extraction |

Each capability declares its input requirements (e.g., `TranscriptSegments`, `OcrUnits`, `Keyframes`) and whether it executes deterministically or proposes via an AI task.

---

## 4. Recipe Vertical Slice (`domain::recipe` & `transformers::recipe`)

The first production vertical slice implemented is the **Culinary Recipe Engine**.

### 4.1 Data Contracts
- **`RecipeIngredient`**:
  - `name`: Surface name (e.g., "espaguetis", "parmesano").
  - `normalized_name`: Lowercase canonical representation.
  - `quantity`: Exact numeric value (`Option<f64>`). **Never hallucinated**. If the speaker does not state a quantity, it remains `None`.
  - `unit`: Measurement unit (e.g., "g", "ml", "cucharadas").
  - `notes`: Preparation details (e.g., "rallado fino", "a temperatura ambiente").
  - `optional`: Boolean flag.
  - `evidence`: Vector of `EvidenceAnchor` pointing to specific jobs and timestamp intervals.

- **`RecipeStep`**:
  - `ordinal`: Sequence index ($1, 2, \dots$).
  - `instruction`: Clear instructional command.
  - `time_start` / `time_end`: Exact video timestamp interval where this step is shown.
  - `technique`: Identified culinary technique (e.g., `boil`, `sauté`, `emulsify`).
  - `temperature`: Thermal setting (e.g., "180°C", "fuego medio").
  - `evidence`: Vector of `EvidenceAnchor`.

- **`RecipeConflict`**:
  - Captured when different segments or sources state contradictory values (e.g., 200g vs 250g, or 10 min vs 15 min).
  - Rather than auto-averaging or arbitrarily guessing, a conflict is raised.
  - The recipe status is flagged as `requires_review`.

### 4.2 Deterministic Validation Rules (`validate_structured_recipe`)
Before saving to SQLite, code enforces:
1. `EmptyTitle`: Recipe title must not be empty.
2. `NoIngredients`: Must have at least 1 ingredient.
3. `NoSteps`: Must have at least 1 step.
4. `NegativeQuantity`: Quantities cannot be $< 0$.
5. `NegativeTimestamp`: Timestamps cannot be negative.
6. `InvertedTimestampRange`: `start_time` must not exceed `end_time`.
7. `TimestampExceedsDuration`: Timestamps must not exceed source media duration.
8. `MissingEvidenceForStep`: Every step must have at least one valid evidence anchor.
9. `ForeignJobEvidence`: An evidence anchor cannot reference a foreign job ID not present in the evidence package.

---

## 5. Provenance & Video Navigation ("Ver en Video")

Because every ingredient and step retains its `EvidenceAnchor` with `timestamp_start` and `timestamp_end`:
1. The UI can display a "Ver en video" button next to any ingredient or preparation step.
2. Clicking the action immediately jumps the media player to `timestamp_start`.
3. If an evidence anchor contains a keyframe path, the thumbnail displays the exact visual snapshot.
