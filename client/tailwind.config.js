/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 狼人杀主题色
        wolf: {
          50: '#fef3f2',
          100: '#fce4e4',
          200: '#f9cccc',
          300: '#f49999',
          400: '#ed5f5f',
          500: '#e63c3c',
          600: '#d62424',
          700: '#b31a1a',
          800: '#951a1a',
          900: '#7f1d1d',
        },
        night: {
          50: '#f0f1f8',
          100: '#e0e3f0',
          200: '#c3c8e1',
          300: '#9ba2cb',
          400: '#727db3',
          500: '#55619a',
          600: '#444e82',
          700: '#3a426b',
          800: '#323858',
          900: '#2a2f49',
          950: '#1a1d2e',
        },
      },
    },
  },
  plugins: [],
};
