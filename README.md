# Alhamd Fast-Food & Restaurant — Online Ordering Website

A customer ordering site: browse menu → add to cart → send order on WhatsApp.
The menu is **not** stored in this website — it's read live from the same
Firebase database your POS already writes to (`settings/main`), so anything
you add, edit, or delete in the POS Product Manager appears here automatically.

## What's in this folder
- `index.html` — the whole site
- `css/` — styling (Bootstrap + the Sarab template design + `custom.css` for
  the cart/menu additions)
- `js/menu.js` — connects to Firestore, renders the live menu, runs the cart,
  and builds the WhatsApp checkout link
- `img/logo.jpg` — your logo, pulled from the POS file

## How the sync works
Your POS writes every product (name, category, price/variants, image) into
one Firestore document: `settings/main`. This site opens a **read-only**
live connection to that same document. It never writes anything back —
only your POS can change the menu.

## Before you go live: one thing to check
If the menu shows a "couldn't load" message instead of your items, it's
almost always **Firestore security rules** blocking reads from a new domain.
In the Firebase console → Firestore Database → Rules, make sure reading
`settings/main` is allowed (it already must be, since your POS reads it the
same way, unauthenticated — but double-check after you deploy on a new URL).

## Deploying
Same as your POS (it's on Vercel): drag this folder into a new Vercel
project, or run `vercel` from inside it. Any static host works too
(Netlify, GitHub Pages, Firebase Hosting) since there's no build step —
it's plain HTML/CSS/JS.

## Delivery charges (synced live from the POS, like the menu)
The cart now shows a "Delivery Charges" line and a grand total whenever
`settings/main` has a `deliveryCharge` field (a plain number, e.g. `150`).
This site only *reads* it — the number itself has to be set from your POS
side, the same way products are. If your POS admin panel doesn't have a
field for this yet, you (or whoever manages the POS) can add/update
`deliveryCharge` directly on the `settings/main` document in the Firebase
console for now; once it's there, this site updates instantly, same as menu
items. Leaving it at `0` or removing it hides the delivery line completely.

## WhatsApp order message
The message sent to WhatsApp now lists **items and quantities only** — no
prices, no subtotal, no total. Prices are still shown on the website itself
so customers can browse and build their cart, they're just left out of the
WhatsApp text on purpose so pricing/delivery gets confirmed directly in the
chat.

## Mobile view
Since most customers open this on their phone, the layout has a dedicated
mobile pass: full-width stacked buttons, a horizontally-scrollable category
bar, a single, larger product card per row, and a full-screen cart drawer —
all tuned for touch and small screens.

## Things you can edit directly
- **WhatsApp number** — top of `js/menu.js`, the `WHATSAPP_NUMBER` constant.
- **Colors** — `css/style.css`, the `:root { --primary; --secondary; --dark }`
  block at the very top.
- **Hero text / footer text** — plain text inside `index.html`.

## Known placeholders
I didn't invent a fake address, email, or customer reviews — those sections
were left out (or kept minimal) rather than showing made-up info. Send me
your real address/hours/email any time and I'll drop them in.
