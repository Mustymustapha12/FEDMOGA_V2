import { HttpError } from "./security";
import { type Section, defaultSections } from "../app/form-config";
export { defaultSections };
export function validateForm(value: unknown): { sections: Section[] } {
  const v = value as { sections: Section[] };
  if (
    !v ||
    !Array.isArray(v.sections) ||
    v.sections.length < 1 ||
    v.sections.length > 20
  )
    throw new HttpError("Use between 1 and 20 sections");
  const ids = new Set<string>();
  let count = 0;
  for (const section of v.sections) {
    if (
      typeof section.title !== "string" ||
      !section.title.trim() ||
      section.title.length > 120 ||
      !Array.isArray(section.fields)
    )
      throw new HttpError("Invalid section");
    for (const f of section.fields) {
      if (
        ++count > 100 ||
        !f ||
        typeof f.id !== "string" ||
        !/^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(f.id) ||
        ["constructor", "prototype", "__proto__"].includes(f.id) ||
        ids.has(f.id) ||
        typeof f.label !== "string" ||
        !f.label.trim() ||
        f.label.length > 500 ||
        typeof f.required !== "boolean" ||
        ![
          "text",
          "textarea",
          "email",
          "tel",
          "date",
          "number",
          "checkbox",
        ].includes(f.type)
      )
        throw new HttpError("Invalid or duplicate field");
      ids.add(f.id);
    }
  }
  for (const [id, type] of [
    ["fullName", "text"],
    ["phone", "tel"],
    ["email", "email"],
    ["consent", "checkbox"],
  ]) {
    const f = v.sections.flatMap((s) => s.fields).find((f) => f.id === id);
    if (!f || !f.required || f.type !== type)
      throw new HttpError(
        "Name, phone, email and consent must remain required with their original types",
      );
  }
  return {
    sections: v.sections.map((s) => ({
      title: s.title,
      fields: s.fields.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        required: f.required,
      })),
    })),
  };
}
export function validateAnswers(
  sections: Section[],
  input: unknown,
  email: string,
): Record<string, string | boolean> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HttpError("Invalid registration");
  const raw = input as Record<string, unknown>,
    clean: Record<string, string | boolean> = {};
  for (const f of sections.flatMap((s) => s.fields)) {
    const value = raw[f.id];
    if (f.type === "checkbox") {
      if (value !== true && value !== false)
        throw new HttpError(`${f.label} must be a checkbox`);
      if (f.required && !value) throw new HttpError(`${f.label} is required`);
      clean[f.id] = value;
      continue;
    }
    if (value !== undefined && typeof value !== "string")
      throw new HttpError(`Invalid ${f.label}`);
    const text = String(value ?? "").trim();
    if (text.length > 4000 || (f.required && !text))
      throw new HttpError(`${f.label} is required or too long`);
    if (text && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
      throw new HttpError(`Invalid ${f.label}`);
    if (text && f.type === "number" && !Number.isFinite(Number(text)))
      throw new HttpError(`Invalid ${f.label}`);
    if (
      text &&
      f.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text)))
    )
      throw new HttpError(`Invalid ${f.label}`);
    clean[f.id] = text;
  }
  if (clean.consent !== true) throw new HttpError("Consent is required");
  if (String(clean.email).toLowerCase() !== email.toLowerCase())
    throw new HttpError("Use the same email address as your payment");
  return clean;
}
