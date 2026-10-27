-- =====================================================================
-- CLASSBRIDGE DATABASE - FULL PROPOSED SCHEMA
-- PostgreSQL 15+ (uses pgcrypto; no pgvector required)
-- Covers the three roles and the UI/function list supplied by the project team.
-- IMPORTANT: This is a fresh-install schema. Back up and migrate existing data
-- before using it on a database that already contains tables.
-- =====================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. ACCOUNTS / AUTHENTICATION
-- Separate role tables retained from the supplied database.sql.
-- Login identifier may be email or phone. Student code is required for students.
-- ---------------------------------------------------------------------
CREATE TABLE admins (
    admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(30) UNIQUE,
    password_hash TEXT NOT NULL,
    preferred_language VARCHAR(2) NOT NULL DEFAULT 'vi' CHECK (preferred_language IN ('en','vi')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lecturers (
    lecturer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(30) UNIQUE,
    password_hash TEXT NOT NULL,
    department VARCHAR(150),
    avatar_url TEXT,
    preferred_language VARCHAR(2) NOT NULL DEFAULT 'vi' CHECK (preferred_language IN ('en','vi')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE students (
    student_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_code VARCHAR(30) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(30) UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    preferred_language VARCHAR(2) NOT NULL DEFAULT 'vi' CHECK (preferred_language IN ('en','vi')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_student_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE otp_verifications (
    otp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_type VARCHAR(10) NOT NULL CHECK (contact_type IN ('EMAIL','PHONE')),
    contact_value VARCHAR(255) NOT NULL,
    purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('REGISTER','LOGIN','RESET_PASSWORD','VERIFY_CONTACT')),
    role_requested VARCHAR(20) CHECK (role_requested IN ('ADMIN','LECTURER','STUDENT')),
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE password_reset_tokens (
    reset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name VARCHAR(20) NOT NULL CHECK (role_name IN ('ADMIN','LECTURER','STUDENT')),
    admin_id UUID REFERENCES admins(admin_id) ON DELETE CASCADE,
    lecturer_id UUID REFERENCES lecturers(lecturer_id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(student_id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_reset_exactly_one_account CHECK (
       (role_name='ADMIN' AND admin_id IS NOT NULL AND lecturer_id IS NULL AND student_id IS NULL) OR
       (role_name='LECTURER' AND lecturer_id IS NOT NULL AND admin_id IS NULL AND student_id IS NULL) OR
       (role_name='STUDENT' AND student_id IS NOT NULL AND admin_id IS NULL AND lecturer_id IS NULL)
    )
);

-- ---------------------------------------------------------------------
-- 2. COURSES / CLASSES / MEMBERS
-- A course describes a subject; a class is a particular lecturer's class offering.
-- ---------------------------------------------------------------------
CREATE TABLE courses (
    course_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_code VARCHAR(40) UNIQUE,
    course_name VARCHAR(200) NOT NULL,
    department VARCHAR(150),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE classes (
    class_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(course_id) ON DELETE SET NULL,
    lecturer_id UUID NOT NULL REFERENCES lecturers(lecturer_id) ON DELETE RESTRICT,
    class_code VARCHAR(30) NOT NULL UNIQUE,
    class_name VARCHAR(150) NOT NULL,
    description TEXT,
    semester VARCHAR(30),
    academic_year VARCHAR(20),
    qr_code_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE class_members (
    class_member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','REMOVED')),
    joined_via VARCHAR(20) NOT NULL DEFAULT 'CODE' CHECK (joined_via IN ('CODE','QR','ADMIN','IMPORT')),
    UNIQUE (class_id, student_id)
);

-- ---------------------------------------------------------------------
-- 3. SCHEDULES AND EXCEL IMPORT
-- Each schedule item can be a class session or an assessment.
-- ---------------------------------------------------------------------
CREATE TABLE schedule_imports (
    import_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lecturer_id UUID NOT NULL REFERENCES lecturers(lecturer_id) ON DELETE RESTRICT,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT,
    file_mime_type VARCHAR(120),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SUCCESS','PARTIAL_SUCCESS','FAILED')),
    total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
    imported_rows INTEGER NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
    failed_rows INTEGER NOT NULL DEFAULT 0 CHECK (failed_rows >= 0),
    error_report JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE TABLE class_schedules (
    schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
    import_id UUID REFERENCES schedule_imports(import_id) ON DELETE SET NULL,
    schedule_type VARCHAR(20) NOT NULL DEFAULT 'CLASS' CHECK (schedule_type IN ('CLASS','QUIZ','EXAM','OTHER')),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    room_name VARCHAR(100),
    meeting_url TEXT,
    recurrence_rule TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','COMPLETED','CANCELLED')),
    created_by_lecturer_id UUID REFERENCES lecturers(lecturer_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_time > start_time)
);

-- ---------------------------------------------------------------------
-- 4. LIVE SESSIONS / PARTICIPANTS
-- sessions are actual or scheduled classroom meetings belonging to a class.
-- ---------------------------------------------------------------------
CREATE TABLE sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
    schedule_id UUID REFERENCES class_schedules(schedule_id) ON DELETE SET NULL,
    session_title VARCHAR(200) NOT NULL,
    description TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','LIVE','ENDED','CANCELLED')),
    delivery_mode VARCHAR(10) CHECK (delivery_mode IS NULL OR delivery_mode IN ('ONLINE','OFFLINE')),
    join_code VARCHAR(20) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE student_sessions (
    student_session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(student_id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    anonymous_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (left_at IS NULL OR left_at >= joined_at),
    UNIQUE (student_id, session_id)
);

-- ---------------------------------------------------------------------
-- 5. LECTURE FILES / SLIDES / TRANSCRIPT / TRANSLATION
-- Files are normally stored outside PostgreSQL; file_url stores the object path.
-- file_data BYTEA is optional for small files stored directly in the database.
-- ---------------------------------------------------------------------
CREATE TABLE lecture_files (
    file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES classes(class_id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(session_id) ON DELETE CASCADE,
    uploaded_by_lecturer_id UUID REFERENCES lecturers(lecturer_id) ON DELETE SET NULL,
    uploaded_by_student_id UUID REFERENCES students(student_id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    original_file_name VARCHAR(255),
    mime_type VARCHAR(150),
    file_extension VARCHAR(20),
    file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
    storage_type VARCHAR(20) NOT NULL DEFAULT 'URL' CHECK (storage_type IN ('URL','BYTEA')),
    file_url TEXT,
    file_data BYTEA,
    file_category VARCHAR(30) NOT NULL DEFAULT 'LECTURE' CHECK (file_category IN ('LECTURE','SLIDE','AUDIO','TRANSCRIPT','SUMMARY_EXPORT','OTHER')),
    visibility VARCHAR(20) NOT NULL DEFAULT 'CLASS' CHECK (visibility IN ('PRIVATE','CLASS','PUBLIC')),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((storage_type='URL' AND file_url IS NOT NULL AND file_data IS NULL) OR
           (storage_type='BYTEA' AND file_data IS NOT NULL AND file_url IS NULL)),
    CHECK (class_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE TABLE lecture_slides (
    slide_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    file_id UUID REFERENCES lecture_files(file_id) ON DELETE SET NULL,
    slide_number INTEGER NOT NULL CHECK (slide_number > 0),
    title VARCHAR(255),
    extracted_text TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (session_id, slide_number)
);

CREATE TABLE transcripts (
    transcript_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    lecturer_id UUID REFERENCES lecturers(lecturer_id) ON DELETE SET NULL,
    file_id UUID REFERENCES lecture_files(file_id) ON DELETE SET NULL,
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    start_seconds NUMERIC(12,3),
    end_seconds NUMERIC(12,3),
    original_text TEXT NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'EN' CHECK (language IN ('EN','VI','MIXED','UNKNOWN')),
    confidence NUMERIC(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    source_type VARCHAR(20) NOT NULL DEFAULT 'STT' CHECK (source_type IN ('STT','MANUAL','IMPORTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (start_seconds IS NULL OR start_seconds >= 0),
    CHECK (end_seconds IS NULL OR start_seconds IS NULL OR end_seconds >= start_seconds),
    UNIQUE (session_id, chunk_index)
);

CREATE TABLE transcript_translations (
    translation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcript_id UUID NOT NULL REFERENCES transcripts(transcript_id) ON DELETE CASCADE,
    source_language VARCHAR(10) NOT NULL CHECK (source_language IN ('EN','VI','MIXED','UNKNOWN')),
    target_language VARCHAR(10) NOT NULL CHECK (target_language IN ('EN','VI')),
    translated_text TEXT NOT NULL,
    provider VARCHAR(100),
    processing_time_ms INTEGER CHECK (processing_time_ms IS NULL OR processing_time_ms >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (transcript_id, target_language)
);

-- Unified searchable text chunks used by chatbot retrieval (slide, transcript, file text).
CREATE TABLE lecture_chunks (
    chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES classes(class_id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(session_id) ON DELETE CASCADE,
    file_id UUID REFERENCES lecture_files(file_id) ON DELETE CASCADE,
    slide_id UUID REFERENCES lecture_slides(slide_id) ON DELETE CASCADE,
    transcript_id UUID REFERENCES transcripts(transcript_id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
    chunk_text TEXT NOT NULL,
    language VARCHAR(10) CHECK (language IN ('EN','VI','MIXED','UNKNOWN')),
    page_number INTEGER CHECK (page_number IS NULL OR page_number > 0),
    start_seconds NUMERIC(12,3),
    end_seconds NUMERIC(12,3),
    -- Embedding storage is deliberately omitted until pgvector/model dimensions are chosen.
    source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (class_id IS NOT NULL OR session_id IS NOT NULL OR file_id IS NOT NULL OR slide_id IS NOT NULL OR transcript_id IS NOT NULL),
    CHECK (end_seconds IS NULL OR start_seconds IS NULL OR end_seconds >= start_seconds)
);

-- ---------------------------------------------------------------------
-- 6. AI LESSON NOTES / VERSIONS / STUDENT NOTES / DOMAIN KEYWORDS
-- JSONB fields represent sections rendered in Lesson Summary UI.
-- ---------------------------------------------------------------------
CREATE TABLE lesson_summaries (
    summary_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    generated_by_lecturer_id UUID REFERENCES lecturers(lecturer_id) ON DELETE SET NULL,
    lesson_title VARCHAR(255),
    detected_subject VARCHAR(200),
    overview TEXT,
    lecture_structure JSONB NOT NULL DEFAULT '[]'::jsonb,
    key_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
    vocabulary JSONB NOT NULL DEFAULT '[]'::jsonb,
    examples JSONB NOT NULL DEFAULT '[]'::jsonb,
    key_takeaways JSONB NOT NULL DEFAULT '[]'::jsonb,
    further_clarification JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_transcript_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    model_name VARCHAR(120),
    generation_status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (generation_status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lesson_summary_versions (
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_id UUID NOT NULL REFERENCES lesson_summaries(summary_id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    summary_data JSONB NOT NULL,
    created_by_lecturer_id UUID REFERENCES lecturers(lecturer_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (summary_id, version_number)
);

CREATE TABLE student_notes (
    note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(session_id) ON DELETE SET NULL,
    summary_id UUID REFERENCES lesson_summaries(summary_id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    source_type VARCHAR(20) NOT NULL DEFAULT 'PERSONAL' CHECK (source_type IN ('PERSONAL','AI_COPY','LECTURER')),
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE domain_keywords (
    keyword_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(course_id) ON DELETE CASCADE,
    class_id UUID REFERENCES classes(class_id) ON DELETE CASCADE,
    summary_id UUID REFERENCES lesson_summaries(summary_id) ON DELETE CASCADE,
    term_en VARCHAR(255) NOT NULL,
    term_vi VARCHAR(255),
    definition_en TEXT,
    explanation_vi TEXT,
    example_text TEXT,
    source_type VARCHAR(20) NOT NULL DEFAULT 'AI' CHECK (source_type IN ('AI','LECTURER','IMPORTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (course_id IS NOT NULL OR class_id IS NOT NULL OR summary_id IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- 7. STUDENT QUESTIONS / SEMANTIC GROUPING / ANSWERS
-- ---------------------------------------------------------------------
CREATE TABLE questions (
    question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_session_id UUID NOT NULL REFERENCES student_sessions(student_session_id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    slide_id UUID REFERENCES lecture_slides(slide_id) ON DELETE SET NULL,
    original_text TEXT NOT NULL,
    language VARCHAR(20) NOT NULL CHECK (language IN ('EN','VI','MIXED')),
    translated_text TEXT,
    normalized_text TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','GROUPED','ANSWERED','CLOSED')),
    is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE question_groups (
    group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    slide_id UUID REFERENCES lecture_slides(slide_id) ON DELETE SET NULL,
    representative_question_id UUID REFERENCES questions(question_id) ON DELETE SET NULL,
    group_title VARCHAR(255),
    topic_label VARCHAR(255),
    group_summary TEXT,
    similarity_threshold NUMERIC(5,4) CHECK (similarity_threshold IS NULL OR similarity_threshold BETWEEN 0 AND 1),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ANSWERED','CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE question_group_members (
    group_member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES question_groups(group_id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    similarity_score NUMERIC(5,4) CHECK (similarity_score IS NULL OR similarity_score BETWEEN 0 AND 1),
    assigned_by VARCHAR(20) NOT NULL DEFAULT 'AI' CHECK (assigned_by IN ('AI','MANUAL')),
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_at TIMESTAMPTZ,
    UNIQUE (group_id, question_id),
    CHECK ((is_current AND removed_at IS NULL) OR (NOT is_current))
);
CREATE UNIQUE INDEX uq_question_single_current_group ON question_group_members(question_id) WHERE is_current = TRUE;

CREATE TABLE answers (
    answer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES question_groups(group_id) ON DELETE CASCADE,
    lecturer_id UUID NOT NULL REFERENCES lecturers(lecturer_id) ON DELETE RESTRICT,
    answer_en TEXT NOT NULL,
    answer_vi TEXT NOT NULL,
    source_type VARCHAR(20) NOT NULL DEFAULT 'LECTURER' CHECK (source_type IN ('LECTURER','CHATBOT_ESCALATION')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE answer_recipients (
    answer_recipient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    answer_id UUID NOT NULL REFERENCES answers(answer_id) ON DELETE CASCADE,
    student_session_id UUID NOT NULL REFERENCES student_sessions(student_session_id) ON DELETE CASCADE,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    preferred_language VARCHAR(2) CHECK (preferred_language IN ('en','vi')),
    UNIQUE (answer_id, student_session_id)
);

-- ---------------------------------------------------------------------
-- 8. SLIDE INTERACTION / CHAT / CHATBOT
-- Interaction events can be questions, reactions, annotations, or chat messages.
-- ---------------------------------------------------------------------
CREATE TABLE slide_interactions (
    interaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    slide_id UUID NOT NULL REFERENCES lecture_slides(slide_id) ON DELETE CASCADE,
    student_session_id UUID REFERENCES student_sessions(student_session_id) ON DELETE SET NULL,
    lecturer_id UUID REFERENCES lecturers(lecturer_id) ON DELETE SET NULL,
    interaction_type VARCHAR(25) NOT NULL CHECK (interaction_type IN ('QUESTION','REACTION','ANNOTATION','POLL_RESPONSE','CHAT_REFERENCE','CONFUSION')),
    content TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (student_session_id IS NOT NULL OR lecturer_id IS NOT NULL)
);

CREATE TABLE session_chats (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    student_session_id UUID REFERENCES student_sessions(student_session_id) ON DELETE SET NULL,
    lecturer_id UUID REFERENCES lecturers(lecturer_id) ON DELETE SET NULL,
    sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('STUDENT','LECTURER','SYSTEM')),
    message_text TEXT NOT NULL,
    language VARCHAR(10) CHECK (language IN ('EN','VI','MIXED')),
    slide_id UUID REFERENCES lecture_slides(slide_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((sender_role='STUDENT' AND student_session_id IS NOT NULL) OR
           (sender_role='LECTURER' AND lecturer_id IS NOT NULL) OR sender_role='SYSTEM')
);

CREATE TABLE chatbot_conversations (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(session_id) ON DELETE SET NULL,
    class_id UUID REFERENCES classes(class_id) ON DELETE SET NULL,
    student_id UUID REFERENCES students(student_id) ON DELETE CASCADE,
    student_session_id UUID REFERENCES student_sessions(student_session_id) ON DELETE CASCADE,
    title VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (student_id IS NOT NULL OR student_session_id IS NOT NULL)
);

CREATE TABLE chatbot_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES chatbot_conversations(conversation_id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('STUDENT','CHATBOT','LECTURER','SYSTEM')),
    message_text TEXT NOT NULL,
    language VARCHAR(10) CHECK (language IN ('EN','VI','MIXED')),
    answer_status VARCHAR(25) CHECK (answer_status IN ('ANSWERED_FROM_MATERIAL','NO_SOURCE_FOUND','ESCALATED_TO_LECTURER','ERROR')),
    source_chunk_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    confidence NUMERIC(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    model_name VARCHAR(120),
    processing_time_ms INTEGER CHECK (processing_time_ms IS NULL OR processing_time_ms >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chatbot_escalations (
    escalation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES chatbot_conversations(conversation_id) ON DELETE CASCADE,
    student_message_id UUID NOT NULL REFERENCES chatbot_messages(message_id) ON DELETE CASCADE,
    assigned_lecturer_id UUID REFERENCES lecturers(lecturer_id) ON DELETE SET NULL,
    related_question_id UUID REFERENCES questions(question_id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','ANSWERED','CLOSED')),
    lecturer_response_en TEXT,
    lecturer_response_vi TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    answered_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- 9. QUICK QUESTIONS / QUIZZES
-- ---------------------------------------------------------------------
CREATE TABLE quick_questions (
    quick_question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    lecturer_id UUID NOT NULL REFERENCES lecturers(lecturer_id) ON DELETE RESTRICT,
    slide_id UUID REFERENCES lecture_slides(slide_id) ON DELETE SET NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) NOT NULL DEFAULT 'POLL' CHECK (question_type IN ('POLL','MULTIPLE_CHOICE','TRUE_FALSE','SHORT_ANSWER','ORDERING','MATCHING')),
    question_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    time_limit_seconds INTEGER CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (closed_at IS NULL OR opened_at IS NULL OR closed_at >= opened_at)
);

CREATE TABLE quick_question_options (
    option_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quick_question_id UUID NOT NULL REFERENCES quick_questions(quick_question_id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    option_order SMALLINT NOT NULL CHECK (option_order > 0),
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    image_data BYTEA,
    image_mime_type VARCHAR(50),
    image_name VARCHAR(255),
    UNIQUE (quick_question_id, option_order)
);

CREATE TABLE quick_question_responses (
    response_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quick_question_id UUID NOT NULL REFERENCES quick_questions(quick_question_id) ON DELETE CASCADE,
    student_session_id UUID NOT NULL REFERENCES student_sessions(student_session_id) ON DELETE CASCADE,
    selected_option_id UUID REFERENCES quick_question_options(option_id) ON DELETE SET NULL,
    answer_text TEXT,
    is_correct BOOLEAN,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (quick_question_id, student_session_id)
);

-- ---------------------------------------------------------------------
-- 10. ANALYTICS / DASHBOARDS / FEEDBACK / AUDIT LOG
-- Dashboard values should normally be calculated from event tables or refreshed views.
-- ---------------------------------------------------------------------
CREATE TABLE session_statistics (
    statistic_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE REFERENCES sessions(session_id) ON DELETE CASCADE,
    total_students INTEGER NOT NULL DEFAULT 0 CHECK (total_students >= 0),
    active_students INTEGER NOT NULL DEFAULT 0 CHECK (active_students >= 0),
    total_questions INTEGER NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
    total_groups INTEGER NOT NULL DEFAULT 0 CHECK (total_groups >= 0),
    answered_groups INTEGER NOT NULL DEFAULT 0 CHECK (answered_groups >= 0),
    unanswered_groups INTEGER NOT NULL DEFAULT 0 CHECK (unanswered_groups >= 0),
    avg_students_per_group NUMERIC(10,2) NOT NULL DEFAULT 0,
    question_reduction_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (question_reduction_rate BETWEEN 0 AND 100),
    answer_coverage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (answer_coverage BETWEEN 0 AND 100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE confusion_metrics (
    metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    slide_id UUID REFERENCES lecture_slides(slide_id) ON DELETE SET NULL,
    group_id UUID REFERENCES question_groups(group_id) ON DELETE SET NULL,
    topic_label VARCHAR(255),
    question_count INTEGER NOT NULL DEFAULT 0 CHECK (question_count >= 0),
    distinct_student_count INTEGER NOT NULL DEFAULT 0 CHECK (distinct_student_count >= 0),
    window_start TIMESTAMPTZ,
    window_end TIMESTAMPTZ,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (window_end IS NULL OR window_start IS NULL OR window_end >= window_start)
);

CREATE TABLE session_feedback (
    feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(student_id) ON DELETE SET NULL,
    student_session_id UUID REFERENCES student_sessions(student_session_id) ON DELETE SET NULL,
    lecturer_id UUID REFERENCES lecturers(lecturer_id) ON DELETE SET NULL,
    respondent_role VARCHAR(20) NOT NULL CHECK (respondent_role IN ('STUDENT','LECTURER')),
    rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
    feedback_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((respondent_role='STUDENT' AND (student_id IS NOT NULL OR student_session_id IS NOT NULL)) OR
           (respondent_role='LECTURER' AND lecturer_id IS NOT NULL))
);

CREATE TABLE audit_logs (
    log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_role VARCHAR(20) NOT NULL CHECK (actor_role IN ('ADMIN','LECTURER','STUDENT','SYSTEM')),
    admin_id UUID REFERENCES admins(admin_id) ON DELETE SET NULL,
    lecturer_id UUID REFERENCES lecturers(lecturer_id) ON DELETE SET NULL,
    student_id UUID REFERENCES students(student_id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    description TEXT,
    ip_address INET,
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((actor_role='ADMIN' AND admin_id IS NOT NULL AND lecturer_id IS NULL AND student_id IS NULL) OR
           (actor_role='LECTURER' AND lecturer_id IS NOT NULL AND admin_id IS NULL AND student_id IS NULL) OR
           (actor_role='STUDENT' AND student_id IS NOT NULL AND admin_id IS NULL AND lecturer_id IS NULL) OR
           (actor_role='SYSTEM' AND admin_id IS NULL AND lecturer_id IS NULL AND student_id IS NULL))
);

-- ---------------------------------------------------------------------
-- 11. INDEXES FOR COMMON UI QUERIES
-- ---------------------------------------------------------------------
CREATE INDEX idx_classes_lecturer ON classes(lecturer_id);
CREATE INDEX idx_classes_course ON classes(course_id);
CREATE INDEX idx_class_members_class_status ON class_members(class_id, status);
CREATE INDEX idx_class_members_student_status ON class_members(student_id, status);
CREATE INDEX idx_schedules_start_time ON class_schedules(start_time);
CREATE INDEX idx_schedules_class_start ON class_schedules(class_id, start_time);
CREATE INDEX idx_sessions_class_status ON sessions(class_id, status);
CREATE INDEX idx_student_sessions_session_active ON student_sessions(session_id, is_active);
CREATE INDEX idx_lecture_files_class ON lecture_files(class_id, uploaded_at DESC);
CREATE INDEX idx_slides_session_number ON lecture_slides(session_id, slide_number);
CREATE INDEX idx_transcripts_session_chunk ON transcripts(session_id, chunk_index);
CREATE INDEX idx_translations_transcript ON transcript_translations(transcript_id);
CREATE INDEX idx_lecture_chunks_session ON lecture_chunks(session_id);
CREATE INDEX idx_lecture_chunks_file ON lecture_chunks(file_id);
CREATE INDEX idx_summaries_session_created ON lesson_summaries(session_id, created_at DESC);
CREATE INDEX idx_student_notes_student_updated ON student_notes(student_id, updated_at DESC);
CREATE INDEX idx_keywords_course ON domain_keywords(course_id);
CREATE INDEX idx_questions_session_created ON questions(session_id, created_at);
CREATE INDEX idx_questions_student_session ON questions(student_session_id);
CREATE INDEX idx_questions_status ON questions(status);
CREATE INDEX idx_question_groups_session_status ON question_groups(session_id, status);
CREATE INDEX idx_group_members_group ON question_group_members(group_id);
CREATE INDEX idx_answers_group_created ON answers(group_id, created_at);
CREATE INDEX idx_answer_recipients_student_read ON answer_recipients(student_session_id, is_read);
CREATE INDEX idx_slide_interactions_slide_time ON slide_interactions(slide_id, created_at);
CREATE INDEX idx_slide_interactions_session_type ON slide_interactions(session_id, interaction_type);
CREATE INDEX idx_session_chats_session_time ON session_chats(session_id, created_at);
CREATE INDEX idx_chatbot_conversations_student ON chatbot_conversations(student_id, updated_at DESC);
CREATE INDEX idx_chatbot_messages_conversation ON chatbot_messages(conversation_id, created_at);
CREATE INDEX idx_quick_questions_session ON quick_questions(session_id, created_at);
CREATE INDEX idx_quick_responses_question ON quick_question_responses(quick_question_id);
CREATE INDEX idx_confusion_metrics_session ON confusion_metrics(session_id, calculated_at DESC);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_actor_admin ON audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor_lecturer ON audit_logs(lecturer_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor_student ON audit_logs(student_id, created_at DESC);
CREATE INDEX idx_otp_contact_purpose ON otp_verifications(contact_value, purpose, created_at DESC);

-- ---------------------------------------------------------------------
-- 12. DASHBOARD VIEWS
-- Admin overview and per-slide interaction counts. These are normal views,
-- so they reflect current source data and don't require manual counter updates.
-- ---------------------------------------------------------------------
CREATE VIEW v_admin_dashboard AS
SELECT
    (SELECT COUNT(*) FROM admins WHERE is_active) AS active_admins,
    (SELECT COUNT(*) FROM lecturers WHERE is_active) AS active_lecturers,
    (SELECT COUNT(*) FROM students WHERE is_active) AS active_students,
    (SELECT COUNT(*) FROM classes WHERE status='ACTIVE') AS active_classes,
    (SELECT COUNT(*) FROM sessions WHERE status='LIVE') AS live_sessions,
    (SELECT COUNT(*) FROM questions WHERE status='PENDING') AS pending_questions;

CREATE VIEW v_slide_interaction_summary AS
SELECT
    ls.slide_id,
    ls.session_id,
    s.class_id,
    ls.slide_number,
    ls.title AS slide_title,
    COUNT(DISTINCT si.interaction_id) AS interaction_count,
    COUNT(DISTINCT q.question_id) AS question_count,
    COUNT(DISTINCT ss.student_id) AS distinct_students
FROM lecture_slides ls
JOIN sessions s ON s.session_id = ls.session_id
LEFT JOIN slide_interactions si ON si.slide_id = ls.slide_id
LEFT JOIN questions q ON q.slide_id = ls.slide_id
LEFT JOIN student_sessions ss ON ss.student_session_id = si.student_session_id
GROUP BY ls.slide_id, ls.session_id, s.class_id, ls.slide_number, ls.title;

COMMIT;

-- Schema verification:
-- SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
-- SELECT * FROM v_admin_dashboard;
