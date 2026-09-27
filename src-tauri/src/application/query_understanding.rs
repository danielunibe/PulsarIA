use crate::domain::models::{ParsedFilters, QueryContext, SearchMode};
use chrono::{Datelike, Duration, Local, NaiveDate};

#[derive(Debug, Clone)]
pub struct QueryUnderstanding {
    pub normalized_query: String,
    pub retrieval_query: String,
    pub filters: ParsedFilters,
    pub context: QueryContext,
}

/// Lightweight query understanding for the desktop path. It intentionally
/// does not require the local LLM: filters are extracted from a small,
/// explainable vocabulary and the remaining terms are sent to FTS/embeddings.
pub fn understand(
    query: &str,
    _mode: SearchMode,
    previous: Option<&QueryContext>,
) -> QueryUnderstanding {
    let normalized_query = normalize(query);
    let mut filters = ParsedFilters::default();
    let mut consumed = Vec::new();
    let lower = normalized_query.to_ascii_lowercase();

    if contains_any(
        &lower,
        &[
            "guardé",
            "guarde",
            "guardados",
            "guardadas",
            "saved",
            "save",
        ],
    ) {
        filters.relationship = Some("saved".to_string());
        consumed.extend([
            "guardé",
            "guarde",
            "guardados",
            "guardadas",
            "saved",
            "save",
        ]);
    } else if contains_any(
        &lower,
        &[
            "favorito",
            "favoritos",
            "favorita",
            "favoritas",
            "liked",
            "like",
            "dieron like",
        ],
    ) {
        filters.relationship = Some("liked".to_string());
        consumed.extend([
            "favorito",
            "favoritos",
            "favorita",
            "favoritas",
            "liked",
            "like",
            "dieron like",
        ]);
    } else if contains_any(&lower, &["repost", "reposts", "reposteado", "reposteados"]) {
        filters.relationship = Some("reposted".to_string());
        consumed.extend(["repost", "reposts", "reposteado", "reposteados"]);
    } else if contains_any(&lower, &["publicado", "publicados", "posted"]) {
        filters.relationship = Some("posted".to_string());
        consumed.extend(["publicado", "publicados", "posted"]);
    }

    if contains_any(
        &lower,
        &[
            "no descargué",
            "no descargue",
            "no descargados",
            "not downloaded",
        ],
    ) {
        filters.media_local = Some(false);
        consumed.extend([
            "no descargué",
            "no descargue",
            "no descargados",
            "not downloaded",
        ]);
    } else if contains_any(
        &lower,
        &["descargué", "descargue", "descargados", "downloaded"],
    ) {
        filters.media_local = Some(true);
        consumed.extend(["descargué", "descargue", "descargados", "downloaded"]);
    }

    filters.content_type = detect_content_type(&lower);
    if filters.content_type.is_some() {
        consumed.extend([
            "receta",
            "recetas",
            "recipe",
            "recipes",
            "tutorial",
            "tutoriales",
            "tutorials",
            "review",
            "reviews",
            "reseña",
            "reseñas",
            "viaje",
            "viajes",
            "travel",
            "educativo",
            "educational",
        ]);
    }

    let today = Local::now().date_naive();
    if lower.contains("semana pasada") || lower.contains("last week") {
        let start_of_this_week =
            today - Duration::days(today.weekday().num_days_from_monday() as i64);
        let start = start_of_this_week - Duration::days(7);
        let end = start_of_this_week - Duration::days(1);
        filters.date_from = Some(start.to_string());
        filters.date_to = Some(end.to_string());
        consumed.extend(["semana pasada", "last week"]);
    } else if lower.contains("este mes") || lower.contains("this month") {
        if let Some(start) = NaiveDate::from_ymd_opt(today.year(), today.month(), 1) {
            filters.date_from = Some(start.to_string());
            filters.date_to = Some(today.to_string());
        }
        consumed.extend(["este mes", "this month"]);
    } else if let Some((month, year)) = find_month(&lower, today.year()) {
        let start = NaiveDate::from_ymd_opt(year, month, 1);
        let end = if month == 12 {
            NaiveDate::from_ymd_opt(year + 1, 1, 1).map(|date| date - Duration::days(1))
        } else {
            NaiveDate::from_ymd_opt(year, month + 1, 1).map(|date| date - Duration::days(1))
        };
        filters.date_from = start.map(|date| date.to_string());
        filters.date_to = end.map(|date| date.to_string());
    }

    filters.entities = extract_entities(&normalized_query, &lower);
    if !filters.entities.is_empty() {
        consumed.extend(["mencionaban", "mencionaba", "where", "mention", "menciona"]);
    }

    // These function words add little retrieval signal and otherwise make a
    // filter-only query such as "recetas que guardé la semana pasada" turn
    // into an accidental metadata search for "que la".
    consumed.extend([
        "que", "la", "el", "los", "las", "de", "del", "donde", "videos", "video",
    ]);

    let mut context = previous.cloned().unwrap_or_default();
    if context.base_query.is_none() {
        context.base_query = Some(normalized_query.clone());
    }
    merge_context(&mut filters, &mut context);

    let retrieval_query = normalized_query
        .split_whitespace()
        .filter(|token| {
            let normalized = token
                .trim_matches(|character: char| !character.is_alphanumeric())
                .to_ascii_lowercase();
            !consumed.iter().any(|phrase| {
                phrase == &normalized || phrase.split_whitespace().any(|part| part == normalized)
            })
        })
        .collect::<Vec<_>>()
        .join(" ");

    QueryUnderstanding {
        normalized_query,
        retrieval_query,
        filters,
        context,
    }
}

fn normalize(query: &str) -> String {
    query.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn contains_any(value: &str, candidates: &[&str]) -> bool {
    candidates.iter().any(|candidate| value.contains(candidate))
}

fn detect_content_type(query: &str) -> Option<String> {
    if contains_any(query, &["receta", "recetas", "recipe", "recipes"]) {
        Some("recipe".to_string())
    } else if contains_any(query, &["tutorial", "tutoriales", "tutorials"]) {
        Some("tutorial".to_string())
    } else if contains_any(query, &["review", "reviews", "reseña", "reseñas"]) {
        Some("review".to_string())
    } else if contains_any(query, &["viaje", "viajes", "travel"]) {
        Some("travel".to_string())
    } else if contains_any(query, &["educativo", "educational"]) {
        Some("educational".to_string())
    } else {
        None
    }
}

fn extract_entities(normalized: &str, lower: &str) -> Vec<String> {
    let marker = ["mencionaban", "mencionaba", "mention", "menciona"]
        .iter()
        .find_map(|candidate| lower.find(candidate));
    let Some(index) = marker else {
        return Vec::new();
    };
    let suffix = normalized[index..]
        .split_whitespace()
        .skip(1)
        .map(|value| value.trim_matches(|character: char| !character.is_alphanumeric()))
        .filter(|value| !value.is_empty())
        .take(4)
        .collect::<Vec<_>>();
    suffix
        .into_iter()
        .filter(|value| value.chars().any(|character| character.is_uppercase()) || value.len() > 3)
        .map(|value| value.to_string())
        .collect()
}

fn find_month(query: &str, default_year: i32) -> Option<(u32, i32)> {
    let months = [
        ("enero", 1),
        ("january", 1),
        ("febrero", 2),
        ("february", 2),
        ("marzo", 3),
        ("march", 3),
        ("abril", 4),
        ("april", 4),
        ("mayo", 5),
        ("may", 5),
        ("junio", 6),
        ("june", 6),
        ("julio", 7),
        ("july", 7),
        ("agosto", 8),
        ("august", 8),
        ("septiembre", 9),
        ("september", 9),
        ("octubre", 10),
        ("october", 10),
        ("noviembre", 11),
        ("november", 11),
        ("diciembre", 12),
        ("december", 12),
    ];
    months.iter().find_map(|(name, month)| {
        if query.contains(name) {
            Some((*month, default_year))
        } else {
            None
        }
    })
}

fn merge_context(filters: &mut ParsedFilters, context: &mut QueryContext) {
    if filters.relationship.is_none() {
        filters.relationship = context.relationship.clone();
    } else {
        context.relationship = filters.relationship.clone();
    }
    if filters.date_from.is_none() {
        filters.date_from = context.date_from.clone();
    } else {
        context.date_from = filters.date_from.clone();
    }
    if filters.date_to.is_none() {
        filters.date_to = context.date_to.clone();
    } else {
        context.date_to = filters.date_to.clone();
    }
    if filters.content_type.is_none() {
        filters.content_type = context.content_type.clone();
    } else {
        context.content_type = filters.content_type.clone();
    }
    if filters.profile.is_none() {
        filters.profile = context.profile.clone();
    }
    if filters.media_local.is_none() {
        filters.media_local = context.media_local;
    } else {
        context.media_local = filters.media_local;
    }
    let mut entities = context.entities.clone();
    entities.extend(filters.entities.iter().cloned());
    entities.sort_unstable();
    entities.dedup();
    filters.entities = entities.clone();
    context.entities = entities;
    context
        .concepts
        .push(context.base_query.clone().unwrap_or_default());
    context.concepts.retain(|value| !value.trim().is_empty());
    context.concepts.sort_unstable();
    context.concepts.dedup();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_saved_last_week_recipe_filters() {
        let result = understand(
            "recetas que guardé la semana pasada",
            SearchMode::Smart,
            None,
        );
        assert_eq!(result.filters.relationship.as_deref(), Some("saved"));
        assert_eq!(result.filters.content_type.as_deref(), Some("recipe"));
        assert!(result.filters.date_from.is_some());
        assert!(result.filters.date_to.is_some());
    }

    #[test]
    fn extracts_entity_after_mention_marker() {
        let result = understand(
            "videos de Blender donde mencionaban NVIDIA",
            SearchMode::Smart,
            None,
        );
        assert!(result
            .filters
            .entities
            .iter()
            .any(|value| value.eq_ignore_ascii_case("NVIDIA")));
    }

    #[test]
    fn carries_context_for_refinement() {
        let first = understand("Japón", SearchMode::Smart, None);
        let second = understand("solo comida", SearchMode::Smart, Some(&first.context));
        assert_eq!(second.context.base_query.as_deref(), Some("Japón"));
        assert!(second.retrieval_query.contains("comida"));
    }
}
