// Shared by the form and the server. Passwords are compared verbatim, never trimmed.
export function validatePasswordChange(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { code: 'invalid_request' };
  if (typeof value.currentPassword !== 'string' || !value.currentPassword.length || value.currentPassword.length > 256) {
    return { code: 'current_password_required', field: 'currentPassword' };
  }
  if (typeof value.newPassword !== 'string' || value.newPassword.length < 8 || value.newPassword.length > 128) {
    return { code: 'weak_password', field: 'newPassword' };
  }
  if (typeof value.confirmPassword !== 'string' || value.newPassword !== value.confirmPassword) {
    return { code: 'password_mismatch', field: 'confirmPassword' };
  }
  if (value.newPassword === value.currentPassword) return { code: 'same_password', field: 'newPassword' };
  return null;
}
