
CREATE POLICY "resumes_bucket_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'resumes');
CREATE POLICY "resumes_bucket_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resumes');
CREATE POLICY "resumes_bucket_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'resumes' AND owner = auth.uid());
CREATE POLICY "resumes_bucket_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resumes' AND (owner = auth.uid() OR public.is_admin(auth.uid())));
