/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: 'var(--bg-app)',
                surface: 'var(--bg-surface)',
                'surface-hover': 'var(--bg-surface-hover)',
                border: 'var(--border-default)',
                primary: 'var(--color-primary)',
                // Text
                'text-primary': 'var(--text-app)',
                'text-secondary': 'var(--text-muted)',
                'text-muted': 'var(--text-disabled)',
                // Status
                success: 'var(--status-success-text)',
                'success-bg': 'var(--status-success-bg)',
                error: 'var(--status-error-text)',
                'error-bg': 'var(--status-error-bg)',
                warning: 'var(--status-warning-text)',
                'warning-bg': 'var(--status-warning-bg)',
            }
        },
    },
    plugins: [],
    darkMode: 'class',
}
