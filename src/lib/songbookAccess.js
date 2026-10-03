/** Production editing uses the existing site-admin grant, never a songbook role. */
export function songbookEditAccess({ ready = false, admin = false, role = null, demo = false, reviewPreview = false, songbookPreview = false } = {}) {
  if (!ready || (reviewPreview && !songbookPreview)) return { canEdit: false, canRate: false };
  // Existing review tables remain isolated; their historical permissions are unchanged.
  if (reviewPreview && songbookPreview) return {
    canEdit: demo === true || admin === true || role === 'owner' || role === 'manager',
    canRate: demo === true || role === 'owner',
  };
  return { canEdit: admin === true, canRate: admin === true };
}
