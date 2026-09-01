/**
 * Tailwind CSS v4 hooks into Next.js through PostCSS.
 *
 * If you have seen a guide with a big `tailwind.config.js` full of theme
 * settings, that was Tailwind v3. In v4 the configuration moved into the CSS
 * file itself (see the @theme block in src/app/globals.css), and this is the
 * only build config Tailwind needs.
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
