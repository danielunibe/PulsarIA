import React from 'react';

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  return (
    <div
      className={`toast ${message ? 'on' : ''}`}
      id="toast"
      role="status"
      aria-live="polite"
    >
      <span id="toastMsg">{message || ''}</span>
    </div>
  );
};
