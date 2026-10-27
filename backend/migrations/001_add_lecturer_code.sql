ALTER TABLE lecturers
ADD COLUMN IF NOT EXISTS lecturer_code VARCHAR(30);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lecturers_lecturer_code
ON lecturers (lecturer_code)
WHERE lecturer_code IS NOT NULL;
