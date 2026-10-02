use crate::db::{MetadataSearchHit, SearchUnitHit, SearchUnitRecord};
use crate::domain::models::{
    SearchMoment, SearchProvenance, SearchRepresentation, SearchResultGroup,
};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct TimestampedChunk {
    pub ordinal: i64,
    pub text: String,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
}

/// Build bounded semantic windows while retaining the timestamp range of the
/// source Whisper segments. A word is associated with its parent segment; the
/// resulting range is therefore stable even when word-level timestamps are not
/// available.
pub fn chunk_transcript_segments(
    segments: &[(i64, String, f64, f64)],
    max_tokens: usize,
    overlap_tokens: usize,
) -> Vec<TimestampedChunk> {
    #[derive(Clone)]
    struct Word<'a> {
        text: &'a str,
        start: f64,
        end: f64,
    }

    let words = segments
        .iter()
        .flat_map(|(_, text, start, end)| {
            text.split_whitespace().map(move |word| Word {
                text: word,
                start: *start,
                end: *end,
            })
        })
        .collect::<Vec<_>>();
    if words.is_empty() {
        return Vec::new();
    }

    let max_tokens = max_tokens.clamp(120, 250);
    let overlap_tokens = overlap_tokens
        .min(max_tokens.saturating_sub(1))
        .max((max_tokens / 10).min(max_tokens.saturating_sub(1)));
    let step = max_tokens.saturating_sub(overlap_tokens).max(1);
    let mut chunks = Vec::new();
    let mut start = 0usize;
    let mut ordinal = 0i64;
    while start < words.len() {
        let end = (start + max_tokens).min(words.len());
        let slice = &words[start..end];
        chunks.push(TimestampedChunk {
            ordinal,
            text: slice
                .iter()
                .map(|word| word.text)
                .collect::<Vec<_>>()
                .join(" "),
            start_time: slice.first().map(|word| word.start),
            end_time: slice.last().map(|word| word.end),
        });
        ordinal += 1;
        if end == words.len() {
            break;
        }
        start = (start + step).min(end);
    }
    chunks
}

#[derive(Debug, Clone)]
pub struct UnifiedHit {
    pub job_id: i64,
    pub content_id: Option<i64>,
    pub unit: Option<SearchUnitRecord>,
    pub title: Option<String>,
    pub author: Option<String>,
    pub thumbnail: Option<String>,
    pub score: f32,
    pub representation: SearchRepresentation,
    pub provenance_confidence: Option<f32>,
}

pub fn fuse_ranked_hits(
    ranked_channels: Vec<Vec<UnifiedHit>>,
    limit: usize,
    rrf_k: f32,
) -> Vec<UnifiedHit> {
    let mut fused: HashMap<(i64, i64), (f32, UnifiedHit)> = HashMap::new();
    for channel in ranked_channels {
        for (rank, hit) in channel.into_iter().enumerate() {
            let unit_key = hit.unit.as_ref().map(|unit| unit.id).unwrap_or(0);
            let key = (hit.job_id, unit_key);
            let contribution = 1.0 / (rrf_k + rank as f32 + 1.0);
            if let Some((score, existing)) = fused.get_mut(&key) {
                *score += contribution;
                if hit.score > existing.score {
                    existing.score = hit.score;
                }
            } else {
                let mut hit = hit;
                hit.score = contribution;
                fused.insert(key, (contribution, hit));
            }
        }
    }
    let mut results = fused
        .into_values()
        .map(|(rrf_score, mut hit)| {
            hit.score = rrf_score;
            hit
        })
        .collect::<Vec<_>>();
    results.sort_by(|left, right| right.score.total_cmp(&left.score));
    results.truncate(limit);
    results
}

pub fn metadata_to_hit(hit: MetadataSearchHit) -> UnifiedHit {
    UnifiedHit {
        job_id: hit.job_id,
        content_id: hit.content_id,
        unit: None,
        title: hit.title,
        author: hit.author,
        thumbnail: hit.thumbnail,
        score: hit.score,
        representation: SearchRepresentation::Metadata,
        provenance_confidence: None,
    }
}

pub fn unit_to_hit(hit: SearchUnitHit) -> UnifiedHit {
    let unit = hit.unit;
    UnifiedHit {
        job_id: unit.job_id,
        content_id: unit.content_id,
        title: unit.title.clone(),
        author: unit.author.clone(),
        thumbnail: unit.match_thumbnail.clone(),
        representation: unit.representation,
        provenance_confidence: unit.confidence,
        unit: Some(unit),
        score: hit.score,
    }
}

pub fn groups_from_hits(hits: Vec<UnifiedHit>, limit: usize) -> Vec<SearchResultGroup> {
    let mut groups: Vec<SearchResultGroup> = Vec::new();
    let mut positions = HashMap::<i64, usize>::new();
    for hit in hits {
        let Some(unit) = hit.unit.clone() else {
            let synthetic = SearchMoment {
                unit_id: 0,
                start_time: None,
                end_time: None,
                excerpt: hit.title.clone().unwrap_or_default(),
                representation: hit.representation,
                match_thumbnail: hit.thumbnail.clone(),
                score: hit.score,
            };
            let provenance = SearchProvenance {
                representation: hit.representation,
                label: hit.representation.label().to_string(),
                timestamp: None,
                confidence: hit.provenance_confidence,
            };
            if let Some(position) = positions.get(&hit.job_id).copied() {
                let group = &mut groups[position];
                group.score = group.score.max(hit.score);
                group.content_id = group.content_id.or(hit.content_id);
                group.title = group.title.clone().or(hit.title);
                group.author = group.author.clone().or(hit.author);
                group.thumbnail = group.thumbnail.clone().or(hit.thumbnail);
                if !group
                    .provenance
                    .iter()
                    .any(|item| item.representation == provenance.representation)
                {
                    group.provenance.push(provenance);
                }
                if group.primary_moment.unit_id == 0 {
                    group.primary_moment = synthetic.clone();
                    group.moments[0] = synthetic;
                }
            } else {
                let group = SearchResultGroup {
                    content_id: hit.content_id,
                    job_id: hit.job_id,
                    title: hit.title,
                    author: hit.author,
                    thumbnail: hit.thumbnail,
                    score: hit.score,
                    primary_moment: synthetic.clone(),
                    moments: vec![synthetic],
                    provenance: vec![provenance],
                    relationship_badges: Vec::new(),
                };
                positions.insert(hit.job_id, groups.len());
                groups.push(group);
            }
            continue;
        };

        let moment = SearchMoment {
            unit_id: unit.id,
            start_time: unit.start_time,
            end_time: unit.end_time,
            excerpt: unit.text.clone(),
            representation: unit.representation,
            match_thumbnail: unit.match_thumbnail.clone(),
            score: hit.score,
        };
        let provenance = SearchProvenance {
            representation: unit.representation,
            label: unit.representation.label().to_string(),
            timestamp: unit.start_time,
            confidence: unit.confidence,
        };
        if let Some(position) = positions.get(&hit.job_id).copied() {
            let group = &mut groups[position];
            group.score = group.score.max(hit.score);
            if !group
                .moments
                .iter()
                .any(|existing| existing.unit_id == moment.unit_id)
            {
                let sufficiently_separate = group.moments.iter().all(|existing| {
                    match (existing.start_time, moment.start_time) {
                        (Some(left), Some(right)) => (left - right).abs() > 2.0,
                        _ => true,
                    }
                });
                if sufficiently_separate && group.moments.len() < 3 {
                    group.moments.push(moment.clone());
                }
            }
            if !group
                .provenance
                .iter()
                .any(|item| item.representation == provenance.representation)
            {
                group.provenance.push(provenance);
            }
            if hit.score > group.primary_moment.score {
                group.primary_moment = moment;
            }
        } else {
            positions.insert(hit.job_id, groups.len());
            groups.push(SearchResultGroup {
                content_id: hit.content_id,
                job_id: hit.job_id,
                title: hit.title,
                author: hit.author,
                thumbnail: hit.thumbnail,
                score: hit.score,
                primary_moment: moment.clone(),
                moments: vec![moment],
                provenance: vec![provenance],
                relationship_badges: Vec::new(),
            });
        }
    }
    groups.sort_by(|left, right| right.score.total_cmp(&left.score));
    groups.truncate(limit);
    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunks_preserve_time_range_and_overlap() {
        let segments = vec![(
            0,
            (0..240)
                .map(|i| format!("w{i}"))
                .collect::<Vec<_>>()
                .join(" "),
            1.0,
            2.0,
        )];
        let chunks = chunk_transcript_segments(&segments, 120, 18);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].start_time, Some(1.0));
        assert_eq!(chunks[0].end_time, Some(2.0));
        assert!(chunks[1].text.starts_with("w102"));
    }

    fn transcript_hit(job_id: i64, unit_id: i64, start_time: f64, score: f32) -> UnifiedHit {
        let unit = SearchUnitRecord {
            id: unit_id,
            job_id,
            content_id: Some(job_id + 100),
            ordinal: unit_id,
            text: format!("match {unit_id}"),
            start_time: Some(start_time),
            end_time: Some(start_time + 1.0),
            representation: SearchRepresentation::Transcript,
            confidence: Some(0.9),
            match_thumbnail: Some(format!("frame-{unit_id}.jpg")),
            title: Some("Video de prueba".to_string()),
            author: Some("Autor".to_string()),
        };
        UnifiedHit {
            job_id,
            content_id: unit.content_id,
            unit: Some(unit),
            title: Some("Video de prueba".to_string()),
            author: Some("Autor".to_string()),
            thumbnail: Some("poster.jpg".to_string()),
            score,
            representation: SearchRepresentation::Transcript,
            provenance_confidence: Some(0.9),
        }
    }

    #[test]
    fn rrf_deduplicates_the_same_unit_across_channels() {
        let fused = fuse_ranked_hits(
            vec![
                vec![transcript_hit(7, 11, 12.0, 0.8)],
                vec![transcript_hit(7, 11, 12.0, 0.7)],
            ],
            20,
            60.0,
        );
        assert_eq!(fused.len(), 1);
        assert!(fused[0].score > 1.0 / 61.0);
    }

    #[test]
    fn grouping_preserves_timestamp_provenance_and_three_moments() {
        let hits = (0..4)
            .map(|index| transcript_hit(7, index + 1, (index * 5) as f64, 1.0 - index as f32 * 0.1))
            .collect();
        let groups = groups_from_hits(hits, 10);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].moments.len(), 3);
        assert_eq!(groups[0].primary_moment.start_time, Some(0.0));
        assert_eq!(
            groups[0].provenance[0].representation,
            SearchRepresentation::Transcript
        );
    }
}
