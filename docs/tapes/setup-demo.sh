#!/bin/bash
# Creates the throwaway project the README GIFs are recorded in.
set -e
D="${DEMO_DIR:-$HOME/tools/streamer-demo}"
mkdir -p "$D/src" && cd "$D"
echo '{ "name": "acme-checkout", "version": "1.0.0", "private": true }' > package.json
printf "import { charge } from './payments'\n\nexport async function checkout(cartId: string) {\n  return charge(cartId, { retries: 2 })\n}\n" > src/app.ts
printf "export async function charge(cartId: string, opts: { retries: number }) {\n  return { cartId, ok: true, ...opts }\n}\n" > src/payments.ts
printf 'STRIPE_KEY=sk_test_xxx\n' > .env.example
[ -d .git ] || { git init -q -b main && git add -A && git -c user.name=demo -c user.email=demo@example.com commit -qm init; }
echo "$D"
