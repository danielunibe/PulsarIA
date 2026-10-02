export type SearchMode = 'smart' | 'exact' | 'conceptual';

export type SearchRepresentation =
    | 'transcript'
    | 'ocr'
    | 'caption'
    | 'metadata'
    | 'entity'
    | 'summary'
    | 'vision';

export interface QueryContext {
    baseQuery?: string | null;
    concepts: string[];
    relationship?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    contentType?: string | null;
    profile?: string | null;
    entities: string[];
    mediaLocal?: boolean | null;
}

export interface ParsedFilters {
    relationship?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    contentType?: string | null;
    profile?: string | null;
    entities: string[];
    mediaLocal?: boolean | null;
}

export interface UnifiedSearchRequest {
    query: string;
    mode: SearchMode;
    limit: number;
    context?: QueryContext | null;
}

export interface SearchCapabilities {
    lexical: boolean;
    vector: boolean;
    ocr: boolean;
    vision: boolean;
    reranker: boolean;
}

export interface SearchMoment {
    unitId: number;
    startTime?: number | null;
    endTime?: number | null;
    excerpt: string;
    representation: SearchRepresentation;
    matchThumbnail?: string | null;
    score: number;
}

export interface SearchProvenance {
    representation: SearchRepresentation;
    label: string;
    timestamp?: number | null;
    confidence?: number | null;
}

export interface UnifiedSearchResultGroup {
    contentId?: number | null;
    jobId: number;
    title?: string | null;
    author?: string | null;
    thumbnail?: string | null;
    score: number;
    primaryMoment: SearchMoment;
    moments: SearchMoment[];
    provenance: SearchProvenance[];
    relationshipBadges: string[];
}

export interface UnifiedSearchResponse {
    normalizedQuery: string;
    mode: SearchMode;
    parsedFilters: ParsedFilters;
    context: QueryContext;
    results: UnifiedSearchResultGroup[];
    capabilities: SearchCapabilities;
}

export function normalizeSearchMode(value: unknown): SearchMode {
    switch (String(value ?? '').trim().toLowerCase()) {
        case 'exact':
        case 'literal':
            return 'exact';
        case 'conceptual':
        case 'semantic':
            return 'conceptual';
        default:
            return 'smart';
    }
}

export function searchModeLabel(mode: SearchMode): string {
    switch (mode) {
        case 'exact':
            return 'Exacta';
        case 'conceptual':
            return 'Conceptual';
        default:
            return 'Smart';
    }
}

export function representationLabel(representation: SearchRepresentation): string {
    switch (representation) {
        case 'transcript':
            return 'Voz';
        case 'ocr':
            return 'Texto en pantalla';
        case 'caption':
            return 'Caption';
        case 'metadata':
            return 'Metadata';
        case 'entity':
            return 'Entidad';
        case 'summary':
            return 'Coincidencia conceptual';
        case 'vision':
            return 'Visión';
        default:
            return 'Coincidencia';
    }
}

export function formatSearchTimestamp(seconds?: number | null): string | null {
    if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function emptySearchContext(): QueryContext {
    return {
        baseQuery: null,
        concepts: [],
        relationship: null,
        dateFrom: null,
        dateTo: null,
        contentType: null,
        profile: null,
        entities: [],
        mediaLocal: null,
    };
}

export function normalizeUnifiedResponse(raw: Partial<UnifiedSearchResponse> & { results?: unknown }): UnifiedSearchResponse {
    const results = Array.isArray(raw.results) ? raw.results as UnifiedSearchResultGroup[] : [];
    const context = raw.context ?? emptySearchContext();
    return {
        normalizedQuery: raw.normalizedQuery ?? '',
        mode: normalizeSearchMode(raw.mode),
        parsedFilters: raw.parsedFilters ?? {
            relationship: null,
            dateFrom: null,
            dateTo: null,
            contentType: null,
            profile: null,
            entities: [],
            mediaLocal: null,
        },
        context,
        results,
        capabilities: raw.capabilities ?? {
            lexical: true,
            vector: false,
            ocr: false,
            vision: false,
            reranker: false,
        },
    };
}
