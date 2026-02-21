// Reserved terms that cannot be used in display names or email prefixes
const RESERVED_TERMS = [
  'admin', 'administrateur', 'administrator',
  'moderateur', 'moderator', 'modo',
  'support', 'staff', 'system', 'système',
  'streamflix', 'official', 'officiel',
  'root', 'superuser', 'superadmin',
  'helpdesk', 'service', 'bot',
];

/**
 * Checks if a string contains any reserved/sensitive term.
 * Strips special characters and spaces to prevent bypass attempts.
 * Returns the matched term or null if clean.
 */
export function findReservedTerm(value: string): string | null {
  if (!value) return null;
  // Normalize: lowercase, strip non-alpha chars to catch "a d m i n" or "a.d.m.i.n"
  const normalized = value
    .toLowerCase()
    .replace(/[^a-zàâäéèêëïîôùûüÿçœæ0-9]/g, '');

  for (const term of RESERVED_TERMS) {
    if (normalized.includes(term)) return term;
  }
  return null;
}

/**
 * Validates that an email's local part doesn't contain reserved terms.
 */
export function findReservedTermInEmail(email: string): string | null {
  if (!email) return null;
  const localPart = email.split('@')[0] || '';
  return findReservedTerm(localPart);
}
