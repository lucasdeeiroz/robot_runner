/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Colors are now managed via CSS variables in App.css and dynamic injection in App.tsx
            }
        },
    },
    plugins: [],
    darkMode: 'class',
};
