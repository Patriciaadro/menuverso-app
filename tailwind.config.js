// Menuverso Tailwind build config (QA item 17). Mirrors the inline config the
// Play CDN used. Rebuild after adding classes:
//   npm run build:css   (tailwindcss 3.4.17, then stamps the ?v= hash in index.html)
module.exports = {
 content: ['./index.html'],
 theme: {
 extend: {
 colors: {
 // === NOMOLESTEN v4, white paper, near-black text, red brand ===
 // Same token NAMES as warm v3 (kept to avoid thousands of class
 // renames), but the hex values now point to Nomolesten's palette:
 // red NM #F4291A · red dark #C81C10 · near-black #1D1D1B ·
 // Tailwind grays · star yellow #FBBC04.
 //
 // Revert options (cd to project root, copy backup over the live file):
 // to warm v3 (pastel): cp Menuverso-demo.nomolesten-pre.bak.html Menuverso-demo.html
 // to warm-dark v2: cp Menuverso-demo.warm2.bak.html Menuverso-demo.html
 // to gentle warm v1: cp Menuverso-demo.warm1.bak.html Menuverso-demo.html
 // to cool slate v0: cp Menuverso-demo.cool.bak.html Menuverso-demo.html
 // ================================================================
 // Page surfaces. ink-950 stays pure white; the warmer cream tones
 // become Tailwind grays (subtle tonal breaks instead of cream paper).
 ink: { 950:'#FAF6EE', 900:'#FFFFFF', 800:'#EFE8D9', 700:'#1A1613' },
 // Text / ink-on-paper, near-black tones. Lower number = darker (max contrast).
 // Headlines: slate2-50 (#1D1D1B). Body: slate2-300. Muted: slate2-500.
 slate2:{ 50:'#1A1613', 100:'#241F1B', 200:'#3D3631', 300:'#574F47', 400:'#6E655A', 500:'#8A8073' },
 // Cream, replaced by Tailwind grays for badges/dividers/low-key CTAs.
 cream: { 100:'#F6F1E6', 200:'#ECE5D6', 300:'#D9CDB6', 400:'#C2B49A' },
 // Star yellow swapped to Nomolesten's exact value; pink/emerald kept
 // (universal "like" / "success" semantics).
 accent:{ amber:'#F2B100', pink:'#FF5C8A', emer:'#1F9D63' },
 // Primary brand red: #F4291A (final pick after iterating terracotta).
 // 400 = lighter for hover/light surfaces; 600/700 = darker for active +
 // error variant.
 mv: { 400:'#FF6A4F', 500:'#F4291A', 600:'#C81C10', 700:'#991610' }
 }
 }
 }
};
