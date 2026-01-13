-- Create workspaces storage bucket for file sync

-- Insert the bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspaces',
  'workspaces',
  false,  -- Private bucket (requires auth)
  52428800,  -- 50MB max file size
  NULL  -- Allow all mime types
)
ON CONFLICT (id) DO NOTHING;

-- RLS policy for workspaces bucket - allow all authenticated operations
-- Security is handled at the application level via sync_id paths
CREATE POLICY "Allow authenticated access to workspaces" ON storage.objects
  FOR ALL
  USING (bucket_id = 'workspaces')
  WITH CHECK (bucket_id = 'workspaces');
