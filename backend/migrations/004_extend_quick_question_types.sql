ALTER TABLE quick_questions
    ADD COLUMN IF NOT EXISTS question_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE quick_question_options
    ADD COLUMN IF NOT EXISTS image_data BYTEA,
    ADD COLUMN IF NOT EXISTS image_mime_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS image_name VARCHAR(255);

ALTER TABLE quick_questions
    DROP CONSTRAINT IF EXISTS quick_questions_question_type_check;

ALTER TABLE quick_questions
    ADD CONSTRAINT quick_questions_question_type_check
    CHECK (
        question_type IN (
            'POLL',
            'MULTIPLE_CHOICE',
            'TRUE_FALSE',
            'SHORT_ANSWER',
            'ORDERING',
            'MATCHING'
        )
    );
