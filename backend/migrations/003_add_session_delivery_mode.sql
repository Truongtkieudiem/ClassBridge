ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(10);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_sessions_delivery_mode'
          AND conrelid = 'sessions'::regclass
    ) THEN
        ALTER TABLE sessions
            ADD CONSTRAINT ck_sessions_delivery_mode
            CHECK (delivery_mode IS NULL OR delivery_mode IN ('ONLINE', 'OFFLINE'));
    END IF;
END
$$;
