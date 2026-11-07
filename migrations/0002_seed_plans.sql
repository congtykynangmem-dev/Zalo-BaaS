-- 0002_seed_plans.sql: Seed standard pricing plans for Zalo BaaS

INSERT OR IGNORE INTO plans (id, name, price_vnd, max_bots, monthly_ai_messages, max_documents, max_doc_mb, features)
VALUES 
  (
    'starter',
    'Starter',
    199000,
    1,
    1000,
    5,
    10,
    '{"rag": true, "markdown": true, "typing_action": true, "handover": true, "drive_rag": false, "strict_grounding": false, "custom_tools": false}'
  ),
  (
    'pro',
    'Pro',
    599000,
    3,
    10000,
    20,
    50,
    '{"rag": true, "markdown": true, "typing_action": true, "handover": true, "drive_rag": true, "strict_grounding": false, "custom_tools": true}'
  ),
  (
    'enterprise',
    'Enterprise',
    1990000,
    10,
    50000,
    100,
    200,
    '{"rag": true, "markdown": true, "typing_action": true, "handover": true, "drive_rag": true, "strict_grounding": true, "custom_tools": true, "dedicated_support": true}'
  );
