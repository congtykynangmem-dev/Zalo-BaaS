-- 0004_subscription_expiry_payment_status.sql
-- Manage subscription expiry period and payment status per tenant

ALTER TABLE tenants ADD COLUMN subscription_started_at INTEGER;
ALTER TABLE tenants ADD COLUMN subscription_expires_at INTEGER;
ALTER TABLE tenants ADD COLUMN payment_status TEXT DEFAULT 'paid';

CREATE INDEX IF NOT EXISTS idx_tenants_expiry ON tenants(subscription_expires_at);
CREATE INDEX IF NOT EXISTS idx_tenants_payment_status ON tenants(payment_status);

