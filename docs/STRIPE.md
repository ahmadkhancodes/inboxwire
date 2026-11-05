# Stripe (test mode, acct_1N578JBkP5VKCzMY): Inboxwire by BufferSol
All objects carry `metadata.app=inboxwire`; lookup keys are prefixed `inboxwire_`. Created 5 Nov 2026 via the Stripe connector.

| Product | id | Price | lookup_key | price id |
|---|---|---|---|---|
| Cloud Starter | prod_VZSUnHvkWqPAtV | $24.99 / month | inboxwire_starter_monthly | price_1UYJZqBkP5VKCzMYhi0PlGWs |
| Cloud Growth | prod_VZSUrcDTjAFiOY | $99.99 / month | inboxwire_growth_monthly | price_1UYJZsBkP5VKCzMYzrfMinnx |
| Cloud Growth | prod_VZSUrcDTjAFiOY | $1,043.88 / year | inboxwire_growth_annual | price_1UYJZuBkP5VKCzMYD6MQyilW |
| Self-host licence | prod_VZSUyvDLKmWy8T | $59.99 / month | inboxwire_selfhost_monthly | price_1UYJZwBkP5VKCzMYpltBUQ7t |
| Self-host licence | prod_VZSUyvDLKmWy8T | $708 / year | inboxwire_selfhost_annual | price_1UYJZyBkP5VKCzMYgHErfMgF |
| Extra mailbox | prod_VZSUddSfJ9DFOd | $0.99 / month per unit | inboxwire_extra_mailbox_monthly | price_1UYJZzBkP5VKCzMYlCYssIum |

Notes: Developer (free) has no Stripe object. The extra-mailbox price is licensed (quantity set by the app from the overage count, prorated daily by Stripe); a metered variant can replace it later. GBP/CAD price points are not in the workbook and are not created.
Webhook endpoint and `STRIPE_WEBHOOK_SECRET` are created after the first deploy. Customer Portal must be enabled once: https://dashboard.stripe.com/test/settings/billing/portal

Webhook endpoint `we_1UYJcCBkP5VKCzMY7DDRddw9` -> https://inboxwire.vercel.app/api/stripe/webhook (8 events). Its signing secret is stored only in Vercel env `STRIPE_WEBHOOK_SECRET`. `STRIPE_SECRET_KEY` is not set yet (checkout answers 503 billing_unavailable) until STRIPE_SECRET_KEY_TEST arrives.
