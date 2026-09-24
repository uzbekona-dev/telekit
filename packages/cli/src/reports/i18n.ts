/** `resources[locale][key] = template`, keys `"<namespace>.<path>"` — the shape `@telekit/core`'s `loadLocaleResources()` returns. */
export type LocaleResources = Record<string, Record<string, string>>;

export interface I18nReport {
  lines: string[];
  hasProblems: boolean;
  /** Set when the report can't be built at all (no reference locale) — `lines` is empty then. */
  error?: string;
}

function namespaceOf(key: string): string {
  return key.split(".")[0]!;
}

function groupByNamespace(keys: string[]): Map<string, string[]> {
  const byNamespace = new Map<string, string[]>();
  for (const key of keys) {
    const namespace = namespaceOf(key);
    byNamespace.set(namespace, [...(byNamespace.get(namespace) ?? []), key]);
  }
  return byNamespace;
}

function localeLines(locale: string, keys: Set<string>, referenceKeys: Set<string>, referenceNamespaces: string[]) {
  const lines: string[] = [];
  const missing = [...referenceKeys].filter((k) => !keys.has(k)).sort();
  const extra = [...keys].filter((k) => !referenceKeys.has(k)).sort();
  const missingByNamespace = groupByNamespace(missing);

  for (const namespace of referenceNamespaces) {
    const namespaceMissing = missingByNamespace.get(namespace) ?? [];
    if (namespaceMissing.length === 0) {
      lines.push(`${locale}/${namespace}.json        ✓`);
      continue;
    }
    lines.push(`${locale}/${namespace}.json        ${namespaceMissing.length} ta kalit yetishmayapti`);
    lines.push(...namespaceMissing.map((key) => `  ${key}`));
  }

  if (extra.length > 0) {
    lines.push("", `${extra.length} ta ortiqcha kalit: ${extra.map((k) => `${locale}/${namespaceOf(k)}.json → ${k}`).join(", ")}`);
  }
  lines.push("");
  return { lines, hasProblems: missing.length > 0 || extra.length > 0 };
}

/** `telekit i18n:check` (spec §26.6): every locale's keys against the reference locale's — missing ones per namespace, extra ones overall. */
export function buildI18nReport(resources: LocaleResources, referenceLocale: string): I18nReport {
  const reference = resources[referenceLocale];
  if (!reference) {
    return {
      lines: [],
      hasProblems: true,
      error: `Reference locale "${referenceLocale}" uchun resources/locales/${referenceLocale}/ topilmadi.`,
    };
  }

  const referenceKeys = new Set(Object.keys(reference));
  const referenceNamespaces = [...groupByNamespace([...referenceKeys]).keys()].sort();
  const lines: string[] = [];
  let hasProblems = false;

  for (const locale of Object.keys(resources).sort()) {
    if (locale === referenceLocale) continue;
    const report = localeLines(locale, new Set(Object.keys(resources[locale]!)), referenceKeys, referenceNamespaces);
    lines.push(...report.lines);
    hasProblems ||= report.hasProblems;
  }
  lines.push(...referenceNamespaces.map((namespace) => `${referenceLocale}/${namespace}.json        ✓  (reference)`));

  return { lines, hasProblems };
}
