-- Migration: Create usr_activities table
-- Description: Stores logs of user actions with metadata.

CREATE TABLE IF NOT EXISTS usr_activities (
    id BIGSERIAL PRIMARY KEY,
    id_usr BIGINT NOT NULL, -- Assumes your user ID is numeric. Adjust to UUID if necessary.
    action VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    usr_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient fetching of activities by user, ordered by date (for cursor pagination)
CREATE INDEX IF NOT EXISTS idx_usr_activities_id_usr_created_at 
ON usr_activities(id_usr, created_at DESC);

-- Index to quickly count or find specific actions globally (optional but good for analytics)
CREATE INDEX IF NOT EXISTS idx_usr_activities_action 
ON usr_activities(action);
