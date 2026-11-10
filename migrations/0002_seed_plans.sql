-- 0002_seed_plans.sql: Seed standard commercial pricing plans for Zalo BaaS

INSERT OR REPLACE INTO plans (id, name, price_vnd, max_bots, monthly_ai_messages, max_documents, max_doc_mb, features)
VALUES 
  (
    'trial',
    'Dùng thử 7 ngày',
    0,
    1,
    1000,
    3,
    5,
    '{"rag": true, "markdown": true, "typing_action": true, "handover": true, "trial_days": 7}'
  ),
  (
    'starter',
    'Starter',
    99000,
    1,
    3000,
    10,
    15,
    '{"rag": true, "markdown": true, "typing_action": true, "handover": true, "drive_rag": false, "strict_grounding": false, "custom_tools": false}'
  ),
  (
    'pro',
    'Pro',
    299000,
    3,
    15000,
    30,
    50,
    '{"rag": true, "markdown": true, "typing_action": true, "handover": true, "drive_rag": true, "strict_grounding": false, "custom_tools": true, "crm": true}'
  ),
  (
    'enterprise',
    'Enterprise',
    499000,
    5,
    50000,
    100,
    200,
    '{"rag": true, "markdown": true, "typing_action": true, "handover": true, "drive_rag": true, "strict_grounding": true, "custom_tools": true, "dedicated_support": true, "crm": true}'
  );
