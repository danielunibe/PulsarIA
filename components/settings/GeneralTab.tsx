import React from 'react';
import { AppTheme, PlaybackProfile, SubtitleStyle } from '@/lib/settings-context';
import { SectionCard, SectionTitle, THEME_OPTIONS, FORMAT_CATEGORIES } from './types';
import { FaLanguage, FaPalette, FaDownload, FaFolder, FaCheck, FaShieldHalved, FaEye, FaLayerGroup, FaMagnifyingGlass, FaBrain } from '@/components/icon-library';
import { PagePanel, type PageConfig } from '../PagePanel';
import type { SearchMode } from '../Header';

interface GeneralTabProps {
    locale: 'es-MX' | 'en-US';
    setLocale: (locale: 'es-MX' | 'en-US') => void;
    t: (key: any, params?: any) => string;
    selectedTheme: AppTheme;
    handleSelectTheme: (theme: AppTheme) => void;
    formats: string[];
    toggleFormat: (id: string) => void;
    videoFit: 'cover' | 'contain';
    setVideoFit: (fit: 'cover' | 'contain') => void;
    folder: string;
    setFolder: (folder: string) => void;
    autostartEnabled: boolean;
    setAutostartEnabled: (enabled: boolean) => void;
    keepInTrayOnClose: boolean;
    setKeepInTrayOnClose: (enabled: boolean) => void;
    isTauri: boolean;
    onReviewConsent?: () => void;
    subtitleEnabled: boolean;
    setSubtitleEnabled: (enabled: boolean) => void;
    subtitleStyle: SubtitleStyle;
    setSubtitleStyle: (style: SubtitleStyle) => void;
    playbackProfile: PlaybackProfile;
    setPlaybackProfile: (profile: PlaybackProfile) => void;
    gpuEnhancementEnabled: boolean;
    setGpuEnhancementEnabled: (enabled: boolean) => void;
    showTikTokPill: boolean;
    setShowTikTokPill: (enabled: boolean) => void;
    hoverAutoplay: boolean;
    setHoverAutoplay: (enabled: boolean) => void;
    showDemoVideos: boolean;
    setShowDemoVideos: (enabled: boolean) => void;
    pageConfig?: PageConfig;
    onPageConfigChange?: (config: PageConfig) => void;
    searchMode?: SearchMode;
    onSearchModeChange?: (mode: SearchMode) => void;
}

export function GeneralTab({
    locale,
    setLocale,
    t,
    selectedTheme,
    handleSelectTheme,
    formats,
    toggleFormat,
    videoFit,
    setVideoFit,
    folder,
    setFolder,
    autostartEnabled,
    setAutostartEnabled,
    keepInTrayOnClose,
    setKeepInTrayOnClose,
    isTauri,
    onReviewConsent,
    subtitleEnabled,
    setSubtitleEnabled,
    subtitleStyle,
    setSubtitleStyle,
    playbackProfile,
    setPlaybackProfile,
    gpuEnhancementEnabled,
    setGpuEnhancementEnabled,
    showTikTokPill,
    setShowTikTokPill,
    hoverAutoplay,
    setHoverAutoplay,
    showDemoVideos,
    setShowDemoVideos,
    pageConfig,
    onPageConfigChange,
    searchMode = 'smart',
    onSearchModeChange,
}: GeneralTabProps) {
    return (
        <div className="flex flex-col gap-4">
            {/* Idioma */}
            <SectionCard>
                <SectionTitle icon={FaLanguage} label={t('language')} />
                <div className="grid grid-cols-2 gap-2">
                    {([
                        ['es-MX', t('spanish')],
                        ['en-US', t('english')],
                    ] as const).map(([value, label]) => {
                        const isSelected = locale === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => setLocale(value)}
                                className={`rounded-[14px] px-3.5 py-2.5 text-left text-[11px] font-bold transition-all cursor-pointer ${
                                    isSelected
                                        ? 'bg-white/10 text-white border border-white/20 shadow-[0_2px_12px_rgba(255,255,255,0.08)]'
                                        : 'bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white border border-transparent'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span>{label}</span>
                                    {isSelected && <FaCheck size={10} className="text-white" />}
                                </div>
                            </button>
                        );
                    })}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-white/40">{t('chooseLanguageDescription')}</p>
            </SectionCard>

            {/* Barra superior */}
            <SectionCard className="flex flex-col gap-3">
                <SectionTitle icon={FaEye} label="Barra superior" />
                <div className="flex flex-col gap-2 rounded-[14px] bg-black/30 p-2.5 shadow-inner">
                    {[
                        { label: 'Píldora de TikToks', description: 'Muestra solo el conteo real de la biblioteca.', value: showTikTokPill, setValue: setShowTikTokPill },
                        { label: 'Autoplay al pasar el cursor', description: 'Reproduce videos reales al mantener el cursor encima.', value: hoverAutoplay, setValue: setHoverAutoplay },
                        { label: 'Mostrar ejemplos DEMO', description: 'Activa previews temporales fuera de SQLite.', value: showDemoVideos, setValue: setShowDemoVideos },
                    ].map((option) => (
                        <label key={option.label} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/[.04]">
                            <span className="min-w-0">
                                <span className="block text-xs font-bold text-white/85">{option.label}</span>
                                <span className="mt-0.5 block text-[10px] text-white/40">{option.description}</span>
                            </span>
                            <input
                                type="checkbox"
                                checked={option.value}
                                onChange={(event) => option.setValue(event.target.checked)}
                                className="h-4 w-4 shrink-0 accent-[#25f4ee]"
                            />
                        </label>
                    ))}
                </div>
                {onReviewConsent && (
                    <button
                        type="button"
                        onClick={onReviewConsent}
                        className="flex items-center justify-between gap-3 rounded-[14px] border border-white/[0.08] bg-white/[0.035] px-3.5 py-3 text-left transition-colors hover:border-[#25f4ee]/35 hover:bg-[#25f4ee]/[0.06]"
                    >
                        <span>
                            <span className="block text-xs font-bold text-white/85">Revisar consentimiento</span>
                            <span className="mt-0.5 block text-[10px] text-white/40">Consulta nuevamente los documentos y derechos de contenido.</span>
                        </span>
                        <span aria-hidden="true" className="text-[10px] font-black uppercase tracking-wider text-[#25f4ee]">Abrir</span>
                    </button>
                )}
            </SectionCard>

            {pageConfig && onPageConfigChange && (
                <div className="flex flex-col gap-3">
                    <SectionCard className="flex flex-col gap-2.5">
                        <SectionTitle icon={FaLayerGroup} label="Biblioteca y búsqueda" />
                        <p className="text-[10px] leading-relaxed text-white/40">
                            La disposición, el orden y los filtros de la biblioteca viven aquí. La barra superior queda reservada para acciones directas.
                        </p>
                    </SectionCard>
                    <PagePanel config={pageConfig} onChange={onPageConfigChange} />
                    <SectionCard className="flex flex-col gap-3">
                        <SectionTitle icon={FaMagnifyingGlass} label="Modo de búsqueda" />
                        <div className="grid grid-cols-3 gap-2">
                            {([
                                { id: 'smart' as SearchMode, label: 'Smart', description: 'Todos los canales', Icon: FaBrain },
                                { id: 'exact' as SearchMode, label: 'Exacta', description: 'Texto y filtros', Icon: FaMagnifyingGlass },
                                { id: 'conceptual' as SearchMode, label: 'Conceptual', description: 'Por significado', Icon: FaBrain },
                            ]).map((option) => {
                                const Icon = option.Icon;
                                const selected = searchMode === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => onSearchModeChange?.(option.id)}
                                        className={`flex min-w-0 flex-col items-center gap-1 rounded-[14px] border px-2 py-3 text-center transition-all ${selected
                                            ? 'border-[#25f4ee]/35 bg-[#25f4ee]/[0.10] text-white shadow-[0_0_14px_rgba(37,244,238,0.10)]'
                                            : 'border-white/[0.06] bg-white/[0.03] text-white/45 hover:bg-white/[0.06] hover:text-white/85'
                                            }`}
                                    >
                                        <Icon size={13} />
                                        <span className="text-[10px] font-bold leading-none">{option.label}</span>
                                        <span className="text-[8px] leading-none text-white/35">{option.description}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </SectionCard>
                </div>
            )}

            {/* Tema de Fondo */}
            <div
                className="rounded-[28px] p-5 sm:p-6 relative overflow-hidden transition-all"
                style={{
                    background: '#131418',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), inset 0 1px 1px 0 rgba(255, 255, 255, 0.07)',
                }}
            >
                {/* Cabecera limpia y minimalista */}
                <div className="flex items-center justify-between mb-5 relative z-10">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center shadow-lg bg-neutral-800 border border-white/10 text-white">
                            <FaPalette className="w-3.5 h-3.5 text-neutral-300" />
                        </div>
                        <h2 className="text-xs font-bold tracking-[0.14em] uppercase text-neutral-300 font-mono">
                            TEMA DE FONDO
                        </h2>
                    </div>

                    <span className="text-[11px] font-mono font-semibold tracking-wider text-neutral-400 bg-white/[0.05] border border-white/10 px-2.5 py-1 rounded-full uppercase">
                        {THEME_OPTIONS.length} OPCIONES
                    </span>
                </div>

                {/* Cuadrícula con 6 temas limpios y cuadrados */}
                <div
                    className="grid grid-cols-2 sm:grid-cols-3 gap-3 relative z-10"
                    role="radiogroup"
                    aria-label="Temas de fondo"
                >
                    {THEME_OPTIONS.map((theme) => {
                        const isSelected = selectedTheme === theme.id;
                        return (
                            <div
                                key={theme.id}
                                role="radio"
                                aria-checked={isSelected}
                                tabIndex={0}
                                onClick={() => handleSelectTheme(theme.id)}
                                onKeyDown={(e) => {
                                    if (e.key === ' ' || e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSelectTheme(theme.id);
                                    }
                                }}
                                className={`aspect-square rounded-2xl p-3 border cursor-pointer select-none flex flex-col justify-between relative overflow-hidden group shadow-md transition-all duration-200 ${
                                    isSelected
                                        ? 'ring-2 ring-white/90 scale-[1.02]'
                                        : 'hover:border-white/40 hover:-translate-y-0.5 hover:scale-[1.02]'
                                }`}
                                style={{
                                    background: theme.fullBg,
                                    borderColor: isSelected ? theme.borderActive : 'rgba(255, 255, 255, 0.16)',
                                    boxShadow: isSelected
                                        ? `${theme.accentGlow}, inset 0 1px 1px 0 rgba(255, 255, 255, 0.45)`
                                        : '0 6px 16px -4px rgba(0, 0, 0, 0.45), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)',
                                }}
                            >
                                {/* Capa de brillo superior para efecto de cristal satinado */}
                                <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/40 pointer-events-none" />

                                {/* Indicador de selección circular en esquina superior derecha */}
                                <div className="w-full flex justify-end relative z-10">
                                    <div
                                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
                                            isSelected
                                                ? `${theme.checkColor} scale-100`
                                                : 'bg-black/35 backdrop-blur-md border border-white/20 text-transparent opacity-0 group-hover:opacity-100 group-hover:scale-95'
                                        }`}
                                    >
                                        <FaCheck size={9} className="stroke-[3.5]" />
                                    </div>
                                </div>

                                {/* Nombre del tema con pastilla esmerilada limpia */}
                                <div className="relative z-10 w-full mt-auto">
                                    <div className="backdrop-blur-md bg-black/45 border border-white/10 rounded-xl px-2.5 py-1.5 flex items-center justify-center text-center shadow-md">
                                        <h3 className="font-semibold text-xs tracking-tight text-white drop-shadow-sm truncate">
                                            {theme.name}
                                        </h3>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Formatos de Descarga */}
            <SectionCard className="flex flex-col gap-5">
                <SectionTitle icon={FaDownload} label="Formatos de Descarga" />

                {FORMAT_CATEGORIES.map(category => {
                    const CategoryIcon = category.icon;
                    return (
                        <div key={category.title} className="flex flex-col gap-2.5">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-5 h-5 rounded-[6px] flex items-center justify-center shadow-sm"
                                        style={{
                                            background: `${category.options[0].color}18`,
                                            boxShadow: `0 0 8px ${category.options[0].color}25`,
                                            color: category.options[0].color,
                                        }}
                                    >
                                        <CategoryIcon size={11} />
                                    </div>
                                    <span className="font-black tracking-[0.2em] uppercase text-[10px] text-white/50">
                                        {category.title}
                                    </span>
                                </div>
                                <span className="text-[9px] font-bold opacity-30 tracking-widest uppercase">{category.options.length} opciones</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {category.options.map(fmt => {
                                    const on = formats.includes(fmt.id);
                                    return (
                                        <button
                                            type="button"
                                            key={fmt.id}
                                            aria-pressed={on}
                                            onClick={() => toggleFormat(fmt.id)}
                                            className="group relative flex flex-col items-start p-3 rounded-[14px] transition-all duration-300 text-left cursor-pointer"
                                            style={{
                                                background: on
                                                    ? `linear-gradient(135deg, ${fmt.color}22, ${fmt.color}08)`
                                                    : 'rgba(255,255,255,0.025)',
                                                boxShadow: on ? `0 6px 18px -4px ${fmt.color}40` : '0 2px 6px rgba(0,0,0,0.15)',
                                            }}
                                        >
                                            <div className="flex items-center justify-between w-full mb-1.5">
                                                <div
                                                    className="px-2 py-0.5 rounded-[6px] font-black text-[9px] tracking-wider"
                                                    style={{
                                                        background: on ? fmt.color : 'rgba(255,255,255,0.05)',
                                                        color: on ? '#fff' : 'rgba(255,255,255,0.4)',
                                                    }}
                                                >
                                                    {fmt.label}
                                                </div>
                                                <div
                                                    className="w-4 h-4 rounded-full flex items-center justify-center"
                                                    style={{
                                                        background: on ? fmt.color : 'rgba(255,255,255,0.05)',
                                                    }}
                                                >
                                                    {on && <FaCheck size={9} color="#fff" />}
                                                </div>
                                            </div>
                                            <span className="block font-bold text-[10px] text-left text-white/80">
                                                {fmt.desc}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </SectionCard>

            {/* Ajuste de Video */}
            <SectionCard className="flex flex-col gap-3">
                <SectionTitle icon={FaPalette} label="Visualización de Video" />
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        aria-pressed={videoFit === 'cover'}
                        onClick={() => setVideoFit('cover')}
                        className={`rounded-[14px] px-3.5 py-2.5 text-[10px] font-bold transition-all cursor-pointer ${
                            videoFit === 'cover'
                                ? 'bg-[#25f4ee]/15 text-[#25f4ee] shadow-[0_2px_12px_rgba(37,244,238,0.2)]'
                                : 'bg-white/[0.03] text-white/50 hover:text-white/80 hover:bg-white/[0.06]'
                        }`}
                    >
                        Rellenar video (Cover)
                    </button>
                    <button
                        type="button"
                        aria-pressed={videoFit === 'contain'}
                        onClick={() => setVideoFit('contain')}
                        className={`rounded-[14px] px-3.5 py-2.5 text-[10px] font-bold transition-all cursor-pointer ${
                            videoFit === 'contain'
                                ? 'bg-[#25f4ee]/15 text-[#25f4ee] shadow-[0_2px_12px_rgba(37,244,238,0.2)]'
                                : 'bg-white/[0.03] text-white/50 hover:text-white/80 hover:bg-white/[0.06]'
                        }`}
                    >
                        Mostrar completo (Contain)
                    </button>
                </div>
                <p className="text-[10px] leading-relaxed text-white/40">
                    Controla si el reproductor adapta la miniatura al espacio completo o conserva la proporción exacta original.
                </p>
            </SectionCard>

            <SectionCard className="flex flex-col gap-3">
                <SectionTitle icon={FaEye} label="Cinema · reproducción" />
                <label className="flex items-center justify-between gap-3 rounded-[14px] bg-black/30 p-3.5">
                    <span><span className="block text-xs font-bold text-white/90">Subtítulos sincronizados</span><span className="mt-0.5 block text-[10px] text-white/40">Usa la transcripción local cuando el video la tenga.</span></span>
                    <input type="checkbox" checked={subtitleEnabled} onChange={(event) => setSubtitleEnabled(event.target.checked)} className="h-4 w-4 accent-[#25f4ee]" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {(['auto', 'karaoke', 'minimal', 'cinematic'] as SubtitleStyle[]).map((style) => <button key={style} type="button" aria-pressed={subtitleStyle === style} onClick={() => setSubtitleStyle(style)} className={`rounded-xl px-3 py-2 text-[10px] font-bold ${subtitleStyle === style ? 'bg-[#25f4ee]/15 text-[#25f4ee]' : 'bg-white/[0.03] text-white/50'}`}>{style === 'auto' ? 'Automático' : style[0].toUpperCase() + style.slice(1)}</button>)}
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {(['efficient', 'intelligent', 'maximum'] as PlaybackProfile[]).map((profile) => <button key={profile} type="button" aria-pressed={playbackProfile === profile} onClick={() => setPlaybackProfile(profile)} className={`rounded-xl px-2 py-2 text-[9px] font-bold ${playbackProfile === profile ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-white/50'}`}>{profile === 'efficient' ? 'Eficiente' : profile === 'maximum' ? 'Máxima calidad' : 'Inteligente'}</button>)}
                </div>
                <p className="rounded-[14px] bg-black/30 p-3.5 text-[10px] leading-relaxed text-white/40">La presencia de WebGL o NVIDIA no se etiqueta como RTX. Las pruebas reales de Whisper, FFmpeg y LLM están en Ajustes → Rendimiento.</p>
            </SectionCard>

            {/* Carpeta de Descargas */}
            <SectionCard className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <SectionTitle icon={FaFolder} label={t('saveFolder')} />
                    {isTauri && (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        const { invoke } = await import('@tauri-apps/api/core');
                                        const selected = await invoke<string | null>('pick_folder');
                                        if (selected) {
                                            setFolder(selected);
                                        }
                                    } catch (e) {
                                        console.error('Error al seleccionar carpeta:', e);
                                    }
                                }}
                                className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-[#25f4ee] hover:bg-[#25f4ee]/15 hover:border-[#25f4ee]/30 transition-all cursor-pointer"
                            >
                                Examinar…
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!folder) return;
                                    try {
                                        const { invoke } = await import('@tauri-apps/api/core');
                                        await invoke('open_folder_in_explorer', { path: folder });
                                    } catch (e) {
                                        console.error('Error al abrir carpeta:', e);
                                    }
                                }}
                                className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white/70 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                            >
                                Abrir
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-[14px] bg-black/40 shadow-inner">
                    <div className="shrink-0 flex items-center justify-center text-white/40">
                        <FaFolder size={14} />
                    </div>
                    <input
                        type="text"
                        value={folder}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFolder(e.target.value)}
                        className="flex-1 bg-transparent outline-none font-mono text-xs text-white placeholder:text-white/25"
                        placeholder="~/Descargas/TikTok"
                    />
                </div>
                <p className="text-[10px] text-white/40 leading-relaxed">
                    Los videos y medios procesados se almacenan automáticamente en este directorio.
                </p>
            </SectionCard>

            {/* Inicio con Windows */}
            <SectionCard className="flex flex-col gap-3">
                <label className="flex items-center justify-between gap-3 rounded-[14px] bg-black/30 p-3.5 shadow-inner cursor-pointer">
                    <div>
                        <span className="block font-bold text-xs text-white/90">Mantener en la bandeja al cerrar</span>
                        <span className="block text-[10px] text-white/40 mt-0.5">Las descargas y sincronizaciones continúan aunque ocultes la ventana.</span>
                    </div>
                    <input
                        type="checkbox"
                        checked={keepInTrayOnClose}
                        disabled={!isTauri}
                        onChange={(event) => setKeepInTrayOnClose(event.target.checked)}
                        className="h-4 w-4 accent-[#25f4ee] cursor-pointer"
                    />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-[14px] bg-black/30 p-3.5 shadow-inner cursor-pointer">
                    <div>
                        <span className="block font-bold text-xs text-white/90">Iniciar con Windows</span>
                        <span className="block text-[10px] text-white/40 mt-0.5">Pulsaria se mantiene en segundo plano en la bandeja del sistema.</span>
                    </div>
                    <input
                        type="checkbox"
                        checked={autostartEnabled}
                        disabled={!isTauri}
                        onChange={(event) => setAutostartEnabled(event.target.checked)}
                        className="h-4 w-4 accent-[#25f4ee] cursor-pointer"
                    />
                </label>
            </SectionCard>

            {/* Documentos Legales */}
            <SectionCard className="flex flex-col gap-3">
                <SectionTitle icon={FaShieldHalved} label="Documentos Legales" />
                <p className="text-[10px] leading-relaxed text-white/45">
                    Consulta las condiciones del beta, privacidad, contenido autorizado, seguridad y avisos antes de distribuir o utilizar Pulsaria.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                    {[
                        { label: 'EULA', url: 'https://github.com/danielunibe/PulsarIA/blob/main/EULA.es.md' },
                        { label: 'Privacidad', url: 'https://github.com/danielunibe/PulsarIA/blob/main/PRIVACY.es.md' },
                        { label: 'Contenido', url: 'https://github.com/danielunibe/PulsarIA/blob/main/CONTENT_POLICY.es.md' },
                        { label: 'Seguridad', url: 'https://github.com/danielunibe/PulsarIA/blob/main/SECURITY.md' },
                    ].map(doc => (
                        <a
                            key={doc.label}
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-[10px] bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 text-[10px] font-bold text-[#25f4ee] transition-colors shadow-sm"
                        >
                            {doc.label}
                        </a>
                    ))}
                </div>
            </SectionCard>
        </div>
    );
}
