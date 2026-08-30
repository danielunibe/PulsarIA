'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FaCheck, FaXmark, FaInfo } from 'react-icons/fa6';

// ============================================================
// ToastNotification — Sistema de Feedback Visual
// S03 (UX Audit): Feedback de acciones completadas
// Aporta cierre del ciclo de usuario (completar procesamiento)
// ============================================================

/**
 * Tipos de notificación toast disponibles.
 * 
 * - `success`: Operación completada exitosamente (verde)
 * - `error`: Error en la operación (rojo)
 * - `info`: Información general (blanco)
 * - `processing`: Operación en progreso (cian, con spinner)
 */
export type ToastType = 'success' | 'error' | 'info' | 'processing';

/**
 * Datos de un toast de notificación.
 */
export interface ToastData {
    /** ID único del toast (para dismiss) */
    id: string;
    /** Mensaje principal del toast */
    message: string;
    /** Subtítulo o descripción adicional */
    subtitle?: string;
    /** Tipo de notificación (success, error, info, processing) */
    type: ToastType;
    /** Duración en ms antes de auto-dismiss (default: 4000) */
    duration?: number;
}

interface ToastNotificationProps {
    toasts: ToastData[];
    onDismiss: (id: string) => void;
}

// ── Solid Icons (Filled) ──
const SolidCheckIcon = () => <FaCheck size={14} />;
const SolidXIcon = () => <FaXmark size={14} />;
const SolidInfoIcon = () => <FaInfo size={14} />;

function ToastIcon({ type }: { type: ToastType }) {
    if (type === 'success') return <SolidCheckIcon />;
    if (type === 'error') return <SolidXIcon />;
    if (type === 'processing') return <Loader2 size={14} strokeWidth={2} className="animate-spin" />;
    return <SolidInfoIcon />;
}

const TOAST_COLORS: Record<ToastType, { icon: string; glow: string; bar: string; bg: string }> = {
    success: { icon: '#10b981', glow: 'rgba(16,185,129,0.25)', bar: '#10b981', bg: 'rgba(16,185,129,0.08)' },
    error: { icon: '#f92a4e', glow: 'rgba(249,42,78,0.25)', bar: '#f92a4e', bg: 'rgba(249,42,78,0.08)' },
    processing: { icon: '#25f4ee', glow: 'rgba(37,244,238,0.2)', bar: '#25f4ee', bg: 'rgba(37,244,238,0.06)' },
    info: { icon: 'rgba(255,255,255,0.7)', glow: 'rgba(255,255,255,0.1)', bar: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.04)' },
};

function SingleToast({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
    const [visible, setVisible] = useState(false);
    const colors = TOAST_COLORS[toast.type];

    useEffect(() => {
        // Entrance animation
        const enterTimer = setTimeout(() => setVisible(true), 20);

        // Auto-dismiss
        const dismissDelay = toast.duration ?? 4000;
        const dismissTimer = setTimeout(() => {
            setVisible(false);
            setTimeout(() => onDismiss(toast.id), 300);
        }, dismissDelay);

        return () => {
            clearTimeout(enterTimer);
            clearTimeout(dismissTimer);
        };
    }, [toast.id, toast.duration, onDismiss]);

    return (
        <div
            className="flex items-start gap-3 px-4 py-3 rounded-[24px] cursor-pointer select-none"
            style={{
                background: `linear-gradient(145deg, #1e1e1e, #141414)`,
                border: `1px solid rgba(255,255,255,0.06)`,
                boxShadow: `0 20px 40px rgba(0,0,0,0.7), 0 0 20px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
                transform: visible ? 'translateX(0) scale(1)' : 'translateX(20px) scale(0.96)',
                opacity: visible ? 1 : 0,
                transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease',
                minWidth: '280px',
                maxWidth: '340px',
                position: 'relative',
                overflow: 'hidden',
            }}
            onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300); }}
        >
            {/* Colored left accent bar */}
            <div
                style={{
                    position: 'absolute',
                    left: 0, top: 0, bottom: 0,
                    width: '3px',
                    background: colors.bar,
                    borderRadius: '2px 0 0 2px',
                    boxShadow: `0 0 8px ${colors.glow}`,
                }}
            />

            {/* Icon */}
            <div
                className="flex-shrink-0 flex items-center justify-center rounded-full"
                style={{
                    width: '28px',
                    height: '28px',
                    background: colors.bg,
                    border: `1px solid ${colors.icon}30`,
                    color: colors.icon,
                    boxShadow: `0 0 10px ${colors.glow}`,
                    marginLeft: '8px',
                }}
            >
                <ToastIcon type={toast.type} />
            </div>

            {/* Text */}
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="text-[11px] font-bold text-white/90 leading-tight">
                    {toast.message}
                </span>
                {toast.subtitle && (
                    <span className="text-[9px] text-white/40 leading-tight truncate">
                        {toast.subtitle}
                    </span>
                )}
            </div>
        </div>
    );
}

/**
 * ToastContainer — Contenedor de notificaciones toast.
 * 
 * Renderiza una pila fija en la esquina inferior derecha con
 * animaciones de entrada/salida y auto-dismiss.
 */
export function ToastContainer({ toasts, onDismiss }: ToastNotificationProps) {
    if (toasts.length === 0) return null;

    return (
        <div
            className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-auto"
            style={{ alignItems: 'flex-end' }}
        >
            {toasts.map((toast) => (
                <SingleToast key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
}
